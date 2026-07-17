import { describe, expect, it } from 'vitest';

import {
  canApplyProfileForIdentity,
  destinationForSession,
  hasNewHousehold,
  sessionReducer,
  type SessionState,
} from './session-machine';

const identity = {
  uid: 'firebase-uid',
  email: 'ale@example.com',
  displayName: 'Ale',
  photoUrl: null,
};

const baseProfile = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ale@example.com',
    displayName: 'Ale',
    avatarUrl: null,
    timezone: 'America/Asuncion',
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
  },
  households: [],
};

describe('session state machine', () => {
  it('routes a signed-out identity to sign in', () => {
    const state = sessionReducer({ kind: 'loading' }, { type: 'signed-out' });

    expect(state).toEqual({ kind: 'unauthenticated' });
    expect(destinationForSession(state)).toBe('sign-in');
  });

  it('routes an authenticated user without a household to onboarding', () => {
    const state = sessionReducer(
      { kind: 'loading' },
      { type: 'profile-loaded', identity, profile: baseProfile },
    );

    expect(destinationForSession(state)).toBe('onboarding');
  });

  it('routes an authenticated member to the canonical tabs', () => {
    const state = sessionReducer(
      { kind: 'loading' },
      {
        type: 'profile-loaded',
        identity,
        profile: {
          ...baseProfile,
          households: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Casa Ale & Kevin',
              baseCurrency: 'PYG',
              timezone: 'America/Asuncion',
              role: 'MEMBER',
              joinedAt: '2026-07-16T12:00:00.000Z',
            },
          ],
        },
      },
    );

    expect(destinationForSession(state)).toBe('tabs');
    expect(state.kind === 'authenticated' && state.activeHousehold?.role).toBe('MEMBER');
  });

  it('keeps errors explicit and remembers whether sign out is safe', () => {
    const state: SessionState = sessionReducer(
      { kind: 'loading' },
      { type: 'failed', message: 'No pudimos conectar.', canSignOut: true },
    );

    expect(destinationForSession(state)).toBe('error');
    expect(state).toEqual({
      kind: 'error',
      message: 'No pudimos conectar.',
      canSignOut: true,
    });
  });

  it('detects a household added while reconciling an ambiguous mutation', () => {
    const previousIds = new Set(['00000000-0000-4000-8000-000000000002']);
    const profile = {
      ...baseProfile,
      households: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          name: 'Casa reconciliada',
          baseCurrency: 'PYG' as const,
          timezone: 'America/Asuncion',
          role: 'MEMBER' as const,
          joinedAt: '2026-07-16T12:00:00.000Z',
        },
      ],
    };

    expect(hasNewHousehold(previousIds, profile)).toBe(true);
    expect(hasNewHousehold(new Set(['00000000-0000-4000-8000-000000000003']), profile)).toBe(false);
  });

  it('rejects a reconciled profile after sign-out or an account switch', () => {
    expect(canApplyProfileForIdentity(null, identity.uid)).toBe(false);
    expect(canApplyProfileForIdentity('another-uid', identity.uid)).toBe(false);
    expect(canApplyProfileForIdentity(identity.uid, identity.uid)).toBe(true);
  });
});
