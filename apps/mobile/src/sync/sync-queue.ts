import type { CreateTransactionRequest, CreateTransactionResponse } from '@nido/contracts';
import type { NetInfoState } from '@react-native-community/netinfo';

// Relative import (not the `@/` alias used elsewhere in apps/mobile): this module is unit-tested
// directly by sync-queue.test.ts, and vitest.config.ts has no alias resolution configured (see
// the existing precedent in session-machine.ts, the one other pure/tested module in this app).
import { ApiError } from '../api/client';

import type { QueuedMutation, SyncStore } from './sync-store.types';

/**
 * The only queued-mutation kind M4/T-402 knows how to replay. `QueuedMutation.type` is
 * intentionally an open string (see sync-store.types.ts), so this module only ever acts on
 * mutations tagged with this exact value and otherwise leaves them alone.
 */
export const CREATE_TRANSACTION_MUTATION_TYPE = 'create-transaction';

/** Shape stored in `QueuedMutation.payload` for a `create-transaction` mutation. */
export interface CreateTransactionQueuedPayload {
  readonly householdId: string;
  readonly request: CreateTransactionRequest;
}

export type CreateExpenseOutcome = 'created' | 'queued';

export interface CreateExpenseResult {
  readonly outcome: CreateExpenseOutcome;
}

/**
 * Narrows `QueuedMutation.payload` (typed `unknown` by the storage contract) to the shape this
 * module writes. Defensive against any malformed/foreign record ending up in the store rather
 * than trusting every row blindly.
 */
export function isCreateTransactionPayload(
  payload: unknown,
): payload is CreateTransactionQueuedPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as { householdId?: unknown; request?: unknown };
  return typeof candidate.householdId === 'string' && typeof candidate.request === 'object';
}

export interface SyncQueueEngineDeps {
  readonly syncStore: SyncStore;
  readonly createTransaction: (
    householdId: string,
    request: CreateTransactionRequest,
  ) => Promise<CreateTransactionResponse>;
  /** Generates the idempotency key / queue id for a new mutation. */
  readonly generateMutationId: () => string;
  /**
   * Invoked after every store-mutating operation (enqueue/updateStatus/remove) so a caller (the
   * React provider) can refresh its snapshot of the queue. Optional so the engine stays usable
   * standalone in tests without a UI to notify.
   */
  readonly onQueueChanged?: () => void;
}

export interface SyncQueueEngine {
  /**
   * Always attempts the direct request first (per docs/system-design.md §10: the online path
   * tries `POST /transactions` before ever touching the local queue). Only a genuine network
   * failure (`ApiError.kind === 'network'`) falls back to enqueueing — a misreported/flaky
   * connectivity signal must never block a request that might actually succeed. Any other error
   * (validation, auth, a real 409 conflict, …) rethrows unchanged for the caller to surface.
   */
  readonly createExpense: (
    householdId: string,
    request: CreateTransactionRequest,
  ) => Promise<CreateExpenseResult>;
  /** Replays a single queued mutation by id, e.g. a user tapping a `error` item to retry it. */
  readonly retry: (mutationId: string) => Promise<void>;
  /**
   * Replays every currently pending/error mutation, independently — one stuck/failing item never
   * blocks the rest of the queue from being attempted.
   */
  readonly drainPending: () => Promise<void>;
  /**
   * Removes every pending mutation from the store. Only ever meant to be called after the caller
   * has already obtained explicit user confirmation (ADR 0008 / §11: never a silent bulk clear).
   */
  readonly discardAllPending: () => Promise<void>;
}

function networkErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No se pudo sincronizar. Volvemos a intentar.';
}

