import type { CreateTransactionRequest } from '@nido/contracts';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import { useSession } from '@/auth/session-provider';

import {
  createReconnectDetector,
  createSyncQueueEngine,
  type CreateExpenseResult,
} from './sync-queue';
import { getSyncStore } from './sync-store';
import type { QueuedMutation } from './sync-store.types';

interface SyncQueueContextValue {
  /** Every queued mutation that hasn't synced yet (`pending`, `syncing`, or `error`). */
  readonly pending: readonly QueuedMutation[];
  readonly createExpense: (
    householdId: string,
    request: CreateTransactionRequest,
  ) => Promise<CreateExpenseResult>;
  readonly retry: (mutationId: string) => Promise<void>;
  /** Replays every currently pending/error mutation — the global banner's manual "retry all". */
  readonly retryAll: () => Promise<void>;
  /**
   * Removes every pending mutation. Only call this after the UI has already gotten explicit
   * confirmation from the user (see mas.tsx's sign-out warning) — never automatically.
   */
  readonly discardAllPending: () => Promise<void>;
}

const SyncQueueContext = createContext<SyncQueueContextValue | null>(null);

/**
 * Mounted inside `SessionProvider` (see app/_layout.tsx) because it needs `useSession()`'s
 * `catalog.createTransaction` to attempt the direct request and to replay queued mutations.
 */
export function SyncQueueProvider({ children }: PropsWithChildren) {
  const { catalog } = useSession();
  const syncStore = useMemo(() => getSyncStore(), []);
  const [mutations, setMutations] = useState<readonly QueuedMutation[]>([]);

  const refresh = useCallback(async () => {
    const list = await syncStore.list();
    setMutations(list);
  }, [syncStore]);

  const engine = useMemo(
    () =>
      createSyncQueueEngine({
        syncStore,
        createTransaction: (householdId, request) =>
          catalog.createTransaction(householdId, request),
        generateMutationId: () => Crypto.randomUUID(),
        onQueueChanged: () => {
          void refresh();
        },
      }),
    [syncStore, catalog, refresh],
  );

  const drainingRef = useRef(false);
  const drain = useCallback(async () => {
    if (drainingRef.current) {
      return;
    }
    drainingRef.current = true;
    try {
      await engine.drainPending();
    } finally {
      drainingRef.current = false;
    }
  }, [engine]);

  useEffect(() => {
    // Initial load of whatever is already queued, plus one drain attempt on mount — covers "app
    // was offline, got closed, and reopened while now online" without waiting for a NetInfo
    // transition event.
    queueMicrotask(() => {
      void refresh();
      void drain();
    });
  }, [refresh, drain]);

  const reconnectDetectorRef = useRef(createReconnectDetector());

  useEffect(() => {
    const detector = reconnectDetectorRef.current;
    const unsubscribe = NetInfo.addEventListener((netInfoState) => {
      const isOnline =
        netInfoState.isConnected === true && netInfoState.isInternetReachable !== false;
      // Only drains on an offline→online transition, not on every connectivity event.
      if (detector.observe(isOnline)) {
        void drain();
      }
    });
    return unsubscribe;
  }, [drain]);

  const createExpense = useCallback(
    (householdId: string, request: CreateTransactionRequest) =>
      engine.createExpense(householdId, request),
    [engine],
  );

  const retry = useCallback((mutationId: string) => engine.retry(mutationId), [engine]);

  // Reuses `drain` (not `engine.drainPending` directly) so a manual "retry all" tap shares the
  // same overlap guard as the automatic reconnect/mount drains — two drains racing each other
  // would otherwise both try to replay the same mutations.
  const retryAll = useCallback(() => drain(), [drain]);

  const discardAllPending = useCallback(() => engine.discardAllPending(), [engine]);

  const pending = useMemo(
    () => mutations.filter((mutation) => mutation.status !== 'synced'),
    [mutations],
  );

  const value = useMemo<SyncQueueContextValue>(
    () => ({ pending, createExpense, retry, retryAll, discardAllPending }),
    [pending, createExpense, retry, retryAll, discardAllPending],
  );

  return <SyncQueueContext.Provider value={value}>{children}</SyncQueueContext.Provider>;
}

export function useSyncQueue(): SyncQueueContextValue {
  const context = useContext(SyncQueueContext);

  if (context === null) {
    throw new Error('useSyncQueue must be used inside SyncQueueProvider.');
  }

  return context;
}
