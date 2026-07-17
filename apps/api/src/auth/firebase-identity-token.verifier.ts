import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NormalizedEmailSchema } from '@nido/contracts';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

import type { Environment } from '../config/environment.js';
import type { VerifiedIdentity } from '../users/user.js';
import {
  IdentityProviderUnavailableError,
  InvalidIdentityTokenError,
  type IdentityTokenVerifier,
} from './identity-token-verifier.js';

const FIREBASE_APP_NAME = 'nido-api';
const FIREBASE_VERIFICATION_TIMEOUT_MILLISECONDS = 5_000;
const MAX_PENDING_FIREBASE_VERIFICATIONS = 16;
const INVALID_FIREBASE_ID_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

@Injectable()
export class FirebaseIdentityTokenVerifier implements IdentityTokenVerifier {
  private firebaseAuth: Auth | undefined;
  private pendingVerifications = 0;
  private verificationTimeoutMilliseconds = FIREBASE_VERIFICATION_TIMEOUT_MILLISECONDS;
  private maxPendingVerifications = MAX_PENDING_FIREBASE_VERIFICATIONS;

  constructor(private readonly config: ConfigService<Environment, true>) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const decodedToken = await this.verifyWithDeadline(token);
      return verifiedIdentityFromFirebaseClaims(decodedToken);
    } catch (error) {
      if (error instanceof InvalidIdentityTokenError) {
        throw error;
      }

      if (isInvalidFirebaseIdTokenError(error)) {
        throw new InvalidIdentityTokenError();
      }

      throw new IdentityProviderUnavailableError();
    }
  }

  private verifyWithDeadline(token: string): Promise<FirebaseIdentityClaims> {
    if (this.pendingVerifications >= this.maxPendingVerifications) {
      throw new IdentityProviderUnavailableError();
    }

    const verification = this.getFirebaseAuth().verifyIdToken(token, true);
    this.pendingVerifications += 1;
    void verification
      .finally(() => {
        this.pendingVerifications -= 1;
      })
      .catch(() => undefined);

    return settleWithin(verification, this.verificationTimeoutMilliseconds);
  }

  private getFirebaseAuth(): Auth {
    if (this.firebaseAuth !== undefined) {
      return this.firebaseAuth;
    }

    const projectId = this.config.get('FIREBASE_PROJECT_ID', { infer: true });
    const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
    const firebaseApp =
      existingApp ??
      initializeApp(
        {
          credential: applicationDefault(),
          projectId,
        },
        FIREBASE_APP_NAME,
      );

    this.firebaseAuth = getAuth(firebaseApp);
    return this.firebaseAuth;
  }
}

function settleWithin<Output>(operation: Promise<Output>, milliseconds: number): Promise<Output> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new IdentityProviderUnavailableError());
    }, milliseconds);
    timeout.unref();

    void operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new IdentityProviderUnavailableError());
      },
    );
  });
}

function isInvalidFirebaseIdTokenError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    INVALID_FIREBASE_ID_TOKEN_CODES.has(error.code)
  );
}

interface FirebaseIdentityClaims {
  readonly uid: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly name?: unknown;
  readonly picture?: unknown;
  readonly firebase: { readonly sign_in_provider: string };
}

export function verifiedIdentityFromFirebaseClaims(
  claims: FirebaseIdentityClaims,
): VerifiedIdentity {
  const emailResult = NormalizedEmailSchema.safeParse(claims.email);

  if (
    claims.uid.length === 0 ||
    claims.email_verified !== true ||
    claims.firebase.sign_in_provider !== 'google.com' ||
    !emailResult.success
  ) {
    throw new InvalidIdentityTokenError();
  }

  return {
    firebaseUid: claims.uid,
    email: emailResult.data,
    displayName: normalizeDisplayName(claims.name, emailResult.data),
    avatarUrl: normalizeAvatarUrl(claims.picture),
  };
}

function normalizeDisplayName(value: unknown, email: string): string {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue.length > 0) {
      return trimmedValue.slice(0, 100);
    }
  }

  const separatorIndex = email.indexOf('@');
  return email.slice(0, separatorIndex === -1 ? undefined : separatorIndex).slice(0, 100);
}

function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
