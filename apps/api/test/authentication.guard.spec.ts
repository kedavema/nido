import type { ExecutionContext } from '@nestjs/common';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedRequest } from '../src/auth/authenticated-request.js';
import { AuthenticationGuard } from '../src/auth/authentication.guard.js';
import { AuthenticationService } from '../src/auth/authentication.service.js';
import {
  IdentityProviderUnavailableError,
  InvalidIdentityTokenError,
} from '../src/auth/identity-token-verifier.js';
import type { LocalUser, VerifiedIdentity } from '../src/users/user.js';
import { UsersService } from '../src/users/users.service.js';

const verifiedIdentity: VerifiedIdentity = {
  firebaseUid: 'firebase-owner',
  email: 'owner@example.com',
  displayName: 'Owner',
  avatarUrl: null,
};

const localUser: LocalUser = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  ...verifiedIdentity,
  timezone: 'America/Asuncion',
  createdAt: new Date('2026-07-16T12:00:00.000Z'),
  updatedAt: new Date('2026-07-16T12:00:00.000Z'),
};

describe('AuthenticationGuard', () => {
  it('rejects a request without a bearer token', async () => {
    const request: AuthenticatedRequest = { headers: {} };
    const guard = createGuard(() => Promise.resolve(verifiedIdentity));

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid identity token without exposing provider errors', async () => {
    const request: AuthenticatedRequest = { headers: { authorization: 'Bearer invalid' } };
    const guard = createGuard(() => Promise.reject(new InvalidIdentityTokenError()));

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.authenticatedUser).toBeUndefined();
  });

  it('reports identity-provider degradation as retryable unavailability', async () => {
    const request: AuthenticatedRequest = { headers: { authorization: 'Bearer unverifiable' } };
    const guard = createGuard(() => Promise.reject(new IdentityProviderUnavailableError()));

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request.authenticatedUser).toBeUndefined();
  });

  it('resolves the verified identity to a local user', async () => {
    const request: AuthenticatedRequest = { headers: { authorization: 'Bearer valid' } };
    const guard = createGuard(() => Promise.resolve(verifiedIdentity));

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.authenticatedUser).toEqual(localUser);
  });
});

function createGuard(verify: (token: string) => Promise<VerifiedIdentity>): AuthenticationGuard {
  const users = new UsersService({ resolveIdentity: () => Promise.resolve(localUser) });
  const authentication = new AuthenticationService({ verify }, users);
  return new AuthenticationGuard(authentication);
}

function createContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
