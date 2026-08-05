import type { CategoryBreakdownReportResponse } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, PressableScale, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { formatBudgetPyg } from '@/utils/budget-overview';
import { formatReportPercentage, largestReportAmount, reportBarWidth } from '@/utils/report-format';

interface CategoryReportProps {
  readonly report: CategoryBreakdownReportResponse;
}

export function CategoryReport({ report }: CategoryReportProps) {
  const [expandedId, setExpandedId] = useState<string | undefined>(
    report.categories[0]?.categoryId,
  );
  const largestAmount = largestReportAmount(report.categories.map((item) => item.amountPyg));

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
              <View
                accessibilityLabel={`${percentage} por ciento del gasto mensual`}
                accessibilityRole="progressbar"
                style={styles.track}
              >
                <View
                  style={[styles.fill, { width: reportBarWidth(item.amountPyg, largestAmount) }]}
                />
              </View>
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
        Barras a escala de la categoría mayor. Suma = {formatBudgetPyg(report.totalExpensePyg)} ✓
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
