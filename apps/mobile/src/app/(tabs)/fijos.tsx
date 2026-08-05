import type { Category, HouseholdMember, Occurrence, RecurringItem } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { categoryTint } from '@/utils/category-appearance';
import {
  ActionButton,
  AppScreen,
  Card,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  PressableScale,
  ScreenHeader,
} from '@/components/m1-ui';
import {
  navigateToFijoDetail,
  navigateToRecurringItemForm,
  navigateToSettleOccurrence,
} from '@/navigation/fijos-routes';
import { MonthStepper } from '@/components/month-stepper';
import { themeTokens } from '@/theme/tokens';
import {
  deriveOccurrenceDisplayStatus,
  formatOccurrenceAmount,
  formatShortDueDate,
  isPending,
  occurrenceStatusChip,
  settledOnLabel,
  sumPendingEstimatedPyg,
  type OccurrenceDisplayStatus,
} from '@/utils/fijos-format';
import {
  formatMonthLabel,
  formatPygMagnitude,
  monthFromLocalDate,
  monthLocalDateRange,
  shiftMonth,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly occurrences: readonly Occurrence[];
      readonly recurringItems: readonly RecurringItem[];
      readonly categories: readonly Category[];
      readonly members: readonly HouseholdMember[];
    };

/** An occurrence joined to its recurring item + resolved display metadata, for one FIJ-01 row. */
interface FijoRow {
  readonly occurrence: Occurrence;
  readonly item: RecurringItem;
  readonly status: OccurrenceDisplayStatus;
  readonly title: string;
  readonly initial: string;
  readonly accentColor: string;
  readonly responsibleName: string | undefined;
}

