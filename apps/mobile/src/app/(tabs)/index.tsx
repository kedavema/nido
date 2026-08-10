import type {
  Category,
  CategoryBreakdownItem,
  HouseholdMember,
  MonthlySummaryResponse,
  Occurrence,
  PaymentSource,
  RecurringItem,
  Transaction,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { messageForActionError, useSession } from '@/auth/session-provider';
import { getSummaryCache } from '@/cache/summary-cache';
import { BudgetCommitmentsCard } from '@/components/budget-projection';
import { categoryTint } from '@/utils/category-appearance';
import { MAX_CATEGORY_ROWS, categoryBreakdownRemainder } from '@/utils/category-breakdown';
import { DashboardBudget } from '@/components/dashboard-budget';
import { MonthStepper } from '@/components/month-stepper';
import {
  ActionButton,
  AppScreen,
  Card,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  PressableScale,
  SummarySkeleton,
} from '@/components/m1-ui';
import { navigateToFijoDetail, navigateToSettleOccurrence } from '@/navigation/fijos-routes';
import { navigateToIngresos } from '@/navigation/ingresos-routes';
import { navigateToNewExpense } from '@/navigation/new-expense-route';
import { cardShadowStyle } from '@/theme/styles';
import { themeTokens } from '@/theme/tokens';
import {
  categoryLabel,
  daysRemainingInCurrentMonth,
  formatMonthLabel,
  formatMonthQueryParam,
  formatOccurredAtTime,
  formatPygMagnitude,
  formatRecentMovementDateLabel,
  formatSignedPygAmount,
  formatTransactionAmount,
  futureMonthSubtitle,
  isCurrentMonth,
  monthFromLocalDate,
  monthLocalDateRange,
  shiftMonth,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

const EMPTY_CATEGORIES: readonly Category[] = [];
const EMPTY_PAYMENT_SOURCES: readonly PaymentSource[] = [];
const EMPTY_MEMBERS: readonly HouseholdMember[] = [];

// GLO-02's "de {HH:MM}" / "último intento {HH:MM}" times are about this device's clock (when the
// cache was written / the retry was attempted locally), not the household's business timezone —
// unlike movement timestamps, which always use HOUSEHOLD_TIMEZONE.
const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

type CatalogState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
      readonly recurringItems: readonly RecurringItem[];
    };

type OccurrencesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly occurrences: readonly Occurrence[] };

// Only used for the INI-02 header avatars and the INI-01 true-first-run heuristic below — neither
// is critical enough to warrant its own error UI, so a failed fetch just degrades quietly (no
// avatars, generic empty-month card) the same way mas.tsx's payment-source preview does.
type MembersState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly members: readonly HouseholdMember[] };

type SummaryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      // GLO-02: the fetch failed but a previous successful fetch for this same household+month
      // was cached locally, so we show that instead of an empty error screen (docs/system-design.md
      // §6.9). `status`/`lastAttemptAt` back the collapsed-by-default "Detalles" technical line.
      readonly kind: 'error-with-cache';
      readonly status: number | undefined;
      readonly summary: MonthlySummaryResponse;
      readonly cachedAt: string;
      readonly lastAttemptAt: string;
    }
  | { readonly kind: 'loaded'; readonly summary: MonthlySummaryResponse };

/** "24" / "7,5" — trims trailing zeros from the service's 2-decimal percentage without rounding. */
function formatPercentage(value: number): string {
  const text = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2).replace(/0$/u, '');
  return text.replace('.', ',');
}

/** A month has no movements at all yet — distinct from a loading/error state (GLO-03). */
function isEmptyMonth(summary: MonthlySummaryResponse): boolean {
  return (
    summary.incomeTotal === '0' &&
    summary.expenseTotal === '0' &&
    summary.recentTransactions.length === 0
  );
}

