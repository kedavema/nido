import type { BudgetSummary, HouseholdMember, Occurrence, RecurringItem } from '@nido/contracts';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Card, PressableScale, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import {
  budgetCommitmentRows,
  effectiveBudgetPercentage,
  formatBudgetPyg,
  type BudgetCommitmentRow,
} from '@/utils/budget-overview';
import { occurrenceStatusChip, type FijoTone } from '@/utils/fijos-format';

interface BudgetProjectionProps {
  readonly budget: BudgetSummary;
  readonly occurrences: readonly Occurrence[];
  readonly recurringItems: readonly RecurringItem[];
  readonly members: readonly HouseholdMember[];
  readonly todayLocal: string;
  readonly onOpenOccurrence: (occurrenceId: string) => void;
  readonly onSettleOccurrence: (occurrenceId: string) => void;
}

interface BudgetCommitmentsCardProps {
  readonly occurrences: readonly Occurrence[];
  readonly recurringItems: readonly RecurringItem[];
  readonly members: readonly HouseholdMember[];
  readonly todayLocal: string;
  readonly label?: string;
  readonly hideWhenEmpty?: boolean;
  readonly onOpenOccurrence: (occurrenceId: string) => void;
  readonly onSettleOccurrence: (occurrenceId: string) => void;
}

type ProjectionTone = 'normal' | 'warning' | 'danger';

function formatPercentage(value: number): string {
  return (value % 1 === 0 ? value.toFixed(0) : value.toFixed(2).replace(/0$/u, '')).replace(
    '.',
    ',',
  );
}

function toneForPercentage(value: number): ProjectionTone {
  return value > 100 ? 'danger' : value >= 90 ? 'warning' : 'normal';
}

export function BudgetProjection({
  budget,
  occurrences,
  recurringItems,
  members,
  todayLocal,
  onOpenOccurrence,
  onSettleOccurrence,
}: BudgetProjectionProps) {
  const spent = BigInt(budget.spentPyg);
  const pending = BigInt(budget.pendingCommitmentsPyg);
  const total = BigInt(budget.totalLimitPyg);
  const projectedUsed = spent + pending;
  const spentPercentage = effectiveBudgetPercentage(budget.spentPercentage, spent, total);
  const projectedPercentage = effectiveBudgetPercentage(
    budget.projectedPercentage,
    projectedUsed,
    total,
  );
  // With nothing pending, `projectedUsed` equals `spent` and `projectedAvailablePyg` equals
  // `availablePyg` by construction — so every projection row repeats the row above it, and the
  // reader hunts for a difference that cannot exist. A card with nothing to project stops calling
  // itself a projection and shows what it actually knows.
  const hasPending = pending > 0n;

  return (
    <>
      <Card>
        <Text style={styles.sectionLabel}>{hasPending ? 'PROYECCIÓN' : 'GASTO DEL MES'}</Text>
        <ProgressMetric amount={budget.spentPyg} label="Gasto real" percentage={spentPercentage} />
        {hasPending ? (
          <ProgressMetric
            amount={projectedUsed.toString()}
            label="Después de pagar lo pendiente"
            percentage={projectedPercentage}
          />
        ) : null}
        <View style={styles.divider} />
        {hasPending ? (
          <>
            <AmountRow label="Disponible hoy" value={budget.availablePyg} />
            <AmountRow label="Compromisos pendientes" value={budget.pendingCommitmentsPyg} />
            <AmountRow
              emphasis
              label="Proyectado después de pagar"
              value={budget.projectedAvailablePyg}
            />
          </>
        ) : (
          <AmountRow emphasis label="Disponible" value={budget.availablePyg} />
        )}
      </Card>

      <BudgetCommitmentsCard
        members={members}
        occurrences={occurrences}
        onOpenOccurrence={onOpenOccurrence}
        onSettleOccurrence={onSettleOccurrence}
        recurringItems={recurringItems}
        todayLocal={todayLocal}
      />
    </>
  );
}

export function BudgetCommitmentsCard({
  occurrences,
  recurringItems,
  members,
  todayLocal,
  label = 'PRÓXIMOS COMPROMISOS',
  hideWhenEmpty = false,
  onOpenOccurrence,
  onSettleOccurrence,
}: BudgetCommitmentsCardProps) {
  const rows = budgetCommitmentRows(occurrences, recurringItems, members, todayLocal);
  if (hideWhenEmpty && rows.length === 0) return null;
  return (
    <Card>
      <Text style={styles.sectionLabel}>{label}</Text>
      {rows.length === 0 ? (
        <Text style={m1TextStyles.secondary}>No hay compromisos pendientes para este mes.</Text>
      ) : (
        rows.map((row, index) => (
          <CommitmentRow
            isFirst={index === 0}
            key={row.id}
            onOpen={() => {
              onOpenOccurrence(row.id);
            }}
            onSettle={() => {
              onSettleOccurrence(row.id);
            }}
            row={row}
            todayLocal={todayLocal}
          />
        ))
      )}
    </Card>
  );
}