export default function FijosScreen() {
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [month, setMonth] = useState<MonthValue>(() => monthFromLocalDate(todayLocalDate()));
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (household === null) return;
      if (!silent) setLoadState({ kind: 'loading' });
      const { from, to } = monthLocalDateRange(month);
      try {
        // Listing occurrences triggers the server's lazy-on-read sweep (T-505), so this is also
        // what keeps OVERDUE statuses fresh for the month being viewed.
        const [{ occurrences }, { recurringItems }, { categories }, { members }] =
          await Promise.all([
            catalog.listOccurrences(household.id, { from, to }),
            catalog.listRecurringItems(household.id),
            catalog.listCategories(household.id),
            getMembers(household.id),
          ]);
        if (isActive()) {
          setLoadState({ kind: 'loaded', occurrences, recurringItems, categories, members });
        }
      } catch (error) {
        if (isActive()) {
          setLoadState({ kind: 'error', message: messageForActionError(error) });
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

  // Pull-to-refresh reuses the same fetch silently so the visible list isn't replaced by the
  // full-screen spinner mid-pull — the RefreshControl is the only progress affordance.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(() => true, true).finally(() => {
      setRefreshing(false);
    });
  }, [load]);

  const todayLocal = todayLocalDate();

  const rows = useMemo<readonly FijoRow[]>(() => {
    if (loadState.kind !== 'loaded') return [];
    const itemsById = new Map(loadState.recurringItems.map((item) => [item.id, item]));
    const categoriesById = new Map(loadState.categories.map((category) => [category.id, category]));
    const membersById = new Map(loadState.members.map((member) => [member.userId, member]));

    return loadState.occurrences
      .map((occurrence): FijoRow | null => {
        const item = itemsById.get(occurrence.recurringItemId);
        if (item === undefined) return null;
        // Fijos lists fixed EXPENSES only; income recurring items live in Ingresos esperados
        // (ING-01), reached from the Inicio Balance card.
        if (item.kind !== 'EXPENSE') return null;
        const status = deriveOccurrenceDisplayStatus(occurrence, todayLocal);
        if (status === 'SKIPPED') return null;
        const responsibleUserId = occurrence.responsibleUserId ?? item.responsibleUserId;
        return {
          occurrence,
          item,
          status,
          title: item.name,
          initial: item.name.trim().charAt(0).toUpperCase() || '·',
          accentColor:
            categoriesById.get(item.categoryId)?.color ?? themeTokens.colors.inkSecondary,
          responsibleName:
            responsibleUserId === null
              ? undefined
              : membersById.get(responsibleUserId)?.displayName,
        };
      })
      .filter((row): row is FijoRow => row !== null);
  }, [loadState, todayLocal]);

  const overdueRows = rows.filter((row) => row.status === 'OVERDUE');
  const upcomingRows = rows.filter((row) => row.status === 'UPCOMING' || row.status === 'PENDING');
  const settledRows = rows.filter((row) => row.status === 'SETTLED');

  // Totals count expense occurrences only (income is excluded from Fijos, matching the rows above).
  const expenseItemIds = useMemo(
    () =>
      loadState.kind === 'loaded'
        ? new Set(
            loadState.recurringItems
              .filter((item) => item.kind === 'EXPENSE')
              .map((item) => item.id),
          )
        : new Set<string>(),
    [loadState],
  );
  const occurrences =
    loadState.kind === 'loaded'
      ? loadState.occurrences.filter((occurrence) => expenseItemIds.has(occurrence.recurringItemId))
      : [];
  const pendingTotal = sumPendingEstimatedPyg(occurrences);
  const pendingCount = occurrences.filter((occurrence) => isPending(occurrence.status)).length;
  const totalCount = occurrences.filter((occurrence) => occurrence.status !== 'SKIPPED').length;
  const monthLabel = formatMonthLabel(month);
  const monthNameLower = monthLabel.replace(/\s\d{4}$/u, '').toLowerCase();

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  return (
    <AppScreen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader
        size="compact"
        title="Fijos"
        trailing={
          <MonthStepper
            label={monthLabel}
            onNext={() => {
              setMonth((current) => shiftMonth(current, 1));
            }}
            onPrevious={() => {
              setMonth((current) => shiftMonth(current, -1));
            }}
          />
        }
      />

      {loadState.kind === 'loading' ? <LoadingContent label="Cargando fijos…" /> : null}

      {loadState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{loadState.message}</InlineNotice>
          <ActionButton
            label="Reintentar"
            onPress={() => void load(() => true)}
            variant="secondary"
          />
        </>
      ) : null}

      {loadState.kind === 'loaded' && totalCount === 0 ? (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>Todavía no hay gastos fijos</Text>
          <Text style={m1TextStyles.secondary}>
            Cargá tus gastos que se repiten —alquiler, servicios, seguros— y Nido te avisa antes de
            cada vencimiento.
          </Text>
        </Card>
      ) : null}

      {loadState.kind === 'loaded' && totalCount > 0 ? (
        <Card>
          <Text style={styles.summaryEyebrow}>Compromisos pendientes</Text>
          <View style={styles.summaryAmountRow}>
            <Text style={styles.summaryAmount}>Gs. {formatPygMagnitude(pendingTotal)}</Text>
            <Text style={m1TextStyles.secondary}>
              {' · '}
              {pendingCount.toString()} de {totalCount.toString()} fijos
            </Text>
          </View>
          <Text style={m1TextStyles.secondary}>
            Todavía no son gasto real: recién al marcarlos pagados entran en Movimientos.
          </Text>
        </Card>
      ) : null}

      {overdueRows.map((row) => (
        <OverdueCard
          key={row.occurrence.id}
          onMarkPaid={() => {
            navigateToSettleOccurrence(row.occurrence.id);
          }}
          onPress={() => {
            navigateToFijoDetail(row.occurrence.id);
          }}
          row={row}
        />
      ))}

      {upcomingRows.length > 0 ? (
        <Card>
          <Text style={styles.sectionEyebrow}>Este mes</Text>
          {upcomingRows.map((row, index) => (
            <FijoListRow
              isFirst={index === 0}
              key={row.occurrence.id}
              onPress={() => {
                navigateToFijoDetail(row.occurrence.id);
              }}
              row={row}
              todayLocal={todayLocal}
            />
          ))}
        </Card>
      ) : null}

      {settledRows.length > 0 ? (
        <Card>
          <Text style={styles.sectionEyebrow}>Pagados en {monthNameLower}</Text>
          {settledRows.map((row, index) => (
            <FijoListRow
              isFirst={index === 0}
              key={row.occurrence.id}
              onPress={() => {
                navigateToFijoDetail(row.occurrence.id);
              }}
              row={row}
              todayLocal={todayLocal}
            />
          ))}
        </Card>
      ) : null}

      {loadState.kind === 'loaded' ? (
        <OutlineButton
          label="+ Agregar gasto fijo"
          onPress={() => {
            navigateToRecurringItemForm();
          }}
        />
      ) : null}
    </AppScreen>
  );
}

