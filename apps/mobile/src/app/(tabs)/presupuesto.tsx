import {
  MonthSchema,
  type BudgetMonth,
  type Category,
  type HouseholdMember,
  type MonthlySummaryResponse,
  type Occurrence,
  type RecurringItem,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { BudgetOverview } from '@/components/budget-overview';
import { BudgetProjection } from '@/components/budget-projection';
import {
  ActionButton,
  AppScreen,
  Card,
  InlineNotice,
  LoadingContent,
  PressableScale,
  SummarySkeleton,
  m1TextStyles,
} from '@/components/m1-ui';
import { navigateToFijoDetail, navigateToSettleOccurrence } from '@/navigation/fijos-routes';
import { themeTokens } from '@/theme/tokens';
import {
  formatMonthLabel,
  formatMonthQueryParam,
  monthFromLocalDate,
  monthLocalDateRange,
  shiftMonth,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly budgetMonth: BudgetMonth | null;
      readonly summary: MonthlySummaryResponse;
      readonly categories: readonly Category[];
      readonly occurrences: readonly Occurrence[];
      readonly recurringItems: readonly RecurringItem[];
      readonly members: readonly HouseholdMember[];
    };

export default function PresupuestoScreen() {
  const params = useLocalSearchParams<{ month?: string }>();
  const requestedMonth = MonthSchema.safeParse(params.month);
  const requestedMonthValue = requestedMonth.success
    ? monthFromLocalDate(`${requestedMonth.data}-01`)
    : undefined;
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [selectedMonth, setSelectedMonth] = useState<MonthValue>(() =>
    monthFromLocalDate(todayLocalDate()),
  );
  const month = requestedMonthValue ?? selectedMonth;
  const [screen, setScreen] = useState<ScreenState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const moveMonth = (delta: number) => {
    setSelectedMonth(shiftMonth(month, delta));
    router.setParams({ month: undefined });
  };

  const load = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (household === null) return;
      if (!silent) setScreen({ kind: 'loading' });
      const monthParam = formatMonthQueryParam(month);
      const { from, to } = monthLocalDateRange(month);
      try {
        const [
          { budgetMonth },
          summary,
          { categories },
          { occurrences },
          { recurringItems },
          { members },
        ] = await Promise.all([
          catalog.getBudgetMonth(household.id, monthParam),
          catalog.getMonthlySummary(household.id, { month: monthParam }),
          catalog.listCategories(household.id),
          catalog.listOccurrences(household.id, {
            from,
            to,
            status: ['PENDING', 'OVERDUE'],
          }),
          catalog.listRecurringItems(household.id),
          getMembers(household.id),
        ]);
        if (isActive()) {
          setScreen({
            kind: 'ready',
            budgetMonth,
            summary,
            categories,
            occurrences,
            recurringItems,
            members,
          });
        }
      } catch (error) {
        if (isActive()) {
          setScreen({ kind: 'error', message: messageForActionError(error) });
        }
      }
    },
    [catalog, getMembers, household, month],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(() => true, true).finally(() => {
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

  const monthParam = formatMonthQueryParam(month);
  const edit = () => {
    router.push(`/editar-presupuesto?month=${encodeURIComponent(monthParam)}`);
  };

  return (
    <AppScreen
      floatingAction={
        screen.kind === 'ready' && screen.budgetMonth !== null ? (
          <PressableScale
            accessibilityLabel="Editar presupuesto"
            haptic
            onPress={edit}
            style={styles.fab}
          >
            <Text style={styles.fabLabel}>Editar</Text>
          </PressableScale>
        ) : undefined
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={styles.title}>
          Presupuesto
        </Text>
        <View style={styles.monthPill}>
          <Pressable
            accessibilityLabel="Mes anterior"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              moveMonth(-1);
            }}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={17} />
          </Pressable>
          <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
          <Pressable
            accessibilityLabel="Mes siguiente"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              moveMonth(1);
            }}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-forward" size={17} />
          </Pressable>
        </View>
      </View>

      {screen.kind === 'loading' ? <SummarySkeleton /> : null}
      {screen.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{screen.message}</InlineNotice>
          <ActionButton
            label="Reintentar"
            onPress={() => void load(() => true)}
            variant="secondary"
          />
        </>
      ) : null}
      {screen.kind === 'ready' && screen.budgetMonth === null ? (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>
            Todavía no definieron un presupuesto para {formatMonthLabel(month).toLowerCase()}
          </Text>
          <Text style={m1TextStyles.secondary}>
            Elegí un total y, si quieren, límites para las categorías raíz.
          </Text>
          <ActionButton label="Definir presupuesto" onPress={edit} />
        </Card>
      ) : null}
      {screen.kind === 'ready' && screen.budgetMonth !== null && screen.summary.budget === null ? (
        <InlineNotice tone="error">
          El resumen del presupuesto no está disponible. Actualizá para volver a intentar.
        </InlineNotice>
      ) : null}
      {screen.kind === 'ready' && screen.budgetMonth !== null && screen.summary.budget !== null ? (
        <>
          <BudgetOverview
            budget={screen.summary.budget}
            budgetMonth={screen.budgetMonth}
            categories={screen.categories}
            categoryBreakdown={screen.summary.categoryBreakdown}
            month={month}
          />
          <BudgetProjection
            budget={screen.summary.budget}
            members={screen.members}
            occurrences={screen.occurrences}
            onOpenOccurrence={navigateToFijoDetail}
            onSettleOccurrence={navigateToSettleOccurrence}
            recurringItems={screen.recurringItems}
            todayLocal={todayLocalDate()}
          />
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  monthPill: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 14,
  },
  monthLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  fab: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primary,
    paddingHorizontal: 20,
  },
  fabLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
