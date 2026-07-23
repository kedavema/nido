import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { PropsWithChildren } from 'react';
import type {
  CreateHouseholdInviteResponse,
  GetHouseholdMembersResponse,
  GetMeResponse,
} from '@nido/contracts';
import { ZodError } from 'zod';

import { ApiError, createNidoApiClient, type NidoApiClient } from '@/api/client';
import { getPublicEnvironment, PublicEnvironmentError } from '@/config/public-environment';

import { getFirebaseAuthClient } from './auth-client';
import type { AuthenticatedIdentity, FirebaseAuthClient } from './auth-client.types';
import {
  canApplyProfileForIdentity,
  hasNewHousehold,
  sessionReducer,
  type SessionState,
} from './session-machine';

interface SessionContextValue {
  readonly state: SessionState;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly retry: () => void;
  readonly createHousehold: (name: string) => Promise<void>;
  readonly acceptInvitation: (token: string) => Promise<void>;
  readonly getMembers: (householdId: string) => Promise<GetHouseholdMembersResponse>;
  readonly createInvitation: (
    householdId: string,
    email: string,
  ) => Promise<CreateHouseholdInviteResponse>;
  readonly catalog: Pick<
    NidoApiClient,
    | 'listCategories'
    | 'createCategory'
    | 'updateCategory'
    | 'deleteCategory'
    | 'listPaymentSources'
    | 'createPaymentSource'
    | 'updatePaymentSource'
    | 'deletePaymentSource'
    | 'listTransactions'
    | 'getTransaction'
    | 'createTransaction'
    | 'updateTransaction'
    | 'deleteTransaction'
    | 'getMonthlySummary'
    | 'listRecurringItems'
    | 'createRecurringItem'
    | 'updateRecurringItem'
    | 'deleteRecurringItem'
    | 'listOccurrences'
    | 'settleOccurrence'
  >;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const HOUSEHOLD_RECONCILIATION_DELAYS_MILLISECONDS = [0, 300, 1_000] as const;

let inFlightMeRequest:
  { readonly uid: string; readonly request: ReturnType<NidoApiClient['getMe']> } | undefined;

function getMeOnce(api: NidoApiClient, uid: string): ReturnType<NidoApiClient['getMe']> {
  if (inFlightMeRequest?.uid === uid) {
    return inFlightMeRequest.request;
  }

  const request = api.getMe().finally(() => {
    if (inFlightMeRequest?.request === request) {
      inFlightMeRequest = undefined;
    }
  });
  inFlightMeRequest = { uid, request };
  return request;
}

function safeMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof PublicEnvironmentError) {
    return error.message;
  }

  if (error instanceof ZodError) {
    return 'Revisá los datos e intentá de nuevo.';
  }

  return 'Ocurrió un error inesperado. Intentá de nuevo.';
}

