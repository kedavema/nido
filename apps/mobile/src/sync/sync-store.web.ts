import type { QueuedMutation, SyncStore } from './sync-store.types';

const DATABASE_NAME = 'nido-sync-store';
const DATABASE_VERSION = 1;
const STORE_NAME = 'queued_mutations';
const SEQUENCE_INDEX = 'sequence';

/**
 * Record actually persisted in IndexedDB. `sequence` is an internal,
 * monotonically increasing insertion marker used only to recover insertion
 * order (IndexedDB otherwise orders records by their `id` key, which is not
 * chronological) — it never leaves this module.
 */
interface StoredMutation extends QueuedMutation {
  readonly sequence: number;
}

interface DatabaseState {
  readonly db: IDBDatabase;
}

let statePromise: Promise<DatabaseState> | undefined;
let nextSequence = 0;

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('La solicitud de IndexedDB falló.'));
    };
  });
}

function promisifyTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('La transacción de IndexedDB falló.'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('La transacción de IndexedDB fue abortada.'));
    };
  });
}

function openDatabaseRequest(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(SEQUENCE_INDEX, 'sequence', { unique: true });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('No se pudo abrir la base de datos IndexedDB.'));
    };
  });
}

async function readMaxSequence(db: IDBDatabase): Promise<number> {
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const index = transaction.objectStore(STORE_NAME).index(SEQUENCE_INDEX);
  const cursor = await promisifyRequest(index.openCursor(null, 'prev'));
  await promisifyTransaction(transaction);

  if (cursor === null) {
    return -1;
  }

  return (cursor.value as StoredMutation).sequence;
}

async function initializeDatabase(): Promise<DatabaseState> {
  const db = await openDatabaseRequest();
  nextSequence = (await readMaxSequence(db)) + 1;
  return { db };
}

async function getDatabase(): Promise<IDBDatabase> {
  statePromise ??= initializeDatabase();
  return (await statePromise).db;
}

function toQueuedMutation(record: StoredMutation): QueuedMutation {
  return {
    id: record.id,
    type: record.type,
    payload: record.payload,
    status: record.status,
    attempts: record.attempts,
    createdAt: record.createdAt,
    lastError: record.lastError,
  };
}

async function listMutations(db: IDBDatabase): Promise<QueuedMutation[]> {
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const index = transaction.objectStore(STORE_NAME).index(SEQUENCE_INDEX);
  const records = await promisifyRequest(index.getAll() as IDBRequest<StoredMutation[]>);
  await promisifyTransaction(transaction);

  return records.map(toQueuedMutation);
}

export function getSyncStore(): SyncStore {
  return {
    async enqueue(mutation) {
      const db = await getDatabase();
      const record: StoredMutation = {
        id: mutation.id,
        type: mutation.type,
        payload: mutation.payload,
        status: 'pending',
        attempts: 0,
        createdAt: mutation.createdAt ?? new Date().toISOString(),
        lastError: null,
        sequence: nextSequence++,
      };

      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      await promisifyTransaction(transaction);

      return toQueuedMutation(record);
    },

    async list() {
      const db = await getDatabase();
      return listMutations(db);
    },

    async getPending() {
      const db = await getDatabase();
      const all = await listMutations(db);
      return all.filter((mutation) => mutation.status === 'pending' || mutation.status === 'error');
    },

    async updateStatus(id, status, lastError = null) {
      const db = await getDatabase();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const existing = await promisifyRequest(
        store.get(id) as IDBRequest<StoredMutation | undefined>,
      );

      if (existing !== undefined) {
        // Only an `error` transition increments `attempts`: it is the sole
        // signal that a sync attempt actually ran and failed. Moving to
        // `pending`/`syncing`/`synced` never increments attempts, and any
        // transition away from `error` clears the previous `lastError` since
        // the caller supplies a fresh (or null) message for the new status.
        const updated: StoredMutation = {
          ...existing,
          status,
          lastError,
          attempts: status === 'error' ? existing.attempts + 1 : existing.attempts,
        };
        store.put(updated);
      }

      await promisifyTransaction(transaction);
    },

    async remove(id) {
      const db = await getDatabase();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      await promisifyTransaction(transaction);
    },
  };
}