/**
 * INI-01's true first-run state ("the household has never had any transaction, ever") vs. GLO-03's
 * generic "this particular month is empty" card. The summary endpoint has no household-lifetime
 * signal, and this screen intentionally avoids adding a new API call just to get one precisely, so
 * this is a heuristic built from data already fetched here:
 *
 * - The viewed month must be the real current month — an empty *past* month (or a future one,
 *   which is always empty) says nothing about whether the household is brand new.
 * - The household must have no other ACTIVE member yet besides the viewer. A household that has
 *   onboarded a second member has almost certainly used the app for a while (the pending-invite
 *   case in INI-01 itself has zero other ACTIVE members, which is why this still fires there).
 *
 * This can still misfire for a genuinely solo household that has used Nido for months without ever
 * inviting anyone and happens to have an empty current month — it would see the first-run
 * checklist again. That's judged an acceptable false positive: the checklist is harmless to show
 * again (all three items are still valid next actions), unlike showing the generic "no movements"
 * copy to someone who has truly never used the app.
 */
function isTrueFirstRun(
  month: MonthValue,
  todayLocal: string,
  membersState: MembersState,
): boolean {
  if (!isCurrentMonth(month, todayLocal)) {
    return false;
  }
  if (membersState.kind !== 'loaded') {
    return false;
  }
  const otherActiveMembers = membersState.members.filter(
    (member) => member.status === 'ACTIVE',
  ).length;
  return otherActiveMembers <= 1;
}

