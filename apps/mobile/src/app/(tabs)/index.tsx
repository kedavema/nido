import type {
  Category,
  CategoryBreakdownItem,
  MonthlySummaryResponse,
  PaymentSource,
  Transaction,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, Card, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import { navigateToNewExpense } from '@/navigation/new-expense-route';
import { cardShadowStyle } from '@/theme/styles';
import { themeTokens } from '@/theme/tokens';
import {
  categoryLabel,
  formatMonthLabel,
  formatMonthQueryParam,
  formatPygMagnitude,
  formatRecentMovementDateLabel,
  formatSignedPygAmount,
  formatTransactionAmount,
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

type CatalogState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
    };

type SummaryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
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

export default function InicioScreen() {
  const { catalog, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;

  const [month, setMonth] = useState<MonthValue>(() => monthFromLocalDate(todayLocalDate()));
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: 'loading' });
  const [summaryState, setSummaryState] = useState<SummaryState>({ kind: 'loading' });

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

  const loadSummary = useCallback(
    async (isActive: () => boolean) => {
      if (household === null) return;
      setSummaryState({ kind: 'loading' });
      try {
        const summary = await catalog.getMonthlySummary(household.id, {
          month: formatMonthQueryParam(month),
        });
        if (isActive()) {
          setSummaryState({ kind: 'loaded', summary });
        }
      } catch (error) {
        if (isActive()) {
          setSummaryState({ kind: 'error', message: messageForActionError(error) });
        }
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
  const todayLocal = todayLocalDate();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.householdLabel}>{household.name}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {formatMonthLabel(month)}
          </Text>
        </View>
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

      <ScrollView contentContainerStyle={styles.listArea}>
        {summaryState.kind === 'loading' || catalogState.kind === 'loading' ? (
          <LoadingContent label="Cargando resumen…" />
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

        {catalogState.kind === 'error' ? (
          <InlineNotice tone="error">{catalogState.message}</InlineNotice>
        ) : null}

        {summaryState.kind === 'loaded' ? (
          isEmptyMonth(summaryState.summary) ? (
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

              {summaryState.summary.recentTransactions.length > 0 ? (
                <Card>
                  <Text style={styles.cardLabel}>
                    RECIENTES · {summaryState.summary.recentTransactions.length.toString()}
                  </Text>
                  {summaryState.summary.recentTransactions.map((transaction, index) => (
                    <RecentMovementRow
                      category={categories.find((c) => c.id === transaction.categoryId)}
                      categoryLabelText={categoryLabel(transaction.categoryId, categories)}
                      isLast={index === summaryState.summary.recentTransactions.length - 1}
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
              ) : null}
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
