/**
 * Status of a queued mutation as it moves through the offline sync lifecycle.
 *
 * - `pending`: enqueued, never attempted (or waiting for the next attempt after
 *   returning to `pending` deliberately).
 * - `syncing`: an attempt is currently in flight.
 * - `synced`: the API confirmed the mutation; terminal state.
 * - `error`: the last attempt failed; `lastError` carries the reason.
 */
export type QueuedMutationStatus = 'pending' | 'syncing' | 'synced' | 'error';

/**
 * A single offline mutation waiting to be replayed against the API.
 *
 * `id` doubles as the idempotency key sent to the API when the mutation is
 * eventually replayed, so callers must generate a stable, unique id per
 * mutation (a UUID) rather than relying on storage-assigned identifiers.
 */
export interface QueuedMutation {
  readonly id: string;
  /** Kind of mutation, e.g. `'create-transaction'`. Intentionally an open string, not a closed union. */
  readonly type: string;
  /** JSON-serializable request body to replay against the API. */
  readonly payload: unknown;
  readonly status: QueuedMutationStatus;
  readonly attempts: number;
  readonly createdAt: string;
  readonly lastError: string | null;
}

/**
 * Platform-agnostic offline mutation queue.
 *
 * Implementations persist mutations locally (SQLite on native, IndexedDB on
 * web) so M4's local queue can create expenses/incomes while offline and
 * replay them once connectivity returns. This interface intentionally has no
 * "clear on logout" method: per docs/system-design.md §11, an unsynced
 * mutation must never be silently discarded on logout without explicitly
 * warning the user, so that decision belongs to the caller/UI layer, not to
 * the storage abstraction.
 */
export interface SyncStore {
  /**
   * Persists a new mutation with `status: 'pending'`, `attempts: 0`, and
   * `lastError: null` — a fresh mutation has never been attempted, so the
   * caller does not supply any of those fields. `createdAt` defaults to the
   * current time (ISO string) when omitted.
   */
  readonly enqueue: (
    mutation: Omit<QueuedMutation, 'status' | 'attempts' | 'createdAt' | 'lastError'> & {
      readonly createdAt?: string;
    },
  ) => Promise<QueuedMutation>;
  /** Returns every queued mutation in insertion (enqueue) order. */
  readonly list: () => Promise<QueuedMutation[]>;
  /** Returns mutations that still need to be synced: `pending` or `error`. */
  readonly getPending: () => Promise<QueuedMutation[]>;
  /**
   * Transitions a mutation to `status`. `lastError` is stored alongside the
   * new status (defaulting to `null` when omitted) and `attempts` increments
   * only when the new status is `error` — see the native/web implementations
   * for the exact rule.
   */
  readonly updateStatus: (
    id: string,
    status: QueuedMutationStatus,
    lastError?: string | null,
  ) => Promise<void>;
  /** Deletes a mutation from the queue, e.g. after it syncs successfully. */
  readonly remove: (id: string) => Promise<void>;
}
