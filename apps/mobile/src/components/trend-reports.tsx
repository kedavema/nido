import type {
  HouseholdMember,
  ReportPaymentSource,
  ReportTrendPoint,
  TrendsReportResponse,
} from '@nido/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { Card, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import { formatBudgetPyg } from '@/utils/budget-overview';
import { formatMonthLabel, monthFromLocalDate } from '@/utils/movement-format';
import {
  formatReportPercentage,
  formatSignedReportPyg,
  largestReportAmount,
  reportBarWidth,
} from '@/utils/report-format';

function monthLabel(month: string): string {
  return formatMonthLabel(monthFromLocalDate(`${month}-01`));
}

function periodLabel(month: string, todayLocal: string): string {
  const label = monthLabel(month).toUpperCase();
  return month === todayLocal.slice(0, 7)
    ? `${label} · AL DÍA ${Number(todayLocal.slice(8, 10)).toString()}`
    : label;
}

function expensePyg(value: string): string {
  return formatBudgetPyg((-BigInt(value)).toString());
}

export function IncomeExpenseReport({
  report,
  todayLocal,
}: {
  readonly report: TrendsReportResponse;
  readonly todayLocal: string;
}) {
  const selected = report.points[report.points.length - 1];
  const largest = largestReportAmount(
    report.points.flatMap((point) => [point.incomePyg, point.expensePyg]),
  );

  return (
    <>
      {selected === undefined ? null : (
        <Card>
          <Text style={styles.sectionLabel}>{periodLabel(selected.month, todayLocal)}</Text>
          <View style={styles.summaryRow}>
            <SummaryAmount
              color={themeTokens.semanticColors.success.foreground}
              label="Ingresos recibidos"
              value={formatSignedReportPyg(selected.incomePyg)}
            />
            <SummaryAmount
              color={themeTokens.colors.ink}
              label="Gastos reales"
              value={expensePyg(selected.expensePyg)}
            />
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Balance del mes</Text>
            <Text
              style={[
                styles.balanceAmount,
                BigInt(selected.balancePyg) < 0n && styles.negativeAmount,
              ]}
            >
              {formatSignedReportPyg(selected.balancePyg)}
            </Text>
          </View>
        </Card>
      )}

      <Card>
        <Text style={styles.sectionLabel}>EVOLUCIÓN · ÚLTIMOS 3 MESES</Text>
        {report.points.map((point) => (
          <TrendRow key={point.month} maximum={largest} point={point} todayLocal={todayLocal} />
        ))}
        <Text style={styles.footer}>
          Barras a escala del mayor ingreso o gasto. Balance = recibidos − gastos.
        </Text>
      </Card>
    </>
  );
}

function SummaryAmount({
  color,
  label,
  value,
}: {
  readonly color: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.summaryColumn}>
      <View style={styles.labelRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={m1TextStyles.secondary}>{label}</Text>
      </View>
      <Text style={[styles.summaryAmount, { color }]}>{value}</Text>
    </View>
  );
}

function TrendRow({
  maximum,
  point,
  todayLocal,
}: {
  readonly maximum: string;
  readonly point: ReportTrendPoint;
  readonly todayLocal: string;
}) {
  const current = point.month === todayLocal.slice(0, 7);
  const label = `${monthLabel(point.month).replace(/\s\d{4}$/u, '')}${current ? ` · al ${Number(todayLocal.slice(8, 10)).toString()}` : ''}`;
  return (
    <View style={styles.trendRow}>
      <View style={styles.trendHeader}>
        <Text style={styles.rowName}>{label}</Text>
        <Text style={[styles.trendBalance, BigInt(point.balancePyg) < 0n && styles.negativeAmount]}>
          {formatSignedReportPyg(point.balancePyg)}
        </Text>
      </View>
      <View style={styles.trendBody}>
        <View style={styles.trendBars}>
          <ReportBar
            color={themeTokens.semanticColors.success.foreground}
            label={`${label}: ingresos ${formatBudgetPyg(point.incomePyg)}`}
            width={reportBarWidth(point.incomePyg, maximum)}
          />
          <ReportBar
            color={themeTokens.colors.ink}
            label={`${label}: gastos ${formatBudgetPyg(point.expensePyg)}`}
            width={reportBarWidth(point.expensePyg, maximum)}
          />
        </View>
        <View style={styles.trendValues}>
          <Text style={styles.incomeValue}>{formatSignedReportPyg(point.incomePyg)}</Text>
          <Text style={styles.expenseValue}>{expensePyg(point.expensePyg)}</Text>
        </View>
      </View>
    </View>
  );
}

