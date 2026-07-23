import type { Category, HouseholdMember, Occurrence, RecurringItem } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, Card, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import {
  navigateToExpectedIncomeForm,
  navigateToIngresoDetail,
  navigateToReceiveOccurrence,
} from '@/navigation/ingresos-routes';
import { themeTokens } from '@/theme/tokens';
import { formatOccurrenceAmount, formatShortDueDate, settledOnLabel } from '@/utils/fijos-format';
import { receivedPercentage, sumExpectedPyg, sumSettledPyg } from '@/utils/ingresos-format';
import {
  formatMonthLabel,
  formatPygMagnitude,
  monthFromLocalDate,
  monthLocalDateRange,
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

/** An income occurrence joined to its recurring item + resolved display metadata, for one ING-01 row. */
interface IngresoRow {
  readonly occurrence: Occurrence;
  readonly item: RecurringItem;
  readonly received: boolean;
  readonly title: string;
  readonly initial: string;
  readonly accentColor: string;
  readonly responsibleName: string | undefined;
}

/** Reconstruct a `MonthValue` from a `yyyy-MM` query param, falling back to the current month. */
function monthFromParam(monthParam: string | undefined, todayLocal: string): MonthValue {
  if (monthParam === undefined || !/^\d{4}-\d{2}$/u.test(monthParam)) {
    return monthFromLocalDate(todayLocal);
  }
  return monthFromLocalDate(`${monthParam}-01`);
}

export default function IngresosScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const todayLocal = todayLocalDate();
  const month = useMemo(() => monthFromParam(monthParam, todayLocal), [monthParam, todayLocal]);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(
    async (isActive: () => boolean) => {
      if (household === null) return;
      setLoadState({ kind: 'loading' });
      const { from, to } = monthLocalDateRange(month);
      try {
        // Listing occurrences triggers the server's lazy-on-read sweep (T-505), so this is also what
        // keeps OVERDUE statuses fresh for the month being viewed.
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

  // Occurrences carry no `kind`, so the income list is the join of every occurrence whose recurring
  // item is `kind === 'INCOME'` — the exact inverse of what the Fijos list does for EXPENSE.
  const incomeContext = useMemo(() => {
    if (loadState.kind !== 'loaded') {
      return { rows: [] as readonly IngresoRow[], occurrences: [] as readonly Occurrence[] };
    }
    const incomeItemsById = new Map(
      loadState.recurringItems
        .filter((item) => item.kind === 'INCOME')
        .map((item) => [item.id, item]),
    );
    const categoriesById = new Map(loadState.categories.map((category) => [category.id, category]));
    const membersById = new Map(loadState.members.map((member) => [member.userId, member]));

    const incomeOccurrences = loadState.occurrences.filter(
      (occurrence) =>
        incomeItemsById.has(occurrence.recurringItemId) && occurrence.status !== 'SKIPPED',
    );

    const rows = incomeOccurrences
      .map((occurrence): IngresoRow | null => {
        const item = incomeItemsById.get(occurrence.recurringItemId);
        if (item === undefined) return null;
        const responsibleUserId = occurrence.responsibleUserId ?? item.responsibleUserId;
        return {
          occurrence,
          item,
          received: occurrence.status === 'SETTLED',
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
      .filter((row): row is IngresoRow => row !== null)
      .sort((a, b) =>
        a.occurrence.dueDate < b.occurrence.dueDate
          ? -1
          : a.occurrence.dueDate > b.occurrence.dueDate
            ? 1
            : 0,
      );

    return { rows, occurrences: incomeOccurrences };
  }, [loadState]);

  const { rows, occurrences: incomeOccurrences } = incomeContext;
  const receivedTotal = sumSettledPyg(incomeOccurrences);
  const expectedTotal = sumExpectedPyg(incomeOccurrences);
  const percentage = receivedPercentage(receivedTotal, expectedTotal);
  const monthNameLower = formatMonthLabel(month)
    .replace(/\s\d{4}$/u, '')
    .toLowerCase();

  if (household === null) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <LoadingContent />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={20} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Ingresos de {monthNameLower}
          </Text>
          <Text style={m1TextStyles.secondary}>{household.name}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listArea}>
        {loadState.kind === 'loading' ? <LoadingContent label="Cargando ingresos…" /> : null}

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

        {loadState.kind === 'loaded' ? (
          <Card>
            <Text style={styles.summaryEyebrow}>Recibidos</Text>
            <Text style={styles.summaryAmount}>+Gs. {formatPygMagnitude(receivedTotal)}</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${percentage.toString()}%` as `${number}%` },
                ]}
              />
            </View>
            <Text style={m1TextStyles.secondary}>
              de Gs. {formatPygMagnitude(expectedTotal)} esperados · {percentage.toString()} % · el
              Balance del mes solo cuenta lo recibido
            </Text>
          </Card>
        ) : null}

        {loadState.kind === 'loaded' && rows.length === 0 ? (
          <Card>
            <Text style={m1TextStyles.sectionTitle}>Todavía no hay ingresos esperados</Text>
            <Text style={m1TextStyles.secondary}>
              Anotá lo que esperás cobrar —sueldos, trabajos, reembolsos— y marcalo recibido cuando
              llegue para que sume al balance del mes.
            </Text>
          </Card>
        ) : null}

        {rows.length > 0 ? (
          <Card>
            <Text style={styles.sectionEyebrow}>Este mes</Text>
            {rows.map((row, index) => (
              <IngresoListRow
                isFirst={index === 0}
                key={row.occurrence.id}
                onPress={() => {
                  navigateToIngresoDetail(row.occurrence.id);
                }}
                onReceive={() => {
                  navigateToReceiveOccurrence(row.occurrence.id);
                }}
                row={row}
              />
            ))}
          </Card>
        ) : null}

        {loadState.kind === 'loaded' ? (
          <OutlineButton
            label="+ Agregar ingreso esperado"
            onPress={() => {
              navigateToExpectedIncomeForm();
            }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function IngresoListRow({
  row,
  isFirst,
  onPress,
  onReceive,
}: {
  readonly row: IngresoRow;
  readonly isFirst: boolean;
  readonly onPress: () => void;
  readonly onReceive: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, !isFirst && styles.rowDivider]}
    >
      {row.received ? (
        <View style={styles.receivedAvatar}>
          <Ionicons
            color={themeTokens.semanticColors.success.foreground}
            name="arrow-down"
            size={20}
          />
        </View>
      ) : (
        <View style={[styles.avatar, { backgroundColor: `${row.accentColor}26` }]}>
          <Text style={[styles.avatarText, { color: row.accentColor }]}>{row.initial}</Text>
        </View>
      )}
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={m1TextStyles.body}>
          {row.title}
        </Text>
        {row.received ? (
          <Text numberOfLines={1} style={styles.receivedSubtitle}>
            ✓ {settledOnLabel(row.occurrence, 'INCOME')}
          </Text>
        ) : (
          <View style={styles.expectedBadge}>
            <Text style={styles.expectedBadgeText}>
              Esperado · {formatShortDueDate(row.occurrence.dueDate)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.rowAmountColumn}>
        <Text style={[styles.rowAmount, row.received && styles.rowAmountReceived]}>
          {row.received ? '+' : ''}
          {formatOccurrenceAmount(row.occurrence.amount, row.occurrence.currency)}
        </Text>
        {row.received ? null : (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onReceive}>
            <Text style={styles.receiveLink}>Marcar recibido</Text>
          </Pressable>
        )}
      </View>
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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
    >
      <Text style={styles.outlineButtonLabel}>{label}</Text>
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
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.base,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: themeTokens.colors.surface,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  listArea: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    padding: themeTokens.spacing.screen,
    paddingBottom: 32,
  },
  summaryEyebrow: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: themeTokens.colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: themeTokens.semanticColors.success.foreground,
  },
  sectionEyebrow: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  receivedAvatar: {
    width: 40,
    height: 40,
    borderRadius: themeTokens.radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeTokens.semanticColors.success.background,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  receivedSubtitle: {
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  expectedBadge: {
    alignSelf: 'flex-start',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.semanticColors.warning.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  expectedBadgeText: {
    color: themeTokens.semanticColors.warning.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  rowAmountColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  rowAmountReceived: {
    color: themeTokens.semanticColors.success.foreground,
  },
  receiveLink: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
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
  pressed: {
    opacity: 0.78,
  },
});