function isCurrentIdentity(
  current: AuthenticatedIdentity | null,
  expected: AuthenticatedIdentity,
): boolean {
  return current !== null && current.uid === expected.uid;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(sessionReducer, { kind: 'loading' });
  const [retryVersion, incrementRetryVersion] = useReducer((value: number) => value + 1, 0);
  const authRef = useRef<FirebaseAuthClient | null>(null);
  const apiRef = useRef<NidoApiClient | null>(null);
  const identityRef = useRef<AuthenticatedIdentity | null>(null);
  const profileRef = useRef<GetMeResponse | null>(null);
  const pendingHouseholdCreationRef = useRef<{
    readonly uid: string;
    readonly previousHouseholdIds: ReadonlySet<string>;
  } | null>(null);
  const requestVersionRef = useRef(0);

  const loadProfile = useCallback(async (identity: AuthenticatedIdentity, deduplicate: boolean) => {
    const api = apiRef.current;

    if (api === null) {
      throw new Error('API client is not initialized.');
    }

    if (!isCurrentIdentity(identityRef.current, identity)) {
      return;
    }

    const requestVersion = ++requestVersionRef.current;
    dispatch({ type: 'connecting' });

    try {
      const profile = deduplicate ? await getMeOnce(api, identity.uid) : await api.getMe();

      if (
        requestVersion === requestVersionRef.current &&
        isCurrentIdentity(identityRef.current, identity)
      ) {
        profileRef.current = profile;
        dispatch({ type: 'profile-loaded', identity, profile });
      }
    } catch (error) {
      if (
        requestVersion === requestVersionRef.current &&
        isCurrentIdentity(identityRef.current, identity)
      ) {
        dispatch({ type: 'failed', message: safeMessage(error), canSignOut: true });
      }
      throw error;
    }
  }, []);

  const reconcileHouseholdMutation = useCallback(
    async (
      api: NidoApiClient,
      identity: AuthenticatedIdentity,
      previousHouseholdIds: ReadonlySet<string>,
    ): Promise<boolean> => {
      for (const delayMilliseconds of HOUSEHOLD_RECONCILIATION_DELAYS_MILLISECONDS) {
        if (delayMilliseconds > 0) {
          await wait(delayMilliseconds);
        }
        if (!isCurrentIdentity(identityRef.current, identity)) {
          return false;
        }

        const reconciliationVersion = requestVersionRef.current;
        try {
          const profile = await api.getMe();
          const reconciledIdentity = identityRef.current;
          if (
            reconciliationVersion !== requestVersionRef.current ||
            !canApplyProfileForIdentity(
              reconciledIdentity === null ? null : reconciledIdentity.uid,
              identity.uid,
            )
          ) {
            return false;
          }
          if (hasNewHousehold(previousHouseholdIds, profile)) {
            requestVersionRef.current += 1;
            profileRef.current = profile;
            pendingHouseholdCreationRef.current = null;
            dispatch({ type: 'profile-loaded', identity, profile });
            return true;
          }
        } catch {
          // A later bounded attempt may observe a commit after transient response loss.
        }
      }

      return false;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;

    try {
      const auth = getFirebaseAuthClient();
      const environment = getPublicEnvironment();
      const api = createNidoApiClient({
        baseUrl: environment.apiUrl,
        getIdToken: () => auth.getIdToken(),
      });

      authRef.current = auth;
      apiRef.current = api;
      unsubscribe = auth.subscribe(
        (identity) => {
          if (!active) {
            return;
          }

          identityRef.current = identity;

          if (identity === null) {
            requestVersionRef.current += 1;
            profileRef.current = null;
            pendingHouseholdCreationRef.current = null;
            dispatch({ type: 'signed-out' });
            return;
          }

          void loadProfile(identity, true).catch(() => undefined);
        },
        (error) => {
          if (active) {
            dispatch({ type: 'failed', message: safeMessage(error), canSignOut: true });
          }
        },
      );
    } catch (error) {
      queueMicrotask(() => {
        if (active) {
          dispatch({ type: 'failed', message: safeMessage(error), canSignOut: false });
        }
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadProfile, retryVersion]);

  const signIn = useCallback(async () => {
    const auth = authRef.current;

    if (auth === null) {
      dispatch({
        type: 'failed',
        message: 'La autenticación todavía no está disponible.',
        canSignOut: false,
      });
      return;
    }

    dispatch({ type: 'connecting' });

    try {
      const result = await auth.signInWithGoogle();

      if (result === 'cancelled') {
        dispatch({ type: 'signed-out' });
      }
    } catch (error) {
      dispatch({ type: 'failed', message: safeMessage(error), canSignOut: false });
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = authRef.current;

    if (auth === null) {
      identityRef.current = null;
      profileRef.current = null;
      pendingHouseholdCreationRef.current = null;
      requestVersionRef.current += 1;
      dispatch({ type: 'signed-out' });
      return;
    }

    identityRef.current = null;
    profileRef.current = null;
    pendingHouseholdCreationRef.current = null;
    requestVersionRef.current += 1;
    dispatch({ type: 'connecting' });

    try {
      await auth.signOut();
    } catch (error) {
      dispatch({ type: 'failed', message: safeMessage(error), canSignOut: true });
    }
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'connecting' });
    incrementRetryVersion();
  }, []);

  const createHousehold = useCallback(
    async (name: string) => {
      const api = apiRef.current;
      const identity = identityRef.current;

      if (api === null || identity === null) {
        throw new ApiError('Necesitás iniciar sesión para continuar.', 401, 'authentication');
      }

      const profile = profileRef.current;
      const previousHouseholdIds = new Set(profile?.households.map(({ id }) => id));
      const pendingCreation = pendingHouseholdCreationRef.current;

      if (
        pendingCreation?.uid === identity.uid &&
        (await reconcileHouseholdMutation(api, identity, pendingCreation.previousHouseholdIds))
      ) {
        return;
      }
      pendingHouseholdCreationRef.current = null;

      try {
        await api.createHousehold(name);
        pendingHouseholdCreationRef.current = null;
      } catch (error) {
        if (
          profile !== null &&
          error instanceof ApiError &&
          error.kind === 'network' &&
          (await reconcileHouseholdMutation(api, identity, previousHouseholdIds))
        ) {
          return;
        }
        if (profile !== null && error instanceof ApiError && error.kind === 'network') {
          pendingHouseholdCreationRef.current = {
            uid: identity.uid,
            previousHouseholdIds,
          };
        }
        throw error;
      }
      await loadProfile(identity, false);
    },
    [loadProfile, reconcileHouseholdMutation],
  );

  const acceptInvitation = useCallback(
    async (token: string) => {
      const api = apiRef.current;
      const identity = identityRef.current;

      if (api === null || identity === null) {
        throw new ApiError('Necesitás iniciar sesión para continuar.', 401, 'authentication');
      }

      const profile = profileRef.current;
      const previousHouseholdIds = new Set(profile?.households.map(({ id }) => id));

      try {
        await api.acceptHouseholdInvite(token);
      } catch (error) {
        if (
          profile !== null &&
          error instanceof ApiError &&
          (error.kind === 'network' || error.status === 404 || error.status === 409) &&
          (await reconcileHouseholdMutation(api, identity, previousHouseholdIds))
        ) {
          return;
        }
        throw error;
      }
      await loadProfile(identity, false);
    },
    [loadProfile, reconcileHouseholdMutation],
  );

  const getMembers = useCallback(async (householdId: string) => {
    const api = apiRef.current;

    if (api === null) {
      throw new ApiError('Necesitás iniciar sesión para continuar.', 401, 'authentication');
    }

    return api.getHouseholdMembers(householdId);
  }, []);

  const createInvitation = useCallback(async (householdId: string, email: string) => {
    const api = apiRef.current;

    if (api === null) {
      throw new ApiError('Necesitás iniciar sesión para continuar.', 401, 'authentication');
    }

    return api.createHouseholdInvite(householdId, email);
  }, []);

  const catalog = useMemo<SessionContextValue['catalog']>(() => {
    const api = (): NidoApiClient => {
      if (apiRef.current === null) {
        throw new ApiError('Necesitás iniciar sesión para continuar.', 401, 'authentication');
      }
      return apiRef.current;
    };

    return {
      listCategories: (householdId) => api().listCategories(householdId),
      createCategory: (householdId, input) => api().createCategory(householdId, input),
      updateCategory: (householdId, categoryId, input) =>
        api().updateCategory(householdId, categoryId, input),
      deleteCategory: (householdId, categoryId) => api().deleteCategory(householdId, categoryId),
      listPaymentSources: (householdId) => api().listPaymentSources(householdId),
      createPaymentSource: (householdId, input) => api().createPaymentSource(householdId, input),
      updatePaymentSource: (householdId, paymentSourceId, input) =>
        api().updatePaymentSource(householdId, paymentSourceId, input),
      deletePaymentSource: (householdId, paymentSourceId) =>
        api().deletePaymentSource(householdId, paymentSourceId),
      listTransactions: (householdId, query) => api().listTransactions(householdId, query),
      getTransaction: (householdId, transactionId) =>
        api().getTransaction(householdId, transactionId),
      createTransaction: (householdId, input) => api().createTransaction(householdId, input),
      updateTransaction: (householdId, transactionId, input) =>
        api().updateTransaction(householdId, transactionId, input),
      deleteTransaction: (householdId, transactionId) =>
        api().deleteTransaction(householdId, transactionId),
      getMonthlySummary: (householdId, query) => api().getMonthlySummary(householdId, query),
      listRecurringItems: (householdId) => api().listRecurringItems(householdId),
      createRecurringItem: (householdId, input) => api().createRecurringItem(householdId, input),
      updateRecurringItem: (householdId, recurringItemId, input) =>
        api().updateRecurringItem(householdId, recurringItemId, input),
      deleteRecurringItem: (householdId, recurringItemId) =>
        api().deleteRecurringItem(householdId, recurringItemId),
      listOccurrences: (householdId, query) => api().listOccurrences(householdId, query),
      settleOccurrence: (householdId, occurrenceId, input) =>
        api().settleOccurrence(householdId, occurrenceId, input),
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      signIn,
      signOut,
      retry,
      createHousehold,
      acceptInvitation,
      getMembers,
      createInvitation,
      catalog,
    }),
    [
      acceptInvitation,
      catalog,
      createHousehold,
      createInvitation,
      getMembers,
      retry,
      signIn,
      signOut,
      state,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (context === null) {
    throw new Error('useSession must be used inside SessionProvider.');
  }

  return context;
}

export function messageForActionError(error: unknown): string {
  return safeMessage(error);
}