export function PaymentSourcesReport({
  members,
  report,
}: {
  readonly members: readonly HouseholdMember[];
  readonly report: TrendsReportResponse;
}) {
  const largest = largestReportAmount(report.paymentSources.map((source) => source.amountPyg));
  if (report.paymentSources.length === 0) {
    return (
      <Card>
        <Text style={m1TextStyles.sectionTitle}>Todavía no hay gastos en este mes</Text>
        <Text style={m1TextStyles.secondary}>
          El desglose aparecerá cuando registren un gasto real.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.sectionLabel}>GASTO POR MEDIO DE PAGO</Text>
      <Text style={styles.total}>{formatBudgetPyg(report.totalExpensePyg)}</Text>
      {report.paymentSources.map((source) => (
        <View key={source.paymentSourceId ?? 'unassigned'} style={styles.sourceRow}>
          <View style={styles.sourceHeader}>
            <Text numberOfLines={1} style={styles.rowName}>
              {source.paymentSourceName}{' '}
              <Text style={styles.owner}>· {sourceOwner(source, members)}</Text>
            </Text>
            <Text style={styles.sourceAmount}>
              {formatBudgetPyg(source.amountPyg)} ·{' '}
              {formatReportPercentage(source.percentageOfExpense)} %
            </Text>
          </View>
          <ReportBar
            label={`${source.paymentSourceName}: ${formatReportPercentage(source.percentageOfExpense)} por ciento del gasto`}
            width={reportBarWidth(source.amountPyg, largest)}
          />
        </View>
      ))}
      <Text style={styles.footer}>
        Suma = {formatBudgetPyg(report.totalExpensePyg)} ✓ · solo gastos reales
      </Text>
    </Card>
  );
}

function sourceOwner(source: ReportPaymentSource, members: readonly HouseholdMember[]): string {
  if (source.scope === 'SHARED') return 'los dos';
  if (source.scope === 'UNASSIGNED') return 'sin asignar';
  return (
    members.find((member) => member.userId === source.ownerUserId)?.displayName ?? 'integrante'
  );
}

// `color` is only passed where the chart carries two series that mean opposite things
// (ingresos vs gastos, each with its own dot and label). A single-series bar list omits
// it and takes the one chart mark — its row label already carries the identity.
function ReportBar({
  color = themeTokens.chartColors.mark,
  label,
  width,
}: {
  readonly color?: string;
  readonly label: string;
  readonly width: `${number}%`;
}) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.track}>
      <View style={[styles.fill, { backgroundColor: color, width }]} />
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
  summaryRow: { flexDirection: 'row', gap: 16 },
  summaryColumn: { flex: 1, gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summaryAmount: {
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: 12,
  },
  balanceLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  balanceAmount: {
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  negativeAmount: { color: themeTokens.semanticColors.danger.foreground },
  trendRow: { gap: 7 },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowName: {
    flexShrink: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  trendBalance: {
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  trendBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trendBars: { flex: 1, gap: 10 },
  trendValues: { width: 142, alignItems: 'flex-end', gap: 2 },
  incomeValue: { color: themeTokens.semanticColors.success.foreground },
  expenseValue: { color: themeTokens.colors.inkSecondary },
  total: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  sourceRow: { gap: 8 },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  owner: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
  },
  sourceAmount: {
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
  fill: { height: '100%', borderRadius: themeTokens.radii.chip },
  footer: {
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    paddingTop: 12,
  },
});