export default function InicioScreen() {
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const summaryCache = useMemo(() => getSummaryCache(), []);

  const [month, setMonth] = useState<MonthValue>(() => monthFromLocalDate(todayLocalDate()));
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: 'loading' });
  const [summaryState, setSummaryState] = useState<SummaryState>({ kind: 'loading' });
  const [membersState, setMembersState] = useState<MembersState>({ kind: 'loading' });
  const [occurrencesState, setOccurrencesState] = useState<OccurrencesState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const loadCatalog = useCallback(
    async (silent = false) => {
      if (household === null) return;
      if (!silent) setCatalogState({ kind: 'loading' });
      try {
        const [{ categories }, { paymentSources }, { recurringItems }] = await Promise.all([
          catalog.listCategories(household.id),
          catalog.listPaymentSources(household.id),
          catalog.listRecurringItems(household.id),
        ]);
        setCatalogState({ kind: 'loaded', categories, paymentSources, recurringItems });
      } catch (error) {
        setCatalogState({ kind: 'error', message: messageForActionError(error) });
      }
    },
    [catalog, household],
  );

  useEffect(() => {
    queueMicrotask(() => void loadCatalog());
  }, [loadCatalog]);

  const loadMembers = useCallback(
    async (silent = false) => {
      if (household === null) return;
      if (!silent) setMembersState({ kind: 'loading' });
      try {
        const { members } = await getMembers(household.id);
        setMembersState({ kind: 'loaded', members });
      } catch {
        setMembersState({ kind: 'error' });
      }
    },
    [getMembers, household],
  );

  useEffect(() => {
    queueMicrotask(() => void loadMembers());
  }, [loadMembers]);

  const loadSummary = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (household === null) return;
      if (!silent) setSummaryState({ kind: 'loading' });
      setErrorDetailsOpen(false);
      const monthParam = formatMonthQueryParam(month);
      try {
        const summary = await catalog.getMonthlySummary(household.id, { month: monthParam });
        // Always persisted, even if the user has since navigated away from this month/tab — a
        // fetch that did land is worth caching regardless of whether this screen still cares.
        await summaryCache.write(household.id, monthParam, summary);
        if (isActive()) {
          setSummaryState({ kind: 'loaded', summary });
        }
      } catch (error) {
        if (!isActive()) return;
        const cached = await summaryCache.read(household.id, monthParam);
        if (cached === undefined) {
          setSummaryState({ kind: 'error', message: messageForActionError(error) });
          return;
        }
        setSummaryState({
          kind: 'error-with-cache',
          status: error instanceof ApiError ? error.status : undefined,
          summary: cached.summary,
          cachedAt: cached.cachedAt,
          lastAttemptAt: new Date().toISOString(),
        });
      }
    },
    [catalog, household, month, summaryCache],
  );

  const loadOccurrences = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (household === null) return;
      if (!silent) setOccurrencesState({ kind: 'loading' });
      const { from, to } = monthLocalDateRange(month);
      try {
        const { occurrences } = await catalog.listOccurrences(household.id, {
          from,
          to,
          status: ['PENDING', 'OVERDUE'],
        });
        if (isActive()) setOccurrencesState({ kind: 'loaded', occurrences });
      } catch {
        if (isActive()) setOccurrencesState({ kind: 'error' });
      }
    },
    [catalog, household, month],
  );

  // Same stale-response guard as movimientos.tsx: without it, a slow response for a month the
  // user has since navigated away from (via month stepper or tab switch) can land after a faster
  // response for the current month and clobber it.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadSummary(() => active);
      void loadOccurrences(() => active);
      return () => {
        active = false;
      };
    }, [loadOccurrences, loadSummary]),
  );

  // Pull-to-refresh refetches the summary (and the catalog/members it renders with) silently, so
  // the dashboard cards stay put instead of collapsing to the skeleton mid-pull.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      loadSummary(() => true, true),
      loadCatalog(true),
      loadMembers(true),
      loadOccurrences(() => true, true),
    ]).finally(() => {
      setRefreshing(false);
    });
  }, [loadSummary, loadCatalog, loadMembers, loadOccurrences]);

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  const categories = catalogState.kind === 'loaded' ? catalogState.categories : EMPTY_CATEGORIES;
  const paymentSources =
    catalogState.kind === 'loaded' ? catalogState.paymentSources : EMPTY_PAYMENT_SOURCES;
  const members = membersState.kind === 'loaded' ? membersState.members : EMPTY_MEMBERS;
  const recurringItems =
    catalogState.kind === 'loaded' ? catalogState.recurringItems : ([] as const);
  const occurrences =
    occurrencesState.kind === 'loaded' ? occurrencesState.occurrences : ([] as const);
  const todayLocal = todayLocalDate();
  const monthSubtitle = futureMonthSubtitle(month, todayLocal);
  const daysRemaining = daysRemainingInCurrentMonth(month, todayLocal);
  const monthParam = formatMonthQueryParam(month);
  const openBudget = () => {
    router.push(`/presupuesto?month=${encodeURIComponent(monthParam)}`);
  };

  return (
    <AppScreen
      floatingAction={
        <PressableScale
          accessibilityLabel="Nuevo gasto"
          haptic
          onPress={() => {
            navigateToNewExpense();
          }}
          style={styles.fab}
        >
          <Text style={styles.fabLabel}>+ Nuevo gasto</Text>
        </PressableScale>
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.householdLabel}>{household.name}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {formatMonthLabel(month)}
            {daysRemaining === undefined ? null : (
              <Text style={styles.daysRemaining}>
                {' '}
                · quedan {daysRemaining.toString()} {daysRemaining === 1 ? 'día' : 'días'}
              </Text>
            )}
          </Text>
          {monthSubtitle === undefined ? null : (
            <Text style={styles.monthSubtitle}>{monthSubtitle}</Text>
          )}
        </View>
        <View style={styles.headerRightGroup}>
          <MonthStepper
            onNext={() => {
              setMonth((current) => shiftMonth(current, 1));
            }}
            onPrevious={() => {
              setMonth((current) => shiftMonth(current, -1));
            }}
          />
        </View>
      </View>

      {summaryState.kind === 'loading' || catalogState.kind === 'loading' ? (
        <SummarySkeleton />
      ) : null}

      {summaryState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{summaryState.message}</InlineNotice>
          <ActionButton
            label="Reintentar"
            onPress={() => void loadSummary(() => true)}
            variant="secondary"
          />
        </>
      ) : null}

      {summaryState.kind === 'error-with-cache' ? (
        <>
          <CachedSummaryNotice
            cachedAt={summaryState.cachedAt}
            detailsOpen={errorDetailsOpen}
            lastAttemptAt={summaryState.lastAttemptAt}
            onRetry={() => void loadSummary(() => true)}
            onToggleDetails={() => {
              setErrorDetailsOpen((current) => !current);
            }}
            status={summaryState.status}
          />
          <BalanceCard
            onPressIncome={() => {
              navigateToIngresos(formatMonthQueryParam(month));
            }}
            onToggleTooltip={() => {
              setTooltipOpen((current) => !current);
            }}
            summary={summaryState.summary}
            tooltipOpen={tooltipOpen}
          />
          <DashboardBudget
            budget={summaryState.summary.budget}
            monthLabel={formatMonthLabel(month).toLowerCase()}
            onOpenBudget={openBudget}
          />
          <RecentTransactionsCard
            categories={categories}
            paymentSources={paymentSources}
            todayLocal={todayLocal}
            transactions={summaryState.summary.recentTransactions}
          />
        </>
      ) : null}

      {catalogState.kind === 'error' ? (
        <InlineNotice tone="error">{catalogState.message}</InlineNotice>
      ) : null}

      {summaryState.kind === 'loaded' ? (
        <>
          {isEmptyMonth(summaryState.summary) ? (
            isTrueFirstRun(month, todayLocal, membersState) ? (
              <FirstRunBalanceCard month={month} />
            ) : (
              <Card>
                <Text style={m1TextStyles.sectionTitle}>
                  Aún no hay movimientos en {formatMonthLabel(month).toLowerCase()}
                </Text>
                <Text style={m1TextStyles.secondary}>
                  Cuando alguno de los dos cargue un gasto o marque un ingreso, aparece acá para
                  ambos.
                </Text>
                <ActionButton
                  label="Cargar un gasto"
                  onPress={() => {
                    navigateToNewExpense();
                  }}
                />
                {/* Without this the empty month is a dead end for income: the Balance card that
                    carries the only other route to the expected-income list is not rendered
                    here, so the copy above invites an action the screen cannot perform. */}
                <ActionButton
                  label="Registrar un ingreso"
                  onPress={() => {
                    navigateToIngresos(monthParam);
                  }}
                  variant="secondary"
                />
              </Card>
            )
          ) : (
            <BalanceCard
              onPressIncome={() => {
                navigateToIngresos(monthParam);
              }}
              onToggleTooltip={() => {
                setTooltipOpen((current) => !current);
              }}
              summary={summaryState.summary}
              tooltipOpen={tooltipOpen}
            />
          )}

          <DashboardBudget
            budget={summaryState.summary.budget}
            monthLabel={formatMonthLabel(month).toLowerCase()}
            onOpenBudget={openBudget}
          />

          {occurrencesState.kind === 'loaded' ? (
            <BudgetCommitmentsCard
              hideWhenEmpty
              label="PRÓXIMAS OBLIGACIONES"
              members={members}
              occurrences={occurrences}
              onOpenOccurrence={navigateToFijoDetail}
              onSettleOccurrence={navigateToSettleOccurrence}
              recurringItems={recurringItems}
              todayLocal={todayLocal}
            />
          ) : null}

          {isEmptyMonth(summaryState.summary) && isTrueFirstRun(month, todayLocal, membersState) ? (
            <FirstRunChecklistCard month={month} />
          ) : null}

          {!isEmptyMonth(summaryState.summary) &&
          summaryState.summary.categoryBreakdown.length > 0 ? (
            <CategoryBreakdownCard items={summaryState.summary.categoryBreakdown} />
          ) : null}

          {!isEmptyMonth(summaryState.summary) ? (
            <RecentTransactionsCard
              categories={categories}
              paymentSources={paymentSources}
              todayLocal={todayLocal}
              transactions={summaryState.summary.recentTransactions}
            />
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

/**
 * INI-01's true first-run "BALANCE REAL DE {MES}" card — replaces (not adds to) the generic
 * GLO-03 empty-month card when `isTrueFirstRun` fires. Renders "Gs. 0" directly rather than
 * through `formatSignedPygAmount` since a true zero has no sign in the reference (no leading "+").
 */
function FirstRunBalanceCard({ month }: { readonly month: MonthValue }) {
  return (
    <Card>
      <Text style={styles.cardLabel}>
        BALANCE REAL DE{' '}
        {formatMonthLabel(month)
          .replace(/\s\d{4}$/u, '')
          .toUpperCase()}
      </Text>
      <Text style={styles.balanceAmount}>Gs. 0</Text>
      <Text style={styles.balanceSubtitle}>Sin movimientos todavía — el nido está esperando.</Text>
    </Card>
  );
}

/** INI-01's "Empezá por acá" 3-item onboarding checklist, shown alongside `FirstRunBalanceCard`. */
function FirstRunChecklistCard({ month }: { readonly month: MonthValue }) {
  const monthName = formatMonthLabel(month)
    .replace(/\s\d{4}$/u, '')
    .toLowerCase();

  return (
    <Card>
      <Text style={m1TextStyles.sectionTitle}>Empezá por acá</Text>
      <ChecklistRow
        emphasized
        index={1}
        onPress={() => {
          navigateToNewExpense();
        }}
        subtitle="Tarda menos de 10 segundos"
        title="Cargá tu primer gasto"
        trailingLabel="Cargar"
      />
      <ChecklistRow
        index={2}
        onPress={() => {
          router.push('/presupuesto');
        }}
        subtitle="Un total y límites por categoría"
        title={`Definí el presupuesto de ${monthName}`}
      />
      <ChecklistRow
        index={3}
        onPress={() => {
          router.push('/fijos');
        }}
        subtitle="Alquiler, ANDE, ESSAP, internet..."
        title="Anotá sus gastos fijos"
      />
    </Card>
  );
}

/**
 * A single "Empezá por acá" row: a numbered badge (filled/dark for the actionable next step,
 * lighter for the following previews), title/subtitle, and either a compact "Cargar"-style
 * trailing label (item 1) or a plain chevron (items 2/3, which land on still-stub tabs today).
 */
function ChecklistRow({
  index,
  title,
  subtitle,
  emphasized = false,
  trailingLabel,
  onPress,
}: {
  readonly index: number;
  readonly title: string;
  readonly subtitle: string;
  readonly emphasized?: boolean;
  readonly trailingLabel?: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.checklistRow, pressed && styles.checklistRowPressed]}
    >
      <View
        style={[
          styles.checklistBadge,
          emphasized ? styles.checklistBadgeEmphasized : styles.checklistBadgeMuted,
        ]}
      >
        <Text
          style={[
            styles.checklistBadgeText,
            emphasized ? styles.checklistBadgeTextEmphasized : styles.checklistBadgeTextMuted,
          ]}
        >
          {index.toString()}
        </Text>
      </View>
      <View style={styles.checklistCopy}>
        <Text style={m1TextStyles.body}>{title}</Text>
        <Text style={m1TextStyles.secondary}>{subtitle}</Text>
      </View>
      {trailingLabel === undefined ? (
        <Ionicons color={themeTokens.colors.inkSecondary} name="chevron-forward" size={20} />
      ) : (
        <View style={styles.checklistButton}>
          <Text style={styles.checklistButtonLabel}>{trailingLabel}</Text>
        </View>
      )}
    </Pressable>
  );
}

function BalanceCard({
  summary,
  tooltipOpen,
  onToggleTooltip,
  onPressIncome,
}: {
  readonly summary: MonthlySummaryResponse;
  readonly tooltipOpen: boolean;
  readonly onToggleTooltip: () => void;
  readonly onPressIncome: () => void;
}) {
  const balance = formatSignedPygAmount(BigInt(summary.balance));
  // Reuses the same signed-amount formatter as a day's net (movement-format.ts) so the
  // "+Gs./−Gs." sign and BigInt-safe grouping stay identical across the app; the expense total is
  // negated so it renders with the same minus-sign convention as a day's expense movements.
  const income = formatSignedPygAmount(BigInt(summary.incomeTotal));
  const expense = formatSignedPygAmount(-BigInt(summary.expenseTotal));

  return (
    <Card>
      <Text style={styles.cardLabel}>BALANCE DEL MES</Text>
      <Text
        style={[
          styles.balanceAmount,
          balance.isPositive ? styles.positiveAmount : styles.negativeAmount,
        ]}
      >
        {balance.text}
      </Text>
      <Pressable
        accessibilityHint="No es un saldo bancario: Nido no calcula saldos de cuentas."
        accessibilityLabel="Qué es el balance del mes"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onToggleTooltip}
        style={styles.balanceSubtitleRow}
      >
        <Text style={styles.balanceSubtitle}>Ingresos recibidos − gastos reales</Text>
        <Ionicons
          color={themeTokens.colors.inkSecondary}
          name="information-circle-outline"
          size={16}
        />
      </Pressable>
      {tooltipOpen ? (
        <View style={styles.tooltipBox}>
          <Text style={styles.tooltipText}>
            No es un saldo bancario: Nido no calcula saldos de cuentas.
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.subtotalsRow}>
        <Pressable
          accessibilityHint="Abre la lista de ingresos esperados del mes"
          accessibilityLabel="Ingresos recibidos"
          accessibilityRole="button"
          onPress={onPressIncome}
          style={styles.subtotalColumn}
        >
          <View style={styles.subtotalLabelRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: themeTokens.semanticColors.success.foreground },
              ]}
            />
            <Text style={styles.subtotalLabel}>Ingresos recibidos</Text>
            <Ionicons color={themeTokens.colors.inkSecondary} name="chevron-forward" size={14} />
          </View>
          <Text style={[styles.subtotalAmount, styles.positiveAmount]}>{income.text}</Text>
        </Pressable>
        <View style={styles.subtotalColumn}>
          <View style={styles.subtotalLabelRow}>
            <View style={[styles.dot, { backgroundColor: themeTokens.colors.ink }]} />
            <Text style={styles.subtotalLabel}>Gastos reales</Text>
          </View>
          <Text style={styles.subtotalAmount}>{expense.text}</Text>
        </View>
      </View>
    </Card>
  );
}