function OverdueCard({
  row,
  onPress,
  onMarkPaid,
}: {
  readonly row: FijoRow;
  readonly onPress: () => void;
  readonly onMarkPaid: () => void;
}) {
  const subtitle = [
    `Vencido · era el ${formatShortDueDate(row.occurrence.dueDate)}`,
    row.responsibleName,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' · ');

  return (
    <View style={styles.overdueCard}>
      <View style={styles.overdueIcon}>
        <Ionicons color={themeTokens.colors.surface} name="alert" size={20} />
      </View>
      <View style={styles.overdueBody}>
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.overdueDetail}>
          <View style={styles.overdueTopRow}>
            <Text style={styles.overdueTitle}>{row.title}</Text>
            <Text style={styles.overdueAmount}>
              {formatOccurrenceAmount(row.occurrence.amount, row.occurrence.currency)}
            </Text>
          </View>
          <Text style={styles.overdueSubtitle}>{subtitle}</Text>
        </Pressable>
        <View style={styles.overdueActionRow}>
          <PressableScale haptic onPress={onMarkPaid} style={styles.markPaidButton}>
            <Text style={styles.markPaidLabel}>Marcar pagado</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

function FijoListRow({
  row,
  todayLocal,
  isFirst,
  onPress,
}: {
  readonly row: FijoRow;
  readonly todayLocal: string;
  readonly isFirst: boolean;
  readonly onPress: () => void;
}) {
  const chip =
    row.status === 'UPCOMING'
      ? occurrenceStatusChip(row.status, row.occurrence.dueDate, todayLocal)
      : undefined;

  const subtitleParts: string[] = [];
  if (row.status === 'SETTLED') {
    subtitleParts.push(`✓ ${settledOnLabel(row.occurrence, row.item.kind)}`);
    if (row.responsibleName !== undefined) subtitleParts.push(row.responsibleName);
  } else if (row.status === 'PENDING') {
    subtitleParts.push(`Vence ${formatShortDueDate(row.occurrence.dueDate)}`);
    if (row.responsibleName !== undefined) subtitleParts.push(row.responsibleName);
    subtitleParts.push('estimado');
  } else {
    if (row.responsibleName !== undefined) subtitleParts.push(row.responsibleName);
    subtitleParts.push('estimado');
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !isFirst && styles.rowDivider]}
    >
      <View style={[styles.avatar, { backgroundColor: categoryTint(row.accentColor) }]}>
        <Text style={[styles.avatarText, { color: row.accentColor }]}>{row.initial}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={m1TextStyles.body}>
          {row.title}
        </Text>
        <Text
          numberOfLines={2}
          style={row.status === 'SETTLED' ? styles.settledSubtitle : m1TextStyles.secondary}
        >
          {subtitleParts.join(' · ')}
        </Text>
        {chip === undefined ? null : (
          <View style={styles.upcomingChip}>
            <Text style={styles.upcomingChipText}>{chip.label}</Text>
          </View>
        )}
      </View>
      <Text style={styles.rowAmount}>
        {formatOccurrenceAmount(row.occurrence.amount, row.occurrence.currency)}
      </Text>
    </Pressable>
  );
}

function OutlineButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      haptic
      onPress={onPress}
      style={styles.outlineButton}
    >
      <Text style={styles.outlineButtonLabel}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  summaryEyebrow: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  summaryAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  sectionEyebrow: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  overdueCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.semanticColors.danger.background,
    padding: themeTokens.spacing.cardPadding,
  },
  overdueIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeTokens.semanticColors.danger.foreground,
  },
  overdueBody: {
    flex: 1,
    gap: 8,
  },
  overdueDetail: { gap: 8 },
  overdueTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  overdueTitle: {
    flex: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  overdueAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  overdueSubtitle: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  overdueActionRow: {
    flexDirection: 'row',
  },
  markPaidButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.semanticColors.danger.foreground,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  markPaidLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: themeTokens.spacing.cardGap,
    marginTop: 2,
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
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  settledSubtitle: {
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  upcomingChip: {
    alignSelf: 'flex-start',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.semanticColors.warning.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  upcomingChipText: {
    color: themeTokens.semanticColors.warning.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  rowAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  outlineButton: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.radii.button,
    backgroundColor: 'transparent',
    paddingHorizontal: themeTokens.spacing.cardPadding,
    paddingVertical: 12,
  },
  outlineButtonLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
