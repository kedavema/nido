import type { BudgetMonth, BudgetSummary, Category, CategoryBreakdownItem } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { Card } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import {
  budgetCategoryBasisPoints,
  formatBudgetBasisPoints,
  formatBudgetPyg,
} from '@/utils/budget-overview';
import {
  daysRemainingInCurrentMonth,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

type BudgetTone = 'normal' | 'warning' | 'danger';

interface BudgetOverviewProps {
  readonly budgetMonth: BudgetMonth;
  readonly budget: BudgetSummary;
  readonly categories: readonly Category[];
  readonly categoryBreakdown: readonly CategoryBreakdownItem[];
  readonly month: MonthValue;
}

function formatPercentage(value: number): string {
  const text = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2).replace(/0$/u, '');
  return text.replace('.', ',');
}

function toneForBasisPoints(basisPoints: bigint): BudgetTone {
  return basisPoints >= 10_000n ? 'danger' : basisPoints >= 9_000n ? 'warning' : 'normal';
}

function toneForPercentage(value: number): BudgetTone {
  return toneForBasisPoints(BigInt(Math.round(value * 100)));
}

function textStyleForTone(tone: BudgetTone): StyleProp<TextStyle> {
  if (tone === 'danger') return styles.dangerText;
  if (tone === 'warning') return styles.warningStateText;
  return styles.normalText;
}

export function BudgetOverview({
  budgetMonth,
  budget,
  categories,
  categoryBreakdown,
  month,
}: BudgetOverviewProps) {
  const totalTone = toneForPercentage(budget.spentPercentage);
  const daysRemaining = daysRemainingInCurrentMonth(month, todayLocalDate());

  return (
    <>
      {totalTone === 'normal' ? null : (
        <View style={[styles.notice, totalTone === 'danger' && styles.dangerNotice]}>
          <Ionicons
            color={
              totalTone === 'danger'
                ? themeTokens.semanticColors.danger.foreground
                : themeTokens.semanticColors.warning.foreground
            }
            name="alert-circle"
            size={24}
          />
          <Text style={[styles.noticeText, totalTone === 'danger' && styles.dangerNoticeText]}>
            Usaron el {formatPercentage(budget.spentPercentage)} % del presupuesto
            {daysRemaining === undefined ? '.' : ` y faltan ${daysRemaining.toString()} días.`}
          </Text>
        </View>
      )}

      <Card>
        <Text style={styles.sectionLabel}>TOTAL DEL MES</Text>
        <View style={styles.availableRow}>
          <Text style={styles.availableAmount}>{formatBudgetPyg(budget.availablePyg)}</Text>
          <Text style={styles.availableCaption}>disponibles</Text>
        </View>
        <BudgetProgress percentage={budget.spentPercentage} tone={totalTone} />
        <Text style={styles.progressCaption}>
          Usado {formatBudgetPyg(budget.spentPyg)} de {formatBudgetPyg(budget.totalLimitPyg)} ·{' '}
          <Text style={textStyleForTone(totalTone)}>
            {formatPercentage(budget.spentPercentage)} % —{' '}
            {totalTone === 'danger' ? 'excedido' : totalTone === 'warning' ? 'atención' : 'al día'}
          </Text>
        </Text>
      </Card>

      <CategoryBudgetCard
        budgetMonth={budgetMonth}
        categories={categories}
        categoryBreakdown={categoryBreakdown}
      />
    </>
  );
}

function CategoryBudgetCard({
  budgetMonth,
  categories,
  categoryBreakdown,
}: {
  readonly budgetMonth: BudgetMonth;
  readonly categories: readonly Category[];
  readonly categoryBreakdown: readonly CategoryBreakdownItem[];
}) {
  const spentByCategory = new Map(categoryBreakdown.map((item) => [item.categoryId, item.amount]));
  const allocatedIds = new Set(budgetMonth.allocations.map((item) => item.categoryId));
  const unlimitedSpent = categoryBreakdown.reduce(
    (total, item) => (allocatedIds.has(item.categoryId) ? total : total + BigInt(item.amount)),
    0n,
  );

  return (
    <Card>
      <Text style={styles.sectionLabel}>POR CATEGORÍA</Text>
      {budgetMonth.allocations.map((allocation) => {
        const spent = BigInt(spentByCategory.get(allocation.categoryId) ?? '0');
        const limit = BigInt(allocation.amountPyg);
        const basisPoints = budgetCategoryBasisPoints(spent, limit);
        const tone = toneForBasisPoints(basisPoints);
        const category = categories.find((item) => item.id === allocation.categoryId);
        const over = spent > limit ? spent - limit : 0n;

        return (
          <View key={allocation.categoryId} style={styles.categoryRow}>
            <View style={styles.categoryHeader}>
              <Text numberOfLines={1} style={styles.categoryName}>
                {category?.name ?? 'Categoría archivada'}
              </Text>
              <Text style={textStyleForTone(tone)}>
                {tone === 'danger'
                  ? `Excedido por ${formatBudgetPyg(over.toString())}`
                  : tone === 'warning'
                    ? 'Cerca del límite'
                    : 'al día'}
              </Text>
            </View>
            <BudgetProgress
              percentage={Number(basisPoints > 10_000n ? 10_000n : basisPoints) / 100}
              tone={tone}
            />
            <Text style={styles.progressCaption}>
              {formatBudgetPyg(spent.toString())} de {formatBudgetPyg(limit.toString())} ·{' '}
              {formatBudgetBasisPoints(basisPoints)} %
            </Text>
          </View>
        );
      })}
      {unlimitedSpent === 0n ? null : (
        <Text style={styles.unlimitedCaption}>
          Sin límite · {formatBudgetPyg(unlimitedSpent.toString())} usados
        </Text>
      )}
    </Card>
  );
}

function BudgetProgress({
  percentage,
  tone,
}: {
  readonly percentage: number;
  readonly tone: BudgetTone;
}) {
  const width = `${Math.min(Math.max(percentage, 0), 100).toFixed(2)}%` as `${number}%`;
  const fillStyle =
    tone === 'danger'
      ? styles.dangerFill
      : tone === 'warning'
        ? styles.warningFill
        : styles.normalFill;
  return (
    <View
      accessibilityLabel={`${formatPercentage(percentage)} por ciento usado`}
      accessibilityRole="progressbar"
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, fillStyle, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: themeTokens.semanticColors.warning.foreground,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.semanticColors.warning.background,
    padding: 16,
  },
  dangerNotice: {
    borderColor: themeTokens.semanticColors.danger.foreground,
    backgroundColor: themeTokens.semanticColors.danger.background,
  },
  noticeText: {
    flex: 1,
    color: themeTokens.semanticColors.warning.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  dangerNoticeText: { color: themeTokens.semanticColors.danger.foreground },
  sectionLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  availableRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  availableAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  availableCaption: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
  },
  progressTrack: {
    height: 10,
    overflow: 'hidden',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  progressFill: { height: '100%', borderRadius: themeTokens.radii.chip },
  normalFill: { backgroundColor: themeTokens.colors.primary },
  warningFill: { backgroundColor: themeTokens.semanticColors.warning.foreground },
  dangerFill: { backgroundColor: themeTokens.semanticColors.danger.foreground },
  progressCaption: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  normalText: { color: themeTokens.semanticColors.success.foreground },
  warningStateText: { color: themeTokens.semanticColors.warning.foreground },
  dangerText: { color: themeTokens.semanticColors.danger.foreground },
  categoryRow: { gap: 8 },
  categoryHeader: {
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
  unlimitedCaption: {
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    paddingTop: 12,
  },
});
