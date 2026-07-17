import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FirebaseIdentityTokenVerifier,
  verifiedIdentityFromFirebaseClaims,
} from '../src/auth/firebase-identity-token.verifier.js';
import {
  IdentityProviderUnavailableError,
  InvalidIdentityTokenError,
} from '../src/auth/identity-token-verifier.js';

describe('Firebase verified identity claims', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks Firebase to reject revoked ID tokens and forwards only validated claims', async () => {
    const verifyIdToken = vi.fn(() =>
      Promise.resolve({
        uid: 'firebase-user',
        email: 'User@Example.COM',
        email_verified: true,
        name: 'User',
        picture: 'https://example.com/avatar.png',
        firebase: { sign_in_provider: 'google.com' },
      }),
    );
    const verifier = new FirebaseIdentityTokenVerifier({} as never);
    Object.assign(verifier, { firebaseAuth: { verifyIdToken } });

    await expect(verifier.verify('firebase-id-token')).resolves.toEqual({
      firebaseUid: 'firebase-user',
      email: 'user@example.com',
      displayName: 'User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(verifyIdToken).toHaveBeenCalledWith('firebase-id-token', true);
  });

  it('maps a Firebase invalid-token code to the local invalid-token error', async () => {
    const verifier = new FirebaseIdentityTokenVerifier({} as never);
    Object.assign(verifier, {
      firebaseAuth: {
        verifyIdToken: () =>
          Promise.reject(
            Object.assign(new Error('provider detail must stay private'), {
              code: 'auth/id-token-expired',
            }),
          ),
      },
    });

    await expect(verifier.verify('invalid-token')).rejects.toBeInstanceOf(
      InvalidIdentityTokenError,
    );
  });

  it('keeps provider degradation distinct from invalid user credentials', async () => {
    const verifier = new FirebaseIdentityTokenVerifier({} as never);
    Object.assign(verifier, {
      firebaseAuth: {
        verifyIdToken: () => Promise.reject(new Error('provider detail must stay private')),
      },
    });

    await expect(verifier.verify('unverifiable-token')).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
  });

  it('bounds a stalled Firebase verification and limits abandoned provider work', async () => {
    vi.useFakeTimers();
    const verifyIdToken = vi.fn(() => new Promise<never>(() => undefined));
    const verifier = new FirebaseIdentityTokenVerifier({} as never);
    Object.assign(verifier, {
      firebaseAuth: { verifyIdToken },
      verificationTimeoutMilliseconds: 5_000,
      maxPendingVerifications: 1,
    });

    const stalledVerification = verifier.verify('stalled-token');
    const stalledExpectation = expect(stalledVerification).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
    const rejectedByBulkhead = verifier.verify('second-token');

    await expect(rejectedByBulkhead).rejects.toBeInstanceOf(IdentityProviderUnavailableError);
    expect(verifyIdToken).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await stalledExpectation;
  });

  it('accepts a verified Google email and normalizes it', () => {
    expect(
      verifiedIdentityFromFirebaseClaims({
        uid: 'firebase-user',
        email: '  User@Example.COM ',
        email_verified: true,
        name: ' User ',
        picture: 'https://example.com/avatar.png',
        firebase: { sign_in_provider: 'google.com' },
      }),
    ).toEqual({
      firebaseUid: 'firebase-user',
      email: 'user@example.com',
      displayName: 'User',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it.each([
    { email: 'user@example.com', email_verified: false, provider: 'google.com' },
    { email: undefined, email_verified: true, provider: 'google.com' },
    { email: 'user@example.com', email_verified: true, provider: 'password' },
  ])('rejects claims that are not a verified Google identity %#', (input) => {
    expect(() =>
      verifiedIdentityFromFirebaseClaims({
        uid: 'firebase-user',
        ...(input.email === undefined ? {} : { email: input.email }),
        email_verified: input.email_verified,
        firebase: { sign_in_provider: input.provider },
      }),
    ).toThrow(InvalidIdentityTokenError);
  });
});
