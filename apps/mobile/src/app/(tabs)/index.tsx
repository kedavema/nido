import type {
  Category,
  CategoryBreakdownItem,
  HouseholdMember,
  MonthlySummaryResponse,
  PaymentSource,
  Transaction,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { messageForActionError, useSession } from '@/auth/session-provider';
import { getSummaryCache } from '@/cache/summary-cache';
import {
  ActionButton,
  Card,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  SummarySkeleton,
} from '@/components/m1-ui';
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
  shiftMonth,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

// INI-02 caps "Top categorías del mes" at 5 rows; the API already returns the full root-category
// breakdown sorted descending by amount (see monthly-summary.service.ts), so this is purely a
// display cap, not a query param.
const MAX_CATEGORY_ROWS = 5;

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
    };

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

  const loadCatalog = useCallback(async () => {
    if (household === null) return;
    setCatalogState({ kind: 'loading' });
    try {
      const [{ categories }, { paymentSources }] = await Promise.all([
        catalog.listCategories(household.id),
        catalog.listPaymentSources(household.id),
      ]);
      setCatalogState({ kind: 'loaded', categories, paymentSources });
    } catch (error) {
      setCatalogState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, household]);

  useEffect(() => {
    queueMicrotask(() => void loadCatalog());
  }, [loadCatalog]);

  const loadMembers = useCallback(async () => {
    if (household === null) return;
    setMembersState({ kind: 'loading' });
    try {
      const { members } = await getMembers(household.id);
      setMembersState({ kind: 'loaded', members });
    } catch {
      setMembersState({ kind: 'error' });
    }
  }, [getMembers, household]);

  useEffect(() => {
    queueMicrotask(() => void loadMembers());
  }, [loadMembers]);

  const loadSummary = useCallback(
    async (isActive: () => boolean) => {
      if (household === null) return;
      setSummaryState({ kind: 'loading' });
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

  // Same stale-response guard as movimientos.tsx: without it, a slow response for a month the
  // user has since navigated away from (via month stepper or tab switch) can land after a faster
  // response for the current month and clobber it.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadSummary(() => active);
      return () => {
        active = false;
      };
    }, [loadSummary]),
  );

  if (household === null) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <LoadingContent />
      </SafeAreaView>
    );
  }

  const categories = catalogState.kind === 'loaded' ? catalogState.categories : EMPTY_CATEGORIES;
  const paymentSources =
    catalogState.kind === 'loaded' ? catalogState.paymentSources : EMPTY_PAYMENT_SOURCES;
  const members = membersState.kind === 'loaded' ? membersState.members : EMPTY_MEMBERS;
  const todayLocal = todayLocalDate();
  const monthSubtitle = futureMonthSubtitle(month, todayLocal);
  const daysRemaining = daysRemainingInCurrentMonth(month, todayLocal);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
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
          <HeaderAvatars members={members} />
          <View style={styles.monthPill}>
            <Pressable
              accessibilityLabel="Mes anterior"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setMonth((current) => shiftMonth(current, -1));
              }}
            >
              <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={16} />
            </Pressable>
            <Pressable
              accessibilityLabel="Mes siguiente"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                setMonth((current) => shiftMonth(current, 1));
              }}
            >
              <Ionicons color={themeTokens.colors.ink} name="chevron-forward" size={16} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listArea}>
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
              onToggleTooltip={() => {
                setTooltipOpen((current) => !current);
              }}
              summary={summaryState.summary}
              tooltipOpen={tooltipOpen}
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
          isEmptyMonth(summaryState.summary) ? (
            isTrueFirstRun(month, todayLocal, membersState) ? (
              <>
                <FirstRunBalanceCard month={month} />
                <FirstRunChecklistCard month={month} />
              </>
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
              </Card>
            )
          ) : (
            <>
              <BalanceCard
                onToggleTooltip={() => {
                  setTooltipOpen((current) => !current);
                }}
                summary={summaryState.summary}
                tooltipOpen={tooltipOpen}
              />

              {summaryState.summary.categoryBreakdown.length > 0 ? (
                <CategoryBreakdownCard
                  categories={categories}
                  items={summaryState.summary.categoryBreakdown}
                />
              ) : null}

              <RecentTransactionsCard
                categories={categories}
                paymentSources={paymentSources}
                todayLocal={todayLocal}
                transactions={summaryState.summary.recentTransactions}
              />
            </>
          )
        ) : null}
      </ScrollView>

      <View pointerEvents="box-none" style={styles.fabContainer}>
        <Pressable
          accessibilityLabel="Nuevo gasto"
          accessibilityRole="button"
          onPress={() => {
            navigateToNewExpense();
          }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabLabel}>+ Nuevo gasto</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * INI-02's two header avatar circles, one per ACTIVE household member (a member with a pending,
 * not-yet-accepted invite doesn't show up in `getMembers` at all, so nothing extra to filter out
 * there). No per-member color convention exists elsewhere in the app yet, so this alternates
 * `primary`/`accent` by member order — which happens to match the reference's dark-green "A" /
 * orange "K" circles exactly.
 */
