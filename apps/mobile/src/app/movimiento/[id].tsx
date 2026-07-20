import type { Category, HouseholdMember, PaymentSource, Transaction } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, Card, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import { navigateToNewExpense } from '@/navigation/new-expense-route';
import { themeTokens } from '@/theme/tokens';
import {
  categoryLabel,
  formatDecimalEs,
  formatFullLocalDate,
  formatMonthLabel,
  formatMovementTimestamp,
  formatOccurredAtTime,
  formatTransactionAmount,
  monthFromLocalDate,
  todayLocalDate,
} from '@/utils/movement-format';

type DetailState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly transaction: Transaction;
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
      readonly members: readonly HouseholdMember[];
    };

export default function MovimientoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [detailState, setDetailState] = useState<DetailState>({ kind: 'loading' });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const load = useCallback(async () => {
    if (household === null) return;
    setDetailState({ kind: 'loading' });
    try {
      const [{ transaction }, { categories }, { paymentSources }, { members }] = await Promise.all([
        catalog.getTransaction(household.id, id),
        catalog.listCategories(household.id),
        catalog.listPaymentSources(household.id),
        getMembers(household.id),
      ]);
      setDetailState({ kind: 'loaded', transaction, categories, paymentSources, members });
    } catch (error) {
      setDetailState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, getMembers, household, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function confirmDelete(): Promise<void> {
    if (household === null) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await catalog.deleteTransaction(household.id, id);
      setConfirmingDelete(false);
      router.back();
    } catch (error) {
      setDeleteError(messageForActionError(error));
    } finally {
      setDeleting(false);
    }
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
        <View>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Detalle del gasto
          </Text>
          {detailState.kind === 'loaded' ? (
            <Text style={m1TextStyles.secondary}>
              {formatMonthLabel(monthFromLocalDate(detailState.transaction.localDate))}
            </Text>
          ) : null}
        </View>
      </View>

      {detailState.kind === 'loading' ? <LoadingContent label="Cargando movimiento…" /> : null}

      {detailState.kind === 'error' ? (
        <View style={styles.content}>
          <InlineNotice tone="error">{detailState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
        </View>
      ) : null}

      {detailState.kind === 'loaded' ? (
        <DetailBody
          categories={detailState.categories}
          members={detailState.members}
          onDeletePress={() => {
            setDeleteError(undefined);
            setConfirmingDelete(true);
          }}
          onEditPress={() => {
            navigateToNewExpense(detailState.transaction.id);
          }}
          paymentSources={detailState.paymentSources}
          transaction={detailState.transaction}
        />
      ) : null}

      {detailState.kind === 'loaded' ? (
        <DeleteConfirmationModal
          error={deleteError}
          loading={deleting}
          onCancel={() => {
            setConfirmingDelete(false);
          }}
          onConfirm={() => void confirmDelete()}
          transaction={detailState.transaction}
          visible={confirmingDelete}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DetailBody({
  transaction,
  categories,
  paymentSources,
  members,
  onEditPress,
  onDeletePress,
}: {
  readonly transaction: Transaction;
  readonly categories: readonly Category[];
  readonly paymentSources: readonly PaymentSource[];
  readonly members: readonly HouseholdMember[];
  readonly onEditPress: () => void;
  readonly onDeletePress: () => void;
}) {
  const todayLocal = todayLocalDate();
  const amount = formatTransactionAmount(transaction);
  const category = categories.find((candidate) => candidate.id === transaction.categoryId);
  const paymentSourceName =
    transaction.paymentSourceId === null
      ? 'Sin medio de pago'
      : (paymentSources.find((source) => source.id === transaction.paymentSourceId)?.name ??
        'Medio de pago eliminado');
  const createdByName =
    members.find((member) => member.userId === transaction.createdBy)?.displayName ?? 'Alguien';
  const initial = transaction.description.trim().charAt(0).toUpperCase() || '·';
  const accentColor = category?.color ?? themeTokens.colors.inkSecondary;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.heroRow}>
          <View style={[styles.avatar, { backgroundColor: `${accentColor}26` }]}>
            <Text style={[styles.avatarText, { color: accentColor }]}>{initial}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={m1TextStyles.body}>{transaction.description}</Text>
            <Text style={m1TextStyles.secondary}>
              {formatMovementTimestamp(transaction, todayLocal)}
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.heroAmount,
            amount.isPositive ? styles.positiveAmount : styles.negativeAmount,
          ]}
        >
          {amount.text}
        </Text>
        <Text style={m1TextStyles.secondary}>
          {transaction.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'} en{' '}
          {transaction.currency === 'USD' ? 'dólares' : 'guaraníes'}
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionEyebrow}>Datos del movimiento</Text>
        <DetailRow
          label="Categoría"
          value={categoryLabel(transaction.categoryId, categories) ?? 'Sin categoría'}
        />
        <DetailRow label="Pagado con" value={paymentSourceName} />
        {transaction.currency === 'USD' ? (
          <DetailRow
            label="Monto original"
            value={`USD ${formatDecimalEs(transaction.amount, 2)} · TC Gs. ${formatDecimalEs(transaction.fxRateToBase ?? '0', 0)}`}
          />
        ) : null}
        <DetailRow label="Fecha" value={formatFullLocalDate(transaction.localDate)} />
        <DetailRow
          label="Cargado por"
          value={`${createdByName} · ${formatOccurredAtTime(transaction.createdAt)}`}
        />
        <DetailRow label="Nota" value={transaction.notes ?? '—'} />
      </Card>

      <View style={styles.actionsRow}>
        <View style={styles.actionColumn}>
          <ActionButton label="Editar" onPress={onEditPress} variant="secondary" />
        </View>
        <View style={styles.actionColumn}>
          <ActionButton label="Eliminar" onPress={onDeletePress} variant="danger" />
        </View>
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

function DeleteConfirmationModal({
  visible,
  transaction,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  readonly visible: boolean;
  readonly transaction: Transaction;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const amount = formatTransactionAmount(transaction);
  const noun = transaction.type === 'EXPENSE' ? 'gasto' : 'ingreso';

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            ¿Eliminar este {noun}?
          </Text>
          <Text style={m1TextStyles.secondary}>
            {transaction.description} · {amount.text} · Se elimina para los dos y los totales del
            mes se recalculan. Esta acción no se puede deshacer.
          </Text>
          {error === undefined ? null : <InlineNotice tone="error">{error}</InlineNotice>}
          <View style={styles.modalActions}>
            <View style={styles.actionColumn}>
              <ActionButton label="Cancelar" onPress={onCancel} variant="secondary" />
            </View>
            <View style={styles.actionColumn}>
              <ActionButton
                label="Eliminar"
                loading={loading}
                onPress={onConfirm}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  heroAmount: {
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
  },
  positiveAmount: {
    color: themeTokens.semanticColors.success.foreground,
  },
  negativeAmount: {
    color: themeTokens.colors.ink,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
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
  actionsRow: {
    flexDirection: 'row',
    gap: themeTokens.spacing.cardGap,
  },
  actionColumn: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(38, 48, 44, 0.55)',
  },
  modalSheet: {
    width: '100%',
    gap: themeTokens.spacing.cardGap,
    borderTopLeftRadius: themeTokens.radii.modal,
    borderTopRightRadius: themeTokens.radii.modal,
    backgroundColor: themeTokens.colors.surface,
    padding: themeTokens.spacing.screen,
  },
  modalTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
  },
  modalActions: {
    flexDirection: 'row',
    gap: themeTokens.spacing.cardGap,
  },
});
