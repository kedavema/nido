import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';

import {
  createReconnectDetector,
  createSyncQueueEngine,
  isCreateTransactionPayload,
  type CreateTransactionQueuedPayload,
} from './sync-queue';
import type { QueuedMutation, QueuedMutationStatus, SyncStore } from './sync-store.types';

/**
 * Minimal in-memory `SyncStore`, mirroring the real implementations' documented rules (see
 * sync-store.ts/.web.ts): `attempts` only increments on a transition to `error`, and `enqueue`
 * always starts a mutation at `status: 'pending'`, `attempts: 0`.
 */
function createFakeSyncStore(): SyncStore {
  const rows: QueuedMutation[] = [];

  return {
    enqueue: (mutation) => {
      const record: QueuedMutation = {
        id: mutation.id,
        type: mutation.type,
        payload: mutation.payload,
        status: 'pending',
        attempts: 0,
        createdAt: mutation.createdAt ?? new Date().toISOString(),
        lastError: null,
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    list: () => Promise.resolve([...rows]),
    getPending: () =>
      Promise.resolve(rows.filter((row) => row.status === 'pending' || row.status === 'error')),
    updateStatus: (id, status: QueuedMutationStatus, lastError = null) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) {
        return Promise.resolve();
      }
      const existing = rows[index];
      if (existing === undefined) {
        return Promise.resolve();
      }
      rows[index] = {
        ...existing,
        status,
        lastError,
        attempts: status === 'error' ? existing.attempts + 1 : existing.attempts,
      };
      return Promise.resolve();
    },
    remove: (id) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index !== -1) {
        rows.splice(index, 1);
      }
      return Promise.resolve();
    },
  };
}

const householdId = '00000000-0000-4000-8000-000000000011';
const categoryId = '00000000-0000-4000-8000-000000000013';

function baseRequest() {
  return {
    type: 'EXPENSE' as const,
    amount: '10000',
    currency: 'PYG' as const,
    occurredAt: '2026-07-15T12:00:00.000Z',
    categoryId,
    description: 'Almuerzo',
  };
}