export function createSyncQueueEngine({
  syncStore,
  createTransaction,
  generateMutationId,
  onQueueChanged,
}: SyncQueueEngineDeps): SyncQueueEngine {
  function notifyChanged(): void {
    onQueueChanged?.();
  }

  async function replay(mutation: QueuedMutation): Promise<void> {
    if (
      mutation.type !== CREATE_TRANSACTION_MUTATION_TYPE ||
      !isCreateTransactionPayload(mutation.payload)
    ) {
      // Not a mutation kind this module understands (or a malformed record) — nothing to replay.
      return;
    }

    await syncStore.updateStatus(mutation.id, 'syncing');
    notifyChanged();

    try {
      await createTransaction(mutation.payload.householdId, mutation.payload.request);
      // A synced mutation is removed outright rather than marked `synced`: per
      // docs/system-design.md §6.9, a synced item should never remain visible as a queue row —
      // it just shows up as a normal transaction on the next list refresh.
      await syncStore.remove(mutation.id);
    } catch (error) {
      await syncStore.updateStatus(mutation.id, 'error', networkErrorMessage(error));
    } finally {
      notifyChanged();
    }
  }

  return {
    async createExpense(householdId, request) {
      const clientMutationId = generateMutationId();
      const requestWithId: CreateTransactionRequest = { ...request, clientMutationId };

      try {
        await createTransaction(householdId, requestWithId);
        return { outcome: 'created' };
      } catch (error) {
        if (!(error instanceof ApiError) || error.kind !== 'network') {
          throw error;
        }

        await syncStore.enqueue({
          id: clientMutationId,
          type: CREATE_TRANSACTION_MUTATION_TYPE,
          payload: { householdId, request: requestWithId } satisfies CreateTransactionQueuedPayload,
        });
        notifyChanged();
        return { outcome: 'queued' };
      }
    },

    async retry(mutationId) {
      const mutations = await syncStore.list();
      const mutation = mutations.find((candidate) => candidate.id === mutationId);
      if (mutation === undefined) {
        return;
      }
      await replay(mutation);
    },

    async drainPending() {
      const pending = await syncStore.getPending();
      for (const mutation of pending) {
        // Sequential and independent on purpose: one failing mutation must not prevent the rest
        // of the queue from being attempted.
        await replay(mutation);
      }
    },

    async discardAllPending() {
      const pending = await syncStore.getPending();
      for (const mutation of pending) {
        await syncStore.remove(mutation.id);
      }
      notifyChanged();
    },
  };
}

/**
 * Tracks offline→online transitions so a NetInfo listener can drain the queue exactly once per
 * transition instead of on every connectivity event (most of which don't change anything).
 */
export interface ReconnectDetector {
  /** Feed the latest online/offline reading; returns true only on an offline→online transition. */
  readonly observe: (isOnline: boolean) => boolean;
}

export function createReconnectDetector(initiallyOffline = false): ReconnectDetector {
  let wasOffline = initiallyOffline;

  return {
    observe(isOnline) {
      const reconnected = wasOffline && isOnline;
      wasOffline = !isOnline;
      return reconnected;
    },
  };
}

/**
 * Decides whether a `NetInfo` reading counts as "online" for reconnect-detection purposes
 * (pairs with `createReconnectDetector`, which consumes its boolean output). Pulled out of
 * `sync-queue-provider.tsx`'s `NetInfo.addEventListener` callback so the connectivity rule is a
 * plain, directly-testable function instead of inline logic only exercisable through a live
 * NetInfo event.
 *
 * `isInternetReachable` is `boolean | null` on `NetInfoState` — NetInfo reports `null` while it
 * hasn't finished determining reachability yet (see the library's own `NetInfoConnectedState`/
 * `NetInfoUnknownState` types). Only an explicit `false` counts as offline; an unknown reading
 * must not be treated as offline, or every app start would flash offline before NetInfo settles.
 * `isConnected` is checked first and strictly, since `false`/`null` there means there is no
 * transport at all regardless of what `isInternetReachable` says.
 */
export function isNetInfoStateOnline(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** What `mas.tsx`'s sign-out button should do given how many mutations are still queued. */
export type SignOutDecision = 'sign-out-immediately' | 'warn-about-pending';

/**
 * The pure decision behind `mas.tsx`'s `handleSignOutPress` (see §11 / ADR 0008): a queued
 * mutation is tied to whoever is signed in when it finally syncs, so signing out while any are
 * still pending must warn explicitly instead of discarding them silently. Extracted so the
 * invariant is directly testable without rendering the screen's modal (this repo has no
 * component-render test harness).
 */
export function decideSignOutFlow(pendingCount: number): SignOutDecision {
  return pendingCount > 0 ? 'warn-about-pending' : 'sign-out-immediately';
}