function HeaderAvatars({ members }: { readonly members: readonly HouseholdMember[] }) {
  const activeMembers = members.filter((member) => member.status === 'ACTIVE');
  if (activeMembers.length === 0) {
    return null;
  }

  return (
    <View style={styles.headerAvatars}>
      {activeMembers.map((member, index) => (
        <View
          accessibilityLabel={member.displayName}
          key={member.userId}
          style={[
            styles.headerAvatar,
            {
              backgroundColor:
                index % 2 === 0 ? themeTokens.colors.primary : themeTokens.colors.accent,
            },
          ]}
        >
          <Text style={styles.headerAvatarText}>
            {member.displayName.trim().charAt(0).toUpperCase() || '·'}
          </Text>
        </View>
      ))}
    </View>
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
}: {
  readonly summary: MonthlySummaryResponse;
  readonly tooltipOpen: boolean;
  readonly onToggleTooltip: () => void;
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
        <View style={styles.subtotalColumn}>
          <View style={styles.subtotalLabelRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: themeTokens.semanticColors.success.foreground },
              ]}
            />
            <Text style={styles.subtotalLabel}>Ingresos recibidos</Text>
          </View>
          <Text style={[styles.subtotalAmount, styles.positiveAmount]}>{income.text}</Text>
        </View>
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

function CategoryBreakdownCard({
  items,
  categories,
}: {
  readonly items: readonly CategoryBreakdownItem[];
  readonly categories: readonly Category[];
}) {
  const topItems = items.slice(0, MAX_CATEGORY_ROWS);

  return (
    <Card>
      <Text style={styles.cardLabel}>TOP CATEGORÍAS DEL MES</Text>
      {topItems.map((item) => {
        // categoryBreakdown items are always root categories (see attributeToRootCategories in
        // monthly-summary.service.ts), so a direct id lookup — not the parent-aware
        // `categoryLabel` helper — is enough to find its color.
        const barColor =
          categories.find((category) => category.id === item.categoryId)?.color ??
          themeTokens.colors.primary;
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
              <View
                style={[styles.progressFill, { width: widthPercent, backgroundColor: barColor }]}
              />
            </View>
          </View>
        );
      })}
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
      <View style={[styles.avatar, { backgroundColor: `${accentColor}26` }]}>
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
  safeArea: {
    flex: 1,
    backgroundColor: themeTokens.colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.base,
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
  headerAvatars: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  listArea: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    padding: themeTokens.spacing.screen,
    paddingBottom: 96,
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
    backgroundColor: themeTokens.colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: themeTokens.colors.primary,
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
  fabContainer: {
    position: 'absolute',
    right: themeTokens.spacing.screen,
    bottom: themeTokens.spacing.screen,
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
  fabPressed: {
    opacity: 0.85,
  },
  fabLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
