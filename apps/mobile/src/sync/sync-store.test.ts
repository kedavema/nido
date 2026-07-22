import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncStore } from './sync-store.types';

interface FakeRow {
  id: string;
  type: string;
  payload: string;
  status: string;
  attempts: number;
  created_at: string;
  last_error: string | null;
}

/**
 * Minimal in-memory stand-in for the subset of the `expo-sqlite` async API
 * that `sync-store.ts` uses. It interprets the exact statements issued by
 * the implementation (CREATE TABLE / INSERT / UPDATE / DELETE / SELECT)
 * against a plain array, so tests exercise the real SQL-shaped contract
 * (statements issued, parameter binding, row mapping) without a native
 * SQLite binding, which vitest's `node` environment cannot provide.
 */
function createFakeDatabase() {
  const rows: FakeRow[] = [];

  return {
    execAsync: vi.fn((sql: string) => {
      if (!sql.includes('CREATE TABLE')) {
        throw new Error(`Unexpected execAsync statement: ${sql}`);
      }
      return Promise.resolve();
    }),
    runAsync: vi.fn((sql: string, ...params: unknown[]) => {
      const statement = sql.trim();

      if (statement.startsWith('INSERT')) {
        const [id, type, payload, status, attempts, createdAt, lastError] = params as [
          string,
          string,
          string,
          string,
          number,
          string,
          string | null,
        ];
        rows.push({
          id,
          type,
          payload,
          status,
          attempts,
          created_at: createdAt,
          last_error: lastError,
        });
        return { changes: 1, lastInsertRowId: rows.length };
      }

      if (statement.startsWith('UPDATE') && statement.includes('attempts = attempts + 1')) {
        const [status, lastError, id] = params as [string, string | null, string];
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.status = status;
          row.last_error = lastError;
          row.attempts += 1;
        }
        return { changes: row ? 1 : 0, lastInsertRowId: 0 };
      }

      if (statement.startsWith('UPDATE')) {
        const [status, lastError, id] = params as [string, string | null, string];
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.status = status;
          row.last_error = lastError;
        }
        return { changes: row ? 1 : 0, lastInsertRowId: 0 };
      }

      if (statement.startsWith('DELETE')) {
        const [id] = params as [string];
        const index = rows.findIndex((candidate) => candidate.id === id);
        if (index !== -1) {
          rows.splice(index, 1);
        }
        return { changes: index !== -1 ? 1 : 0, lastInsertRowId: 0 };
      }

      throw new Error(`Unhandled runAsync statement: ${sql}`);
    }),
    getAllAsync: vi.fn((sql: string) => {
      if (sql.includes('WHERE status IN')) {
        return rows.filter((row) => row.status === 'pending' || row.status === 'error');
      }
      return [...rows];
    }),
  };
}

const openDatabaseAsync = vi.fn();

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => openDatabaseAsync(...args) as unknown,
}));

async function loadStore(): Promise<SyncStore> {
  const { getSyncStore } = await import('./sync-store');
  return getSyncStore();
}

beforeEach(() => {
  vi.resetModules();
  openDatabaseAsync.mockReset();
  openDatabaseAsync.mockImplementation(() => Promise.resolve(createFakeDatabase()));
});

describe('native SyncStore (expo-sqlite)', () => {
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
});
