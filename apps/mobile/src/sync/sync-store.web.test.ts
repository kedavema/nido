import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncStore } from './sync-store.types';

async function loadStore(): Promise<SyncStore> {
  const { getSyncStore } = await import('./sync-store.web');
  return getSyncStore();
}

beforeEach(() => {
  vi.resetModules();
  // A fresh in-memory IndexedDB factory per test isolates the (real) global
  // `indexedDB` used by the web implementation — no mocking of our own code.
  globalThis.indexedDB = new IDBFactory();
});

describe('web SyncStore (IndexedDB)', () => {
  it('enqueues a mutation with pending status and zero attempts', async () => {
    const store = await loadStore();

    const mutation = await store.enqueue({
      id: 'mutation-1',
      type: 'create-transaction',
      payload: { amount: '10.00' },
    });

    expect(mutation).toMatchObject({
      id: 'mutation-1',
      type: 'create-transaction',
      payload: { amount: '10.00' },
      status: 'pending',
      attempts: 0,
      lastError: null,
    });
    expect(mutation.createdAt).toEqual(expect.any(String));
  });

  it('lists mutations in insertion order and scopes them correctly', async () => {
    const store = await loadStore();

    await store.enqueue({ id: 'mutation-1', type: 'create-transaction', payload: { n: 1 } });
    await store.enqueue({ id: 'mutation-2', type: 'create-transaction', payload: { n: 2 } });

    const all = await store.list();

    expect(all.map((mutation) => mutation.id)).toEqual(['mutation-1', 'mutation-2']);
    expect(all[0]?.payload).toEqual({ n: 1 });
    expect(all[1]?.payload).toEqual({ n: 2 });
  });

  it('excludes synced mutations from getPending', async () => {
    const store = await loadStore();

    await store.enqueue({ id: 'mutation-1', type: 'create-transaction', payload: {} });
    await store.enqueue({ id: 'mutation-2', type: 'create-transaction', payload: {} });
    await store.updateStatus('mutation-2', 'synced');

    const pending = await store.getPending();

    expect(pending.map((mutation) => mutation.id)).toEqual(['mutation-1']);
  });

  it('transitions status, populating lastError and incrementing attempts only on error', async () => {
    const store = await loadStore();
    await store.enqueue({ id: 'mutation-1', type: 'create-transaction', payload: {} });

    await store.updateStatus('mutation-1', 'syncing');
    let [current] = await store.list();
    expect(current?.status).toBe('syncing');
    expect(current?.attempts).toBe(0);

    await store.updateStatus('mutation-1', 'error', 'Network request failed');
    [current] = await store.list();
    expect(current?.status).toBe('error');
    expect(current?.lastError).toBe('Network request failed');
    expect(current?.attempts).toBe(1);

    await store.updateStatus('mutation-1', 'error', 'Timed out');
    [current] = await store.list();
    expect(current?.attempts).toBe(2);
    expect(current?.lastError).toBe('Timed out');

    await store.updateStatus('mutation-1', 'synced');
    [current] = await store.list();
    expect(current?.status).toBe('synced');
    expect(current?.attempts).toBe(2);
    expect(current?.lastError).toBeNull();
  });

  it('removes only the targeted mutation, leaving others untouched', async () => {
    const store = await loadStore();
    await store.enqueue({ id: 'mutation-1', type: 'create-transaction', payload: {} });
    await store.enqueue({ id: 'mutation-2', type: 'create-transaction', payload: {} });

    await store.remove('mutation-1');
    const remaining = await store.list();

    expect(remaining.map((mutation) => mutation.id)).toEqual(['mutation-2']);
  });

  it('starts with an empty queue in a fresh database', async () => {
    const store = await loadStore();

    await expect(store.list()).resolves.toEqual([]);
    await expect(store.getPending()).resolves.toEqual([]);
  });
});
