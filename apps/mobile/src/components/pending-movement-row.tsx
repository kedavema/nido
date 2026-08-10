import type { Category, CreateTransactionRequest } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SyncStatusPill, m1TextStyles } from '@/components/m1-ui';
import type { QueuedMutation } from '@/sync/sync-store.types';
import { isCreateTransactionPayload } from '@/sync/sync-queue';
import { themeTokens } from '@/theme/tokens';
import { previewUsdToBasePyg } from '@/utils/expense-form';
import { categoryLabel, formatSignedPygAmount } from '@/utils/movement-format';

/**
 * A queued expense's amount in guaraníes.
 *
 * The sign is always negative because the offline queue only ever carries expenses; for USD it is
 * only a client-side estimate (`previewUsdToBasePyg`), since the server-computed `baseAmountPyg`
 * does not exist yet for an unsynced mutation.
 */
export function formatQueuedExpenseAmount(request: CreateTransactionRequest): {
  readonly text: string;
  readonly isPositive: boolean;
} {
  const baseAmountPyg =
    request.currency === 'PYG'
      ? request.amount
      : previewUsdToBasePyg(request.amount, request.fxRateToBase ?? '0');
  return formatSignedPygAmount(-BigInt(baseAmountPyg));
}

/**
 * One expense sitting in the offline queue, rendered as a movement row.
 *
 * Shared by Movimientos and Inicio's "Recientes": a queued mutation has by definition not reached
 * the server, so it is in neither screen's fetched list and has to come from `useSyncQueue`.
 *
 * `payload` is typed `unknown` on `QueuedMutation`, so `isCreateTransactionPayload` is what makes
 * the row renderable at all; a mutation of any other shape renders nothing rather than guessing.
 *
 * An errored mutation wraps in a `Pressable` that retries. A pending or syncing one does not —
 * there is nothing for a tap to do while the queue is already working on it.
 */
export function PendingMovementRow({
  mutation,
  categories,
  isLast,
  onRetry,
}: {
  readonly mutation: QueuedMutation;
  readonly categories: readonly Category[];
  readonly isLast: boolean;
  readonly onRetry: () => void;
}) {
  if (!isCreateTransactionPayload(mutation.payload)) {
    return null;
  }

  const { request } = mutation.payload;
  const amount = formatQueuedExpenseAmount(request);
  const categoryLabelText = categoryLabel(request.categoryId, categories) ?? 'Sin categoría';
  const statusIconName =
    mutation.status === 'syncing'
      ? 'sync'
      : mutation.status === 'error'
        ? 'alert-circle'
        : 'time-outline';

  const row = (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.avatar}>
        <Ionicons color={themeTokens.colors.inkSecondary} name={statusIconName} size={18} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={m1TextStyles.body}>
          {request.description}
        </Text>
        <Text numberOfLines={1} style={m1TextStyles.secondary}>
          {categoryLabelText}
        </Text>
        {mutation.status === 'syncing' ? (
          <Text style={m1TextStyles.secondary}>Sincronizando…</Text>
        ) : (
          <SyncStatusPill tone={mutation.status === 'error' ? 'error' : 'pending'} />
        )}
      </View>
      <Text style={styles.amount}>{amount.text}</Text>
    </View>
  );

  if (mutation.status !== 'error') {
    return row;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onRetry}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  amount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