describe('sync queue engine', () => {
  let mutationCounter = 0;

  beforeEach(() => {
    mutationCounter = 0;
  });

  function generateMutationId(): string {
    mutationCounter += 1;
    return `mutation-${mutationCounter.toString()}`;
  }

  it('creates an expense directly when online, without touching the queue', async () => {
    const syncStore = createFakeSyncStore();
    const createTransaction = vi.fn().mockResolvedValue({ transaction: {} });
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    const result = await engine.createExpense(householdId, baseRequest());

    expect(result).toEqual({ outcome: 'created' });
    expect(createTransaction).toHaveBeenCalledOnce();
    expect(createTransaction).toHaveBeenCalledWith(householdId, {
      ...baseRequest(),
      clientMutationId: 'mutation-1',
    });
    await expect(syncStore.list()).resolves.toEqual([]);
  });

  it('falls back to the local queue on a network failure and returns queued', async () => {
    const syncStore = createFakeSyncStore();
    const createTransaction = vi
      .fn()
      .mockRejectedValue(new ApiError('No pudimos conectarnos.', undefined, 'network'));
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    const result = await engine.createExpense(householdId, baseRequest());

    expect(result).toEqual({ outcome: 'queued' });
    const queued = await syncStore.list();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.id).toBe('mutation-1');
    expect(queued[0]?.type).toBe('create-transaction');
    expect(queued[0]?.status).toBe('pending');
    const payload = queued[0]?.payload as CreateTransactionQueuedPayload;
    expect(payload.householdId).toBe(householdId);
    expect(payload.request).toEqual({ ...baseRequest(), clientMutationId: 'mutation-1' });
  });

  it('rethrows non-network errors without enqueueing anything', async () => {
    const syncStore = createFakeSyncStore();
    const createTransaction = vi
      .fn()
      .mockRejectedValue(new ApiError('Revisá los datos.', 400, 'response'));
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await expect(engine.createExpense(householdId, baseRequest())).rejects.toMatchObject({
      kind: 'response',
    });
    await expect(syncStore.list()).resolves.toEqual([]);
  });

  it('rethrows a non-ApiError without enqueueing anything', async () => {
    const syncStore = createFakeSyncStore();
    const createTransaction = vi.fn().mockRejectedValue(new Error('boom'));
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await expect(engine.createExpense(householdId, baseRequest())).rejects.toThrow('boom');
    await expect(syncStore.list()).resolves.toEqual([]);
  });

  it('retry replays a queued mutation and removes it from the queue on success', async () => {
    const syncStore = createFakeSyncStore();
    await syncStore.enqueue({
      id: 'mutation-1',
      type: 'create-transaction',
      payload: { householdId, request: baseRequest() } satisfies CreateTransactionQueuedPayload,
    });
    const createTransaction = vi.fn().mockResolvedValue({ transaction: {} });
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await engine.retry('mutation-1');

    expect(createTransaction).toHaveBeenCalledWith(householdId, baseRequest());
    await expect(syncStore.list()).resolves.toEqual([]);
  });

  it('retry keeps a failed mutation in the queue as error, with attempts incremented', async () => {
    const syncStore = createFakeSyncStore();
    await syncStore.enqueue({
      id: 'mutation-1',
      type: 'create-transaction',
      payload: { householdId, request: baseRequest() } satisfies CreateTransactionQueuedPayload,
    });
    const createTransaction = vi
      .fn()
      .mockRejectedValue(new ApiError('No pudimos conectarnos.', undefined, 'network'));
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await engine.retry('mutation-1');

    const [mutation] = await syncStore.list();
    expect(mutation?.status).toBe('error');
    expect(mutation?.attempts).toBe(1);
    expect(mutation?.lastError).toBe('No pudimos conectarnos.');

    await engine.retry('mutation-1');
    const [retried] = await syncStore.list();
    expect(retried?.attempts).toBe(2);
  });

  it('retry on an unknown mutation id is a no-op', async () => {
    const syncStore = createFakeSyncStore();
    const createTransaction = vi.fn();
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await expect(engine.retry('does-not-exist')).resolves.toBeUndefined();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('drainPending replays every pending mutation independently', async () => {
    const syncStore = createFakeSyncStore();
    await syncStore.enqueue({
      id: 'ok-mutation',
      type: 'create-transaction',
      payload: { householdId, request: baseRequest() } satisfies CreateTransactionQueuedPayload,
    });
    await syncStore.enqueue({
      id: 'stuck-mutation',
      type: 'create-transaction',
      payload: { householdId, request: baseRequest() } satisfies CreateTransactionQueuedPayload,
    });
    // First call (ok-mutation) succeeds, second call (stuck-mutation) fails — a stuck item must
    // not block the rest of the queue.
    const createTransaction = vi
      .fn()
      .mockResolvedValueOnce({ transaction: {} })
      .mockRejectedValueOnce(new ApiError('No pudimos conectarnos.', undefined, 'network'));
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await engine.drainPending();

    const remaining = await syncStore.list();
    expect(remaining.map((mutation) => mutation.id)).toEqual(['stuck-mutation']);
    expect(remaining[0]?.status).toBe('error');
    expect(createTransaction).toHaveBeenCalledTimes(2);
  });

  it('discardAllPending removes every pending mutation and nothing else happens', async () => {
    const syncStore = createFakeSyncStore();
    await syncStore.enqueue({
      id: 'mutation-1',
      type: 'create-transaction',
      payload: { householdId, request: baseRequest() } satisfies CreateTransactionQueuedPayload,
    });
    await syncStore.enqueue({
      id: 'mutation-2',
      type: 'create-transaction',
      payload: { householdId, request: baseRequest() } satisfies CreateTransactionQueuedPayload,
    });
    const createTransaction = vi.fn();
    const engine = createSyncQueueEngine({ syncStore, createTransaction, generateMutationId });

    await engine.discardAllPending();

    await expect(syncStore.list()).resolves.toEqual([]);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('notifies onQueueChanged after every store-mutating operation', async () => {
    const syncStore = createFakeSyncStore();
    const onQueueChanged = vi.fn();
    const createTransaction = vi
      .fn()
      .mockRejectedValue(new ApiError('No pudimos conectarnos.', undefined, 'network'));
    const engine = createSyncQueueEngine({
      syncStore,
      createTransaction,
      generateMutationId,
      onQueueChanged,
    });

    await engine.createExpense(householdId, baseRequest());
    expect(onQueueChanged).toHaveBeenCalledTimes(1);

    await engine.retry('mutation-1');
    // One call for the 'syncing' transition, one for the 'error' transition.
    expect(onQueueChanged).toHaveBeenCalledTimes(3);
  });
});

describe('isCreateTransactionPayload', () => {
  it('accepts a well-formed create-transaction payload', () => {
    const payload: CreateTransactionQueuedPayload = { householdId, request: baseRequest() };
    expect(isCreateTransactionPayload(payload)).toBe(true);
  });

  it('rejects null, non-objects, and payloads missing the expected shape', () => {
    expect(isCreateTransactionPayload(null)).toBe(false);
    expect(isCreateTransactionPayload('a string')).toBe(false);
    expect(isCreateTransactionPayload({})).toBe(false);
    expect(isCreateTransactionPayload({ householdId })).toBe(false);
    expect(isCreateTransactionPayload({ householdId: 42, request: {} })).toBe(false);
  });
});

describe('createReconnectDetector', () => {
  it('reports a reconnect only on an offline→online transition', () => {
    const detector = createReconnectDetector();

    expect(detector.observe(true)).toBe(false); // starts online, no prior offline state
    expect(detector.observe(true)).toBe(false); // repeated online events: no transition
    expect(detector.observe(false)).toBe(false); // going offline is not a reconnect
    expect(detector.observe(false)).toBe(false); // repeated offline events: still no transition
    expect(detector.observe(true)).toBe(true); // offline -> online: exactly one reconnect
    expect(detector.observe(true)).toBe(false); // already online: no further reconnect
  });

  it('honors an explicit initial offline state', () => {
    const detector = createReconnectDetector(true);

    expect(detector.observe(true)).toBe(true);
  });
});