function ProgressMetric({
  label,
  amount,
  percentage,
}: {
  readonly label: string;
  readonly amount: string;
  readonly percentage: number;
}) {
  const tone = toneForPercentage(percentage);
  const width = `${Math.min(Math.max(percentage, 0), 100).toFixed(2)}%` as `${number}%`;
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricAmount, tone === 'danger' && styles.dangerText]}>
          {formatBudgetPyg(amount)} · {formatPercentage(percentage)} %
        </Text>
      </View>
      <View
        accessibilityLabel={`${label}: ${formatPercentage(percentage)} por ciento`}
        accessibilityRole="progressbar"
        style={styles.progressTrack}
      >
        <View
          style={[
            styles.progressFill,
            tone === 'warning' && styles.warningFill,
            tone === 'danger' && styles.dangerFill,
            { width },
          ]}
        />
      </View>
    </View>
  );
}

function AmountRow({
  label,
  value,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}) {
  const negative = BigInt(value) < 0n;
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, emphasis && styles.emphasis]}>{label}</Text>
      <Text
        style={[styles.amountValue, emphasis && styles.emphasis, negative && styles.dangerText]}
      >
        {formatBudgetPyg(value)}
      </Text>
    </View>
  );
}

function CommitmentRow({
  row,
  todayLocal,
  isFirst,
  onOpen,
  onSettle,
}: {
  readonly row: BudgetCommitmentRow;
  readonly todayLocal: string;
  readonly isFirst: boolean;
  readonly onOpen: () => void;
  readonly onSettle: () => void;
}) {
  const status = occurrenceStatusChip(row.status, row.dueDate, todayLocal);
  const overdue = status.tone === 'danger';
  return (
    <View
      style={[
        styles.commitmentRow,
        // The tint already separates an overdue row from the one above it, and a hairline running
        // into the top of a filled block reads as a seam rather than a divider.
        !isFirst && !overdue && styles.rowDivider,
        !isFirst && overdue && styles.overdueRowSpacing,
        overdue && styles.overdueRow,
      ]}
    >
      <Pressable
        accessibilityLabel={`Ver ${row.title}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={styles.commitmentDetail}
      >
        <Text numberOfLines={1} style={styles.commitmentTitle}>
          {row.title}
        </Text>
        <Text numberOfLines={2} style={[m1TextStyles.secondary, statusToneStyles[status.tone]]}>
          {status.label} · {row.responsibleName ?? 'Sin responsable'}
        </Text>
        <Text style={styles.commitmentAmount}>
          {row.isEstimate ? '≈ ' : ''}
          {formatBudgetPyg(row.baseAmountPyg)}
        </Text>
      </Pressable>
      <PressableScale
        accessibilityLabel={`Marcar ${row.title} como pagado`}
        haptic
        onPress={onSettle}
        style={styles.settleButton}
      >
        <Text style={styles.settleLabel}>Pagar</Text>
      </PressableScale>
    </View>
  );
}

/**
 * Colours a commitment's status line by the tone `occurrenceStatusChip` already assigns it.
 *
 * Only the two tones that mean "this needs you" get a colour. `neutral` and `success` keep the
 * muted secondary they have always had — and `warning` deliberately takes the foreground colour
 * without the tint that `danger` gets, because a month with five upcoming fijos would otherwise
 * become a wall of coloured bands and the overdue one would stop standing out, which is the whole
 * reason for doing this.
 */
const statusToneStyles: Record<FijoTone, TextStyle | undefined> = {
  danger: { color: themeTokens.semanticColors.danger.foreground },
  warning: { color: themeTokens.semanticColors.warning.foreground },
  neutral: undefined,
  success: undefined,
};

const styles = StyleSheet.create({
  sectionLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  metric: { gap: 8 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metricLabel: { ...m1TextStyles.body, flex: 1 },
  metricAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
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
  warningFill: { backgroundColor: themeTokens.semanticColors.warning.foreground },
  dangerFill: { backgroundColor: themeTokens.semanticColors.danger.foreground },
  divider: { height: 1, backgroundColor: themeTokens.colors.border },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  amountLabel: { ...m1TextStyles.secondary, flex: 1 },
  amountValue: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.body,
  },
  emphasis: { color: themeTokens.colors.ink, fontFamily: themeTokens.typography.families.bodyBold },
  dangerText: { color: themeTokens.semanticColors.danger.foreground },
  commitmentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: themeTokens.colors.border, paddingTop: 14 },
  overdueRow: {
    backgroundColor: themeTokens.semanticColors.danger.background,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // Replaces the hairline's `paddingTop` so a tinted row keeps the same distance from the row
  // above it as a plain one, instead of collapsing onto it.
  overdueRowSpacing: { marginTop: 2 },
  commitmentDetail: {
    flex: 1,
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
  },
  commitmentTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  commitmentAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
  },
  settleButton: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: 14,
  },
  settleLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
});
