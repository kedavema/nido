import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedRequest } from '../src/auth/authenticated-request.js';
import type { HouseholdAccess } from '../src/households/household.js';
import { HouseholdMembershipGuard } from '../src/households/household-membership.guard.js';
import type { HouseholdsRepository } from '../src/households/households.repository.js';
import type { LocalUser } from '../src/users/user.js';

const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
const now = new Date('2026-07-16T12:00:00.000Z');
const user: LocalUser = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  firebaseUid: 'firebase-member',
  email: 'member@example.com',
  displayName: 'Member',
  avatarUrl: null,
  timezone: 'America/Asuncion',
  createdAt: now,
  updatedAt: now,
};

describe('HouseholdMembershipGuard', () => {
  it('conceals a household without an active membership', async () => {
    const request = createRequest();
    const guard = createGuard(null, ['OWNER', 'MEMBER']);

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(request.householdAccess).toBeUndefined();
  });

  it.each([undefined, [], ['ADMIN']])(
    'fails closed when protected-route role metadata is invalid: %j',
    async (reflectedRoles) => {
      const request = createRequest();
      const guard = createGuard(createAccess('OWNER'), reflectedRoles);

      await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(request.householdAccess).toBeUndefined();
    },
  );

  it('rejects an active member from an OWNER-only route', async () => {
    const request = createRequest();
    const guard = createGuard(createAccess('MEMBER'), ['OWNER']);

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('attaches server-resolved access only when the active role is allowed', async () => {
    const request = createRequest();
    const access = createAccess('MEMBER');
    const guard = createGuard(access, ['OWNER', 'MEMBER']);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.householdAccess).toEqual(access);
  });
});

function createGuard(
  access: HouseholdAccess | null,
  reflectedRoles: unknown,
): HouseholdMembershipGuard {
  const repository = {
    findActiveAccess: () => Promise.resolve(access),
  } as unknown as HouseholdsRepository;
  const reflector = {
    getAllAndOverride: () => reflectedRoles,
  } as unknown as Reflector;
  return new HouseholdMembershipGuard(repository, reflector);
}

function createAccess(role: HouseholdAccess['role']): HouseholdAccess {
  return {
    actorId: user.id,
    householdId,
    role,
    joinedAt: now,
  };
}

function createRequest(): AuthenticatedRequest {
  return {
    headers: {},
    params: { householdId },
    authenticatedUser: user,
  };
}

function createContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => createContext,
    getClass: () => HouseholdMembershipGuard,
  } as unknown as ExecutionContext;
}
