import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { LocalUser } from '../src/users/user.js';
import type { HouseholdAccess } from '../src/households/household.js';
import type { HouseholdsRepository } from '../src/households/households.repository.js';
import { HouseholdsService } from '../src/households/households.service.js';
import { InvitationTokenService } from '../src/households/invitation-token.service.js';

const now = new Date('2026-07-16T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};
const user: LocalUser = {
  id: access.actorId,
  firebaseUid: 'firebase-owner',
  email: 'owner@example.com',
  displayName: 'Owner',
  avatarUrl: null,
  timezone: 'America/Asuncion',
  createdAt: now,
  updatedAt: now,
};

describe('HouseholdsService invitations', () => {
  it('creates a 72-hour invite and passes only its hash to persistence', async () => {
    const createInvite = vi.fn((input) =>
      Promise.resolve({
        id: '0d539fa4-e991-41d7-9d31-258b1307ec31',
        householdId: input.access.householdId,
        email: input.email,
        expiresAt: input.expiresAt,
      }),
    );
    const repository = createRepository({ createInvite });
    const service = new HouseholdsService(
      repository,
      { now: () => now },
      new InvitationTokenService(),
    );

    const response = await service.createInvite(access, 'member@example.com');

    expect(response.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(response.invite.expiresAt).toBe('2026-07-19T12:00:00.000Z');
    const persistedInput = createInvite.mock.calls[0]?.[0];
    expect(persistedInput?.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(persistedInput?.tokenHash).not.toBe(response.token);
    expect(JSON.stringify(persistedInput)).not.toContain(response.token);
  });

  it.each(['invalid'] as const)(
    'maps %s invites to one non-enumerating response',
    async (status) => {
      const repository = createRepository({
        acceptInvite: vi.fn(() => Promise.resolve({ status })),
      });
      const service = new HouseholdsService(
        repository,
        { now: () => now },
        new InvitationTokenService(),
      );

      await expect(service.acceptInvite(user, 'a'.repeat(43))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('rejects duplicate membership without accepting the invite', async () => {
    const repository = createRepository({
      acceptInvite: vi.fn(() => Promise.resolve({ status: 'duplicate-membership' as const })),
    });
    const service = new HouseholdsService(
      repository,
      { now: () => now },
      new InvitationTokenService(),
    );

    await expect(service.acceptInvite(user, 'a'.repeat(43))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

function createRepository(overrides: Partial<HouseholdsRepository> = {}): HouseholdsRepository {
  return {
    listActiveForUser: () => Promise.resolve([]),
    createWithOwner: () => Promise.reject(new Error('not used')),
    findActiveAccess: () => Promise.resolve(null),
    findDetail: () => Promise.resolve(null),
    listMembers: () => Promise.resolve([]),
    createInvite: () => Promise.reject(new Error('not used')),
    acceptInvite: () => Promise.resolve({ status: 'invalid' }),
    ...overrides,
  };
}
