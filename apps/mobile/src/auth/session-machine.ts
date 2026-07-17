import type { ActiveHouseholdSummary, GetMeResponse } from '@nido/contracts';

import type { AuthenticatedIdentity } from './auth-client.types';

export type SessionState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unauthenticated' }
  | {
      readonly kind: 'authenticated';
      readonly identity: AuthenticatedIdentity;
      readonly profile: GetMeResponse;
      readonly activeHousehold: ActiveHouseholdSummary | null;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly canSignOut: boolean;
    };

export type SessionAction =
  | { readonly type: 'connecting' }
  | { readonly type: 'signed-out' }
  | {
      readonly type: 'profile-loaded';
      readonly identity: AuthenticatedIdentity;
      readonly profile: GetMeResponse;
    }
  | { readonly type: 'failed'; readonly message: string; readonly canSignOut: boolean };

export type SessionDestination = 'loading' | 'sign-in' | 'error' | 'onboarding' | 'tabs';

export function sessionReducer(_state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'connecting':
      return { kind: 'loading' };
    case 'signed-out':
      return { kind: 'unauthenticated' };
    case 'profile-loaded':
      return {
        kind: 'authenticated',
        identity: action.identity,
        profile: action.profile,
        activeHousehold: action.profile.households[0] ?? null,
      };
    case 'failed':
      return {
        kind: 'error',
        message: action.message,
        canSignOut: action.canSignOut,
      };
  }
}

export function destinationForSession(state: SessionState): SessionDestination {
  switch (state.kind) {
    case 'loading':
      return 'loading';
    case 'unauthenticated':
      return 'sign-in';
    case 'error':
      return 'error';
    case 'authenticated':
      return state.activeHousehold === null ? 'onboarding' : 'tabs';
  }
}

export function hasNewHousehold(
  previousHouseholdIds: ReadonlySet<string>,
  profile: GetMeResponse,
): boolean {
  return profile.households.some((household) => !previousHouseholdIds.has(household.id));
}

export function canApplyProfileForIdentity(
  currentUid: string | null,
  expectedUid: string,
): boolean {
  return currentUid === expectedUid;
}
