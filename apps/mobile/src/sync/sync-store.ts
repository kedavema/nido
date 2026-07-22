import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { QueuedMutation, QueuedMutationStatus, SyncStore } from './sync-store.types';

const DATABASE_NAME = 'nido-sync-store.db';
const TABLE_NAME = 'queued_mutations';

interface QueuedMutationRow {
  readonly id: string;
  readonly type: string;
  readonly payload: string;
  readonly status: QueuedMutationStatus;
  readonly attempts: number;
  readonly created_at: string;
  readonly last_error: string | null;
}

let databasePromise: Promise<SQLiteDatabase> | undefined;

async function openDatabase(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_error TEXT
    );
  `);
  return database;
}

function getDatabase(): Promise<SQLiteDatabase> {
  databasePromise ??= openDatabase();
  return databasePromise;
}

function rowToMutation(row: QueuedMutationRow): QueuedMutation {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    lastError: row.last_error,
  };
}

export function getSyncStore(): SyncStore {
  return {
    async enqueue(mutation) {
      const database = await getDatabase();
      const record: QueuedMutation = {
        id: mutation.id,
        type: mutation.type,
        payload: mutation.payload,
        status: 'pending',
        attempts: 0,
        createdAt: mutation.createdAt ?? new Date().toISOString(),
        lastError: null,
      };

      await database.runAsync(
        `INSERT INTO ${TABLE_NAME} (id, type, payload, status, attempts, created_at, last_error) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        record.id,
        record.type,
        JSON.stringify(record.payload),
        record.status,
        record.attempts,
        record.createdAt,
        record.lastError,
      );

      return record;
    },

    async list() {
      const database = await getDatabase();
      const rows = await database.getAllAsync<QueuedMutationRow>(
        `SELECT * FROM ${TABLE_NAME} ORDER BY rowid ASC;`,
      );

      return rows.map(rowToMutation);
    },

    async getPending() {
      const database = await getDatabase();
      const rows = await database.getAllAsync<QueuedMutationRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE status IN ('pending', 'error') ORDER BY rowid ASC;`,
      );

      return rows.map(rowToMutation);
    },

    async updateStatus(id, status, lastError = null) {
      const database = await getDatabase();

      // Only an `error` transition increments `attempts`: it is the sole
      // signal that a sync attempt actually ran and failed. Moving to
      // `pending`/`syncing`/`synced` never increments attempts, and any
      // transition away from `error` clears the previous `lastError` since
      // the caller supplies a fresh (or null) message for the new status.
      if (status === 'error') {
        await database.runAsync(
          `UPDATE ${TABLE_NAME} SET status = ?, attempts = attempts + 1, last_error = ? WHERE id = ?;`,
          status,
          lastError,
          id,
        );
        return;
      }

      await database.runAsync(
        `UPDATE ${TABLE_NAME} SET status = ?, last_error = ? WHERE id = ?;`,
        status,
        lastError,
        id,
      );
    },

    async remove(id) {
      const database = await getDatabase();
      await database.runAsync(`DELETE FROM ${TABLE_NAME} WHERE id = ?;`, id);
    },
  };
}
