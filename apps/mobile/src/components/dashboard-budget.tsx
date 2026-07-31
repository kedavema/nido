import type { BudgetSummary } from '@nido/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Card, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { effectiveBudgetPercentage, formatBudgetPyg } from '@/utils/budget-overview';

interface DashboardBudgetProps {
  readonly budget: BudgetSummary | null;
  readonly monthLabel: string;
  readonly onOpenBudget: () => void;
}

function formatPercentage(value: number): string {
  return (value % 1 === 0 ? value.toFixed(0) : value.toFixed(2).replace(/0$/u, '')).replace(
    '.',
    ',',
  );
}

export function DashboardBudget({ budget, monthLabel, onOpenBudget }: DashboardBudgetProps) {
  if (budget === null) {
    return (
      <Card>
        <Text style={styles.sectionLabel}>PRESUPUESTO</Text>
        <Text style={m1TextStyles.sectionTitle}>Todavía no hay un plan para {monthLabel}</Text>
        <Text style={m1TextStyles.secondary}>
          Definí cuánto quieren gastar y Nido proyecta los compromisos del mes.
        </Text>
        <ActionButton label="Definir presupuesto" onPress={onOpenBudget} variant="secondary" />
      </Card>
    );
  }

  const spentPercentage = effectiveBudgetPercentage(
    budget.spentPercentage,
    BigInt(budget.spentPyg),
    BigInt(budget.totalLimitPyg),
  );
  const projectedUsed = (BigInt(budget.spentPyg) + BigInt(budget.pendingCommitmentsPyg)).toString();
  const projectedPercentage = effectiveBudgetPercentage(
    budget.projectedPercentage,
    BigInt(projectedUsed),
    BigInt(budget.totalLimitPyg),
  );
  const width = `${Math.min(Math.max(spentPercentage, 0), 100).toFixed(2)}%` as `${number}%`;
  const danger = projectedPercentage > 100;

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>PRESUPUESTO</Text>
        <Pressable
          accessibilityLabel="Ver presupuesto del mes"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenBudget}
        >
          <Text style={styles.link}>Ver detalle ›</Text>
        </Pressable>
      </View>
      <View style={styles.mainRow}>
        <View style={styles.mainCopy}>
          <Text style={styles.available}>{formatBudgetPyg(budget.availablePyg)}</Text>
          <Text style={m1TextStyles.secondary}>disponibles hoy</Text>
        </View>
        <Text style={styles.percentage}>{formatPercentage(spentPercentage)} % usado</Text>
      </View>
      <View
        accessibilityLabel={`${formatPercentage(spentPercentage)} por ciento del presupuesto usado`}
        accessibilityRole="progressbar"
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, { width }]} />
      </View>
      <View style={styles.metricRow}>
        <Text style={styles.metricLabel}>Gasto real</Text>
        <Text style={styles.metricValue}>{formatBudgetPyg(budget.spentPyg)}</Text>
      </View>
      <View style={styles.metricRow}>
        <Text style={styles.metricLabel}>Pendiente · todavía no es gasto real</Text>
        <Text style={styles.metricValue}>{formatBudgetPyg(budget.pendingCommitmentsPyg)}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.metricRow}>
        <Text style={styles.projectedLabel}>Proyectado después de pagar</Text>
        <View style={styles.projectedValue}>
          <Text style={[styles.projectedAmount, danger && styles.dangerText]}>
            {formatBudgetPyg(budget.projectedAvailablePyg)}
          </Text>
          <Text style={[styles.projectedPercentage, danger && styles.dangerText]}>
            {formatPercentage(projectedPercentage)} % usado
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  link: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  mainCopy: { flex: 1 },
  available: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  percentage: { ...m1TextStyles.secondary, textAlign: 'right' },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  progressFill: {
    height: '100%',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primary,
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metricLabel: { ...m1TextStyles.secondary, flex: 1 },
  metricValue: { ...m1TextStyles.body, textAlign: 'right' },
  divider: { height: 1, backgroundColor: themeTokens.colors.border },
  projectedLabel: { ...m1TextStyles.body, flex: 1 },
  projectedValue: { alignItems: 'flex-end' },
  projectedAmount: { ...m1TextStyles.body, fontFamily: themeTokens.typography.families.bodyBold },
  projectedPercentage: { ...m1TextStyles.secondary },
  dangerText: { color: themeTokens.semanticColors.danger.foreground },
});
