import type { BudgetAllocation, CategoryBreakdownReportResponse } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, PressableScale, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { formatBudgetPyg } from '@/utils/budget-overview';
import { categoryLimitProgress, formatReportPercentage } from '@/utils/report-format';

interface CategoryReportProps {
  readonly report: CategoryBreakdownReportResponse;
  /**
   * The month's per-category limits. A category with spending but no entry here renders its
   * amount without a bar — see `categoryLimitProgress`.
   */
  readonly allocations: readonly BudgetAllocation[];
  /** Opens the budget editor from the "sin presupuesto" affordance. */
  readonly onEditBudget: () => void;
}

export function CategoryReport({ allocations, onEditBudget, report }: CategoryReportProps) {
  const [expandedId, setExpandedId] = useState<string | undefined>(
    report.categories[0]?.categoryId,
  );
  const limitByCategory = new Map(
    allocations.map((allocation) => [allocation.categoryId, allocation.amountPyg]),
  );

  if (report.categories.length === 0) {
    return (
      <Card>
        <Text style={m1TextStyles.sectionTitle}>Todavía no hay gastos en este mes</Text>
        <Text style={m1TextStyles.secondary}>
          Los gastos aparecerán acá agrupados por categoría y subcategoría.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.sectionLabel}>GASTO REAL POR CATEGORÍA</Text>
      <Text style={styles.total}>{formatBudgetPyg(report.totalExpensePyg)}</Text>
      {report.categories.map((item) => {
        const expanded = expandedId === item.categoryId;
        const percentage = formatReportPercentage(item.percentageOfTotal);
        const progress = categoryLimitProgress(
          item.amountPyg,
          limitByCategory.get(item.categoryId),
        );

        return (
          <View key={item.categoryId} style={styles.categoryRow}>
            <PressableScale
              accessibilityLabel={`${item.categoryName}, ${formatBudgetPyg(item.amountPyg)}, ${percentage} por ciento`}
              accessibilityState={{ expanded }}
              haptic
              onPress={() => {
                setExpandedId(expanded ? undefined : item.categoryId);
              }}
              style={styles.categoryButton}
            >
              <View style={styles.categoryHeader}>
                <View style={styles.categoryNameRow}>
                  <Text numberOfLines={1} style={styles.categoryName}>
                    {item.categoryName}
                  </Text>
                  <Ionicons
                    color={themeTokens.colors.ink}
                    name={expanded ? 'chevron-down' : 'chevron-forward'}
                    size={15}
                  />
                </View>
                <Text style={styles.categoryAmount}>
                  {formatBudgetPyg(item.amountPyg)} · {percentage} %
                </Text>
              </View>
              {progress === undefined ? null : (
                <View
                  accessibilityLabel={
                    progress.isOver
                      ? `Excedido por ${formatBudgetPyg(progress.remainingPyg)}`
                      : `Quedan ${formatBudgetPyg(progress.remainingPyg)}`
                  }
                  accessibilityRole="progressbar"
                  style={styles.track}
                >
                  <View
                    style={[
                      styles.fill,
                      progress.isOver && styles.fillOver,
                      { width: progress.width },
                    ]}
                  />
                </View>
              )}
              {progress === undefined ? (
                // The bar needs a limit; the amount does not. Hiding the row instead would report
                // a subset of spending as the total — tidy, and wrong.
                <Text onPress={onEditBudget} style={styles.noBudget}>
                  sin presupuesto ›
                </Text>
              ) : (
                <Text style={progress.isOver ? styles.overAmount : styles.remainingAmount}>
                  {progress.isOver
                    ? `Excedido por ${formatBudgetPyg(progress.remainingPyg)}`
                    : `Te quedan ${formatBudgetPyg(progress.remainingPyg)}`}
                </Text>
              )}
            </PressableScale>
            {expanded ? (
              <View style={styles.subcategories}>
                {BigInt(item.directAmountPyg) === 0n ? null : (
                  <SubcategoryRow amount={item.directAmountPyg} name="Sin subcategoría" />
                )}
                {item.subcategories.map((subcategory) => (
                  <SubcategoryRow
                    amount={subcategory.amountPyg}
                    key={subcategory.categoryId}
                    name={subcategory.categoryName}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={styles.footer}>
        Cada barra mide su propio límite. Suma = {formatBudgetPyg(report.totalExpensePyg)} ✓
      </Text>
    </Card>
  );
}

function SubcategoryRow({ amount, name }: { readonly amount: string; readonly name: string }) {
  return (
    <View style={styles.subcategoryRow}>
      <Text style={m1TextStyles.body}>{name}</Text>
      <Text style={styles.subcategoryAmount}>{formatBudgetPyg(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    letterSpacing: 1,
  },
  total: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  categoryRow: { gap: 8 },
  categoryButton: { gap: 8 },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  categoryName: {
    flexShrink: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  categoryAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
  },
  track: {
    height: 8,
    overflow: 'hidden',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.chartColors.track,
  },
  fill: {
    height: '100%',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.chartColors.mark,
  },
  // Over-limit is a state, not another series, so it wears the status colour and is always paired
  // with the words beside it — never colour alone.
  fillOver: { backgroundColor: themeTokens.semanticColors.danger.foreground },
  remainingAmount: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  overAmount: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  noBudget: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  subcategories: {
    gap: 8,
    borderLeftWidth: 2,
    borderLeftColor: themeTokens.colors.border,
    marginLeft: 8,
    paddingLeft: 14,
  },
  subcategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  subcategoryAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    paddingTop: 12,
  },
});
