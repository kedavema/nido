import type { HouseholdMember, Occurrence, RecurringItem } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, Card, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import {
  navigateToExpectedIncomeForm,
  navigateToReceiveOccurrence,
} from '@/navigation/ingresos-routes';
import { themeTokens } from '@/theme/tokens';
import {
  formatOccurrenceAmount,
  formatShortDueDate,
  recurrenceDetailLabel,
  settledOnLabel,
} from '@/utils/fijos-format';
import { formatMonthLabel, monthFromLocalDate } from '@/utils/movement-format';

type DetailState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly occurrence: Occurrence;
      readonly item: RecurringItem;
      readonly history: readonly Occurrence[];
      readonly members: readonly HouseholdMember[];
    };

export default function IngresoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [detailState, setDetailState] = useState<DetailState>({ kind: 'loading' });

  const load = useCallback(
    async (isActive: () => boolean) => {
      if (household === null) return;
      setDetailState({ kind: 'loading' });
      try {
        const [{ occurrences }, { recurringItems }, { members }] = await Promise.all([
          catalog.listOccurrences(household.id),
          catalog.listRecurringItems(household.id),
          getMembers(household.id),
        ]);
        const occurrence = occurrences.find((candidate) => candidate.id === id);
        if (occurrence === undefined) {
          if (isActive()) {
            setDetailState({ kind: 'error', message: 'No encontramos este ingreso.' });
          }
          return;
        }
        const item = recurringItems.find(
          (candidate) => candidate.id === occurrence.recurringItemId,
        );
        if (item === undefined) {
          if (isActive()) {
            setDetailState({ kind: 'error', message: 'No encontramos este ingreso esperado.' });
          }
          return;
        }
        const history = occurrences
          .filter(
            (candidate) =>
              candidate.recurringItemId === item.id &&
              candidate.status === 'SETTLED' &&
              candidate.id !== occurrence.id,
          )
          .sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0));
        if (isActive()) {
          setDetailState({ kind: 'loaded', occurrence, item, history, members });
        }
      } catch (error) {
        if (isActive()) {
          setDetailState({ kind: 'error', message: messageForActionError(error) });
        }
      }
    },
    [catalog, getMembers, household, id],
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
          <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
            {detailState.kind === 'loaded' ? detailState.item.name : 'Ingreso esperado'}
          </Text>
          {detailState.kind === 'loaded' ? (
            <Text style={m1TextStyles.secondary}>
              Ingreso esperado ·{' '}
              {formatMonthLabel(monthFromLocalDate(detailState.occurrence.dueDate)).toLowerCase()}
            </Text>
          ) : null}
        </View>
      </View>

      {detailState.kind === 'loading' ? <LoadingContent label="Cargando ingreso…" /> : null}

      {detailState.kind === 'error' ? (
        <View style={styles.content}>
          <InlineNotice tone="error">{detailState.message}</InlineNotice>
          <ActionButton
            label="Reintentar"
            onPress={() => void load(() => true)}
            variant="secondary"
          />
          <ActionButton
            label="Volver"
            onPress={() => {
              router.back();
            }}
            variant="secondary"
          />
        </View>
      ) : null}

      {detailState.kind === 'loaded' ? (
        <DetailBody
          onEdit={() => {
            navigateToExpectedIncomeForm(detailState.item.id);
          }}
          onReceive={() => {
            navigateToReceiveOccurrence(detailState.occurrence.id);
          }}
          state={detailState}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DetailBody({
  state,
  onEdit,
  onReceive,
}: {
  readonly state: Extract<DetailState, { kind: 'loaded' }>;
  readonly onEdit: () => void;
  readonly onReceive: () => void;
}) {
  const { occurrence, item, history, members } = state;
  const received = occurrence.status === 'SETTLED';
  const responsibleUserId = occurrence.responsibleUserId ?? item.responsibleUserId;
  const responsibleName =
    responsibleUserId === null
      ? undefined
      : members.find((member) => member.userId === responsibleUserId)?.displayName;
  const responsibleLabel = responsibleName ?? 'Sin responsable';

  const badgeLabel = received ? 'Recibido' : `Esperado · ${formatShortDueDate(occurrence.dueDate)}`;

  const heroCaption = received
    ? [
        settledOnLabel(occurrence, 'INCOME'),
        responsibleName === undefined ? undefined : `lo recibe ${responsibleName}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(' · ')
    : [
        'Importe estimado',
        responsibleName === undefined ? undefined : `lo recibe ${responsibleName}`,
        'todavía no cuenta en el balance',
      ]
        .filter((part): part is string => part !== undefined)
        .join(' · ');

  const heroStyles = received ? SUCCESS_HERO : WARNING_HERO;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.heroCard, heroStyles.card]}>
        <View style={styles.heroChip}>
          <View style={[styles.heroChipPill, heroStyles.pill]}>
            <Text style={styles.heroChipText}>{badgeLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroAmount}>
          {formatOccurrenceAmount(occurrence.amount, occurrence.currency)}
        </Text>
        <Text style={[styles.heroCaption, heroStyles.text]}>{heroCaption}</Text>
      </View>

      <Card>
        <Text style={styles.sectionEyebrow}>Configuración</Text>
        <DetailRow label="Recurrencia" value={recurrenceDetailLabel(item)} isFirst />
        <DetailRow label="Lo recibe" value={responsibleLabel} />
        <DetailRow label="Nota" value={item.description ?? '—'} />
      </Card>

      {history.length > 0 ? (
        <Card>
          <Text style={styles.sectionEyebrow}>Historial</Text>
          {history.map((past) => (
            <View key={past.id} style={styles.historyRow}>
              <Text style={m1TextStyles.body}>
                {formatMonthLabel(monthFromLocalDate(past.dueDate)).replace(/\s\d{4}$/u, '')}
              </Text>
              <Text style={styles.historyValue}>
                ✓ {formatOccurrenceAmount(past.amount, past.currency)} ·{' '}
                {settledOnLabel(past, 'INCOME').toLowerCase()}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.footer}>
        {received ? null : <ActionButton label="Marcar como recibido" onPress={onReceive} />}
        <ActionButton label="Editar ingreso" onPress={onEdit} variant="secondary" />
      </View>
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  isFirst = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly isFirst?: boolean;
}) {
  return (
    <View style={[styles.detailRow, isFirst && styles.detailRowFirst]}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const SUCCESS_HERO = {
  card: { backgroundColor: themeTokens.semanticColors.success.background },
  pill: { backgroundColor: themeTokens.semanticColors.success.foreground },
  text: { color: themeTokens.semanticColors.success.foreground },
} as const;

const WARNING_HERO = {
  card: { backgroundColor: themeTokens.semanticColors.warning.background },
  pill: { backgroundColor: themeTokens.semanticColors.warning.foreground },
  text: { color: themeTokens.semanticColors.warning.foreground },
} as const;

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
  headerTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  content: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.screen,
  },
  heroCard: {
    gap: 8,
    borderRadius: themeTokens.radii.card,
    padding: themeTokens.spacing.cardPadding,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroChipPill: {
    alignSelf: 'flex-start',
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroChipText: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  heroAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  heroCaption: {
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 23,
  },
  sectionEyebrow: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: themeTokens.spacing.cardGap,
  },
  detailRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  detailValue: {
    flex: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    textAlign: 'right',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyValue: {
    flex: 1,
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    textAlign: 'right',
  },
  footer: {
    gap: themeTokens.spacing.cardGap,
    marginTop: themeTokens.spacing.base,
  },
});
