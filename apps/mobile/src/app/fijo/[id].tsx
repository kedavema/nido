import type {
  Category,
  HouseholdMember,
  Occurrence,
  PaymentSource,
  RecurringItem,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, Card, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import { navigateToRecurringItemForm, navigateToSettleOccurrence } from '@/navigation/fijos-routes';
import { themeTokens } from '@/theme/tokens';
import {
  avisosLabel,
  deriveOccurrenceDisplayStatus,
  formatOccurrenceAmount,
  occurrenceStatusChip,
  occurrenceSubheader,
  recurrenceDetailLabel,
  settledOnLabel,
  type FijoTone,
} from '@/utils/fijos-format';
import {
  categoryLabel,
  formatMonthLabel,
  monthFromLocalDate,
  todayLocalDate,
} from '@/utils/movement-format';

type DetailState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly occurrence: Occurrence;
      readonly item: RecurringItem;
      readonly history: readonly Occurrence[];
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
      readonly members: readonly HouseholdMember[];
    };

const HERO_TONE_STYLE: Record<FijoTone, { card: object; text: object }> = {
  danger: {
    card: { backgroundColor: themeTokens.semanticColors.danger.background },
    text: { color: themeTokens.semanticColors.danger.foreground },
  },
  warning: {
    card: { backgroundColor: themeTokens.semanticColors.warning.background },
    text: { color: themeTokens.semanticColors.warning.foreground },
  },
  success: {
    card: { backgroundColor: themeTokens.semanticColors.success.background },
    text: { color: themeTokens.semanticColors.success.foreground },
  },
  neutral: {
    card: { backgroundColor: themeTokens.colors.surface },
    text: { color: themeTokens.colors.inkSecondary },
  },
};

export default function FijoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [detailState, setDetailState] = useState<DetailState>({ kind: 'loading' });

  const load = useCallback(
    async (isActive: () => boolean) => {
      if (household === null) return;
      setDetailState({ kind: 'loading' });
      try {
        const [
          { occurrences },
          { recurringItems },
          { categories },
          { paymentSources },
          { members },
        ] = await Promise.all([
          catalog.listOccurrences(household.id),
          catalog.listRecurringItems(household.id),
          catalog.listCategories(household.id),
          catalog.listPaymentSources(household.id),
          getMembers(household.id),
        ]);
        const occurrence = occurrences.find((candidate) => candidate.id === id);
        if (occurrence === undefined) {
          if (isActive()) {
            setDetailState({ kind: 'error', message: 'No encontramos este vencimiento.' });
          }
          return;
        }
        const item = recurringItems.find(
          (candidate) => candidate.id === occurrence.recurringItemId,
        );
        if (item === undefined) {
          if (isActive()) {
            setDetailState({ kind: 'error', message: 'No encontramos este gasto fijo.' });
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
          setDetailState({
            kind: 'loaded',
            occurrence,
            item,
            history,
            categories,
            paymentSources,
            members,
          });
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
            {detailState.kind === 'loaded' ? detailState.item.name : 'Gasto fijo'}
          </Text>
          {detailState.kind === 'loaded' ? (
            <Text style={m1TextStyles.secondary}>
              {occurrenceSubheader(detailState.item, detailState.occurrence, detailState.item.kind)}
            </Text>
          ) : null}
        </View>
      </View>

      {detailState.kind === 'loading' ? <LoadingContent label="Cargando fijo…" /> : null}

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
            navigateToRecurringItemForm(detailState.item.id);
          }}
          onMarkPaid={() => {
            navigateToSettleOccurrence(detailState.occurrence.id);
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
  onMarkPaid,
}: {
  readonly state: Extract<DetailState, { kind: 'loaded' }>;
  readonly onEdit: () => void;
  readonly onMarkPaid: () => void;
}) {
  const { occurrence, item, history, categories, paymentSources, members } = state;
  const todayLocal = todayLocalDate();
  const status = deriveOccurrenceDisplayStatus(occurrence, todayLocal);
  const chip = occurrenceStatusChip(status, occurrence.dueDate, todayLocal);
  const tone = HERO_TONE_STYLE[chip.tone];
  const responsibleUserId = occurrence.responsibleUserId ?? item.responsibleUserId;
  const responsibleName =
    responsibleUserId === null
      ? 'Sin responsable'
      : (members.find((member) => member.userId === responsibleUserId)?.displayName ??
        'Sin responsable');
  const paymentSourceName = item.paymentSourceId ?? null;
  const paymentLabel =
    paymentSourceName === null
      ? undefined
      : paymentSources.find((source) => source.id === paymentSourceName)?.name;

  const heroCaption =
    status === 'SETTLED'
      ? [settledOnLabel(occurrence, item.kind), `responsable: ${responsibleName}`, paymentLabel]
          .filter((part): part is string => part !== undefined && part !== '')
          .join(' · ')
      : `Importe ${item.kind === 'INCOME' ? 'esperado' : 'estimado'} · responsable: ${responsibleName} · todavía no es gasto real`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.heroCard, tone.card]}>
        <View style={styles.heroChip}>
          {chip.tone === 'danger' ? (
            <Ionicons color={themeTokens.colors.surface} name="alert" size={14} />
          ) : null}
          <View style={[styles.heroChipPill, heroChipToneStyle(chip.tone)]}>
            <Text
              style={[
                styles.heroChipText,
                chip.tone === 'neutral' ? styles.heroChipTextNeutral : null,
              ]}
            >
              {chip.label}
            </Text>
          </View>
        </View>
        <Text style={styles.heroAmount}>
          {formatOccurrenceAmount(occurrence.amount, occurrence.currency)}
        </Text>
        <Text style={[styles.heroCaption, tone.text]}>{heroCaption}</Text>
      </View>

      <Card>
        <Text style={styles.sectionEyebrow}>Configuración</Text>
        <DetailRow
          label="Categoría"
          value={categoryLabel(item.categoryId, categories) ?? 'Sin categoría'}
        />
        <DetailRow label="Recurrencia" value={recurrenceDetailLabel(item)} />
        <DetailRow label="Responsable" value={responsibleName} />
        <DetailRow label="Avisos" value={avisosLabel(item.notificationOffsets)} />
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
                {settledOnLabel(past, item.kind).toLowerCase()}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.footer}>
        {status === 'SETTLED' ? null : (
          <ActionButton label="Marcar como pagado" onPress={onMarkPaid} />
        )}
        <ActionButton label="Editar fijo" onPress={onEdit} variant="secondary" />
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function heroChipToneStyle(tone: FijoTone): object {
  switch (tone) {
    case 'danger':
      return { backgroundColor: themeTokens.semanticColors.danger.foreground };
    case 'warning':
      return { backgroundColor: themeTokens.semanticColors.warning.foreground };
    case 'success':
      return { backgroundColor: themeTokens.semanticColors.success.foreground };
    case 'neutral':
      return { backgroundColor: themeTokens.colors.surfaceMuted };
  }
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
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroChipText: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  heroChipTextNeutral: {
    color: themeTokens.colors.ink,
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
