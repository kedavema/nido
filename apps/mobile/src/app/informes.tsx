import type {
  BudgetMonth,
  Category,
  CategoryBreakdownReportResponse,
  HouseholdMember,
  MonthlySummaryResponse,
  TrendsReportResponse,
} from '@nido/contracts';
import { router, useFocusEffect } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { BudgetOverview } from '@/components/budget-overview';
import { CategoryReport } from '@/components/category-report';
import { MonthPicker } from '@/components/date-picker';
import {
  ActionButton,
  AppScreen,
  Card,
  InlineNotice,
  LoadingContent,
  SummarySkeleton,
  m1TextStyles,
  HeaderBackButton,
  ScreenHeader,
} from '@/components/m1-ui';
import { IncomeExpenseReport, PaymentSourcesReport } from '@/components/trend-reports';
import { themeTokens } from '@/theme/tokens';
import {
  formatMonthQueryParam,
  monthFromLocalDate,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly budgetMonth: BudgetMonth | null;
      readonly categories: readonly Category[];
      readonly categoryReport: CategoryBreakdownReportResponse;
      readonly members: readonly HouseholdMember[];
      readonly summary: MonthlySummaryResponse;
      readonly trendsReport: TrendsReportResponse;
    };

export default function InformesScreen() {
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [month, setMonth] = useState<MonthValue>(() => monthFromLocalDate(todayLocalDate()));
  const [screen, setScreen] = useState<ScreenState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const requestGeneration = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (household === null) return;
      const generation = ++requestGeneration.current;
      if (!silent) setScreen({ kind: 'loading' });
      const monthParam = formatMonthQueryParam(month);
      try {
        const [
          categoryReport,
          trendsReport,
          { budgetMonth },
          summary,
          { categories },
          { members },
        ] = await Promise.all([
          catalog.getCategoryBreakdownReport(household.id, { month: monthParam }),
          catalog.getTrendsReport(household.id, { month: monthParam }),
          catalog.getBudgetMonth(household.id, monthParam),
          catalog.getMonthlySummary(household.id, { month: monthParam }),
          catalog.listCategories(household.id),
          getMembers(household.id),
        ]);
        if (requestGeneration.current === generation) {
          setScreen({
            kind: 'ready',
            budgetMonth,
            categories,
            categoryReport,
            members,
            summary,
            trendsReport,
          });
        }
      } catch (error) {
        if (requestGeneration.current === generation) {
          setScreen({ kind: 'error', message: messageForActionError(error) });
        }
      }
    },
    [catalog, getMembers, household, month],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestGeneration.current += 1;
      };
    }, [load]),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(true).finally(() => {
      setRefreshing(false);
    });
  }, [load]);

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  return (
    <AppScreen onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.header}>
        <ScreenHeader
          description={household.name}
          leading={
            <HeaderBackButton
              onPress={() => {
                router.back();
              }}
            />
          }
          size="compact"
          title="Informes"
        />
        <View style={styles.monthPicker}>
          <MonthPicker
            onChange={(selected) => {
              setMonth(selected);
            }}
            value={month}
          />
        </View>
      </View>

      {screen.kind === 'loading' ? <SummarySkeleton /> : null}
      {screen.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{screen.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
        </>
      ) : null}
      {screen.kind === 'ready' ? (
        <>
          <ReportSection title="Cómo venís">
            <BudgetReport month={month} screen={screen} />
          </ReportSection>
          <ReportSection title="En qué se te va">
            <CategoryReport
              allocations={screen.budgetMonth?.allocations ?? []}
              key={screen.categoryReport.month}
              onEditBudget={() => {
                router.push(`/editar-presupuesto?month=${formatMonthQueryParam(month)}`);
              }}
              report={screen.categoryReport}
            />
          </ReportSection>
          <ReportSection title="Contra meses anteriores">
            <IncomeExpenseReport report={screen.trendsReport} todayLocal={todayLocalDate()} />
          </ReportSection>
          <ReportSection title="Quién puso qué">
            <PaymentSourcesReport members={screen.members} report={screen.trendsReport} />
          </ReportSection>
        </>
      ) : null}
    </AppScreen>
  );
}

/**
 * One band of the report. The four sections used to be tabs; each is three to six rows, so the
 * tabs hid most of a small screen behind clicks rather than paging a dataset that needed paging.
 * The heading is what replaces the tab label — without it a reader loses which block they are in.
 */
function ReportSection({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function BudgetReport({
  month,
  screen,
}: {
  readonly month: MonthValue;
  readonly screen: Extract<ScreenState, { readonly kind: 'ready' }>;
}) {
  if (screen.budgetMonth === null) {
    return (
      <Card>
        <Text style={m1TextStyles.sectionTitle}>Todavía no definieron este presupuesto</Text>
        <Text style={m1TextStyles.secondary}>
          Definilo para comparar el límite mensual con el gasto real.
        </Text>
        <ActionButton
          label="Definir presupuesto"
          onPress={() => {
            router.push(`/editar-presupuesto?month=${formatMonthQueryParam(month)}`);
          }}
        />
      </Card>
    );
  }
  if (screen.summary.budget === null) {
    return (
      <InlineNotice tone="error">No pudimos calcular el presupuesto de este mes.</InlineNotice>
    );
  }
  return (
    <BudgetOverview
      budget={screen.summary.budget}
      budgetMonth={screen.budgetMonth}
      categories={screen.categories}
      categoryBreakdown={screen.summary.categoryBreakdown}
      month={month}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 8 },
  section: { gap: themeTokens.spacing.base },
  sectionHeading: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 1,
  },
  monthPicker: {
    marginLeft: themeTokens.touchTarget.minimum + 12,
  },
});