function CategoryBreakdownCard({ items }: { readonly items: readonly CategoryBreakdownItem[] }) {
  const topItems = items.slice(0, MAX_CATEGORY_ROWS);
  const remainder = categoryBreakdownRemainder(items);

  return (
    <Card>
      <Text style={styles.cardLabel}>TOP CATEGORÍAS DEL MES</Text>
      {topItems.map((item) => {
        const widthPercent = `${Math.min(item.percentage, 100).toFixed(4)}%` as `${number}%`;

        return (
          <View key={item.categoryId} style={styles.categoryRow}>
            <View style={styles.categoryHeaderRow}>
              <Text numberOfLines={1} style={styles.categoryName}>
                {item.categoryName}
              </Text>
              <Text style={styles.categoryAmount}>
                Gs. {formatPygMagnitude(item.amount)} · {formatPercentage(item.percentage)} %
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: widthPercent }]} />
            </View>
          </View>
        );
      })}
      {remainder === undefined ? null : (
        <Pressable
          accessibilityHint="Abre el informe de categorías del mes"
          accessibilityLabel={`${remainder.label}. Gs. ${formatPygMagnitude(remainder.amount)}, ${formatPercentage(remainder.percentage)} por ciento, en ${remainder.categoryCount.toString()} categorías`}
          accessibilityRole="button"
          onPress={() => {
            router.push('/informes');
          }}
          style={styles.categoryRemainderRow}
        >
          <Text style={styles.categoryRemainder}>
            {remainder.label} · Gs. {formatPygMagnitude(remainder.amount)} ·{' '}
            {formatPercentage(remainder.percentage)} % ·{' '}
            <Text style={styles.cardLinkLabel}>detalle con subcategorías ›</Text>
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

function RecentMovementRow({
  transaction,
  category,
  categoryLabelText,
  paymentSourceName,
  todayLocal,
  isLast,
  onPress,
}: {
  readonly transaction: Transaction;
  readonly category: Category | undefined;
  readonly categoryLabelText: string | undefined;
  readonly paymentSourceName: string | undefined;
  readonly todayLocal: string;
  readonly isLast: boolean;
  readonly onPress: () => void;
}) {
  const amount = formatTransactionAmount(transaction);
  const initial = transaction.description.trim().charAt(0).toUpperCase() || '·';
  const accentColor = category?.color ?? themeTokens.colors.inkSecondary;
  const dateLabel = formatRecentMovementDateLabel(transaction.localDate, todayLocal);

  const subtitleParts = [categoryLabelText ?? 'Sin categoría'];
  if (paymentSourceName !== undefined) {
    subtitleParts.push(paymentSourceName);
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.recentRow, !isLast && styles.recentRowDivider]}
    >
      <View style={[styles.avatar, { backgroundColor: categoryTint(accentColor) }]}>
        <Text style={[styles.avatarText, { color: accentColor }]}>{initial}</Text>
      </View>
      <View style={styles.recentCopy}>
        <Text numberOfLines={1} style={m1TextStyles.body}>
          {transaction.description}
        </Text>
        <Text numberOfLines={1} style={m1TextStyles.secondary}>
          {subtitleParts.join(' · ')}
        </Text>
      </View>
      <View style={styles.recentAmountColumn}>
        <Text
          style={[
            styles.recentAmount,
            amount.isPositive ? styles.positiveAmount : styles.negativeAmount,
          ]}
        >
          {amount.text}
        </Text>
        <Text style={styles.recentDate}>{dateLabel}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The "RECIENTES · N" card, shared by the loaded-summary branch and GLO-02's cached-error
 * branch so neither has to duplicate this markup (both show the same recent transactions once
 * data — live or cached — is available).
 */
function RecentTransactionsCard({
  transactions,
  categories,
  paymentSources,
  todayLocal,
}: {
  readonly transactions: readonly Transaction[];
  readonly categories: readonly Category[];
  readonly paymentSources: readonly PaymentSource[];
  readonly todayLocal: string;
}) {
  if (transactions.length === 0) {
    return null;
  }

  return (
    <Card>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardLabel}>RECIENTES · {transactions.length.toString()}</Text>
        <Pressable
          accessibilityLabel="Ver todos los movimientos"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            router.push('/movimientos');
          }}
        >
          <Text style={styles.cardLinkLabel}>Ver todos ›</Text>
        </Pressable>
      </View>
      {transactions.map((transaction, index) => (
        <RecentMovementRow
          category={categories.find((c) => c.id === transaction.categoryId)}
          categoryLabelText={categoryLabel(transaction.categoryId, categories)}
          isLast={index === transactions.length - 1}
          key={transaction.id}
          onPress={() => {
            router.push(`/movimiento/${transaction.id}`);
          }}
          paymentSourceName={
            transaction.paymentSourceId === null
              ? undefined
              : paymentSources.find((s) => s.id === transaction.paymentSourceId)?.name
          }
          todayLocal={todayLocal}
          transaction={transaction}
        />
      ))}
    </Card>
  );
}

/**
 * GLO-02's "No pudimos actualizar" notice: primary "Reintentar" action plus a collapsed-by-
 * default "Detalles" row exposing the technical error code — per docs/system-design.md §6.9, that
 * code must never be visible without the user explicitly tapping "Detalles".
 */
function CachedSummaryNotice({
  status,
  cachedAt,
  lastAttemptAt,
  detailsOpen,
  onToggleDetails,
  onRetry,
}: {
  readonly status: number | undefined;
  readonly cachedAt: string;
  readonly lastAttemptAt: string;
  readonly detailsOpen: boolean;
  readonly onToggleDetails: () => void;
  readonly onRetry: () => void;
}) {
  const cachedTime = formatOccurredAtTime(cachedAt, DEVICE_TIME_ZONE);
  const attemptTime = formatOccurredAtTime(lastAttemptAt, DEVICE_TIME_ZONE);
  const technicalLabel =
    status === undefined ? 'Error de conexión' : `Error del servidor (${status.toString()})`;

  return (
    <Card>
      <Text style={m1TextStyles.sectionTitle}>No pudimos actualizar</Text>
      <Text style={m1TextStyles.secondary}>
        Mostramos lo último guardado en este teléfono, de {cachedTime}.
      </Text>
      <ActionButton label="Reintentar" onPress={onRetry} variant="primary" />
      <Pressable
        accessibilityLabel="Detalles"
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        hitSlop={8}
        onPress={onToggleDetails}
        style={styles.detailsRow}
      >
        <Text style={styles.detailsLabel}>Detalles</Text>
        <Ionicons
          color={themeTokens.colors.inkSecondary}
          name={detailsOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
        />
      </Pressable>
      {detailsOpen ? (
        <Text style={m1TextStyles.token}>
          {technicalLabel} · último intento {attemptTime}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    gap: 2,
  },
  householdLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  monthSubtitle: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  daysRemaining: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
  },
  cardLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: themeTokens.spacing.cardGap,
  },
  cardLinkLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    minHeight: themeTokens.touchTarget.minimum,
  },
  detailsLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  balanceAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
    lineHeight: 34,
  },
  balanceSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: themeTokens.touchTarget.minimum,
  },
  balanceSubtitle: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  tooltipBox: {
    marginTop: -8,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.primaryTint,
    padding: 12,
  },
  tooltipText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  subtotalsRow: {
    flexDirection: 'row',
    gap: themeTokens.spacing.cardGap,
  },
  subtotalColumn: {
    flex: 1,
    gap: 4,
  },
  subtotalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subtotalLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  subtotalAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  categoryRow: {
    gap: 6,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryName: {
    flex: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  categoryAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: themeTokens.chartColors.track,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: themeTokens.chartColors.mark,
  },
  categoryRemainderRow: {
    justifyContent: 'center',
    minHeight: themeTokens.touchTarget.minimum,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 8,
  },
  categoryRemainder: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
  },
  checklistRowPressed: {
    opacity: 0.7,
  },
  checklistBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistBadgeEmphasized: {
    backgroundColor: themeTokens.colors.primary,
  },
  checklistBadgeMuted: {
    backgroundColor: themeTokens.colors.primaryTint,
  },
  checklistBadgeText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  checklistBadgeTextEmphasized: {
    color: themeTokens.colors.surface,
  },
  checklistBadgeTextMuted: {
    color: themeTokens.colors.primary,
  },
  checklistCopy: {
    flex: 1,
    gap: 2,
  },
  checklistButton: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  checklistButtonLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    paddingVertical: 10,
  },
  recentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  recentCopy: {
    flex: 1,
    gap: 2,
  },
  recentAmountColumn: {
    alignItems: 'flex-end',
    gap: 2,
  },
  recentAmount: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  recentDate: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.label,
  },
  positiveAmount: {
    color: themeTokens.semanticColors.success.foreground,
  },
  negativeAmount: {
    color: themeTokens.colors.ink,
  },
  fab: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    ...cardShadowStyle,
  },
  fabLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
