import { createHash } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateHouseholdInviteResponseSchema,
  CreateHouseholdResponseSchema,
  GetHouseholdMembersResponseSchema,
  GetMeResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HouseholdAccess } from '../src/households/household.js';
import {
  HOUSEHOLDS_REPOSITORY,
  type HouseholdsRepository,
} from '../src/households/households.repository.js';
import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-owner',
    email: 'owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  member: {
    firebaseUid: 'firebase-member',
    email: 'member@example.com',
    displayName: 'Member',
    avatarUrl: null,
  },
  other: {
    firebaseUid: 'firebase-other',
    email: 'other@example.com',
    displayName: 'Other',
    avatarUrl: null,
  },
  secondOwner: {
    firebaseUid: 'firebase-second-owner',
    email: 'second-owner@example.com',
    displayName: 'Second Owner',
    avatarUrl: null,
  },
  collision: {
    firebaseUid: 'firebase-collision',
    email: 'owner@example.com',
    displayName: 'Collision',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

describe.skipIf(!hasTestDatabase)('M1 API with PostgreSQL', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let householdsRepository: HouseholdsRepository;
  let pool: Pool;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('DATABASE_URL', testDatabaseUrl ?? '');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'nido-integration');
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:8081');

    const { AppModule } = await import('../src/app.module.js');
    const { IDENTITY_TOKEN_VERIFIER, InvalidIdentityTokenError } =
      await import('../src/auth/identity-token-verifier.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_TOKEN_VERIFIER)
      .useValue({
        verify: (token: string): Promise<VerifiedIdentity> => {
          const identitiesByToken: Readonly<Record<string, VerifiedIdentity>> = identities;
          const identity = identitiesByToken[token];
          if (identity === undefined) {
            return Promise.reject(new InvalidIdentityTokenError());
          }
          return Promise.resolve(identity);
        },
      })
      .compile();

    householdsRepository = moduleRef.get<HouseholdsRepository>(HOUSEHOLDS_REPOSITORY);
    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { configureApplication } = await import('../src/configure-application.js');
    configureApplication(app, { corsOrigins: ['http://localhost:8081'] });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE household_invites, household_members, households, users CASCADE',
    );
  });

  afterAll(async () => {
    try {
      await pool.end();
      await app.close();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps health unversioned, DB-backed, unthrottled, and CORS allowlisted', async () => {
    const readyResponse = await fetch(`${baseUrl}/health/ready`, {
      headers: { Origin: 'http://localhost:8081' },
    });

    expect(readyResponse.status).toBe(200);
    expect(readyResponse.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect((await fetch(`${baseUrl}/v1/health/ready`)).status).toBe(404);
  });

  it('reports unavailable when the required M1 migration is not complete', async () => {
    const migrationName = '20260716180000_m1_auth_households';
    const migration = await pool.query<{ finished_at: Date }>(
      'SELECT finished_at FROM _prisma_migrations WHERE migration_name = $1',
      [migrationName],
    );
    const finishedAt = migration.rows[0]?.finished_at;
    expect(finishedAt).toBeInstanceOf(Date);

    await pool.query('UPDATE _prisma_migrations SET finished_at = NULL WHERE migration_name = $1', [
      migrationName,
    ]);
    try {
      expect((await fetch(`${baseUrl}/health/ready`)).status).toBe(503);
    } finally {
      await pool.query('UPDATE _prisma_migrations SET finished_at = $2 WHERE migration_name = $1', [
        migrationName,
        finishedAt,
      ]);
    }
  });

  it('creates a household and its active OWNER in one operation', async () => {
    const household = await createHousehold('owner', 'Casa Nido');

    expect(household.household.role).toBe('OWNER');
    const rows = await pool.query<{ role: string; status: string; member_count: string }>(
      `SELECT hm.role::text, hm.status::text,
              (SELECT count(*) FROM household_members WHERE household_id = $1)::text AS member_count
         FROM household_members hm
        WHERE hm.household_id = $1`,
      [household.household.id],
    );
    expect(rows.rows).toEqual([{ role: 'OWNER', status: 'ACTIVE', member_count: '1' }]);

    const meResponse = await request('/v1/me', { token: 'owner' });
    expect(meResponse.status).toBe(200);
    const me = GetMeResponseSchema.parse(await meResponse.json());
    expect(me.households).toEqual([
      expect.objectContaining({ id: household.household.id, role: 'OWNER' }),
    ]);
  });

  it('rejects a different Firebase UID that collides with an existing email', async () => {
    expect((await request('/v1/me', { token: 'owner' })).status).toBe(200);
    expect((await request('/v1/me', { token: 'collision' })).status).toBe(401);

    const stored = await pool.query<{ firebase_uid: string; display_name: string }>(
      'SELECT firebase_uid, display_name FROM users WHERE email = $1',
      [identities.owner.email],
    );
    expect(stored.rows).toEqual([
      { firebase_uid: identities.owner.firebaseUid, display_name: identities.owner.displayName },
    ]);
  });

  it('allows active members and conceals valid households from other tenants', async () => {
    const firstHousehold = await createHousehold('owner', 'Casa Uno');
    const secondHousehold = await createHousehold('secondOwner', 'Casa Dos');
    const invite = await createInvite(
      'owner',
      firstHousehold.household.id,
      identities.member.email,
    );
    expect((await acceptInvite('member', invite.token)).status).toBe(201);

    expect(
      (await request(`/v1/households/${firstHousehold.household.id}`, { token: 'member' })).status,
    ).toBe(200);
    expect(
      (await request(`/v1/households/${firstHousehold.household.id}`, { token: 'secondOwner' }))
        .status,
    ).toBe(404);
    expect(
      (await request(`/v1/households/${secondHousehold.household.id}`, { token: 'member' })).status,
    ).toBe(404);

    const membersResponse = await request(`/v1/households/${firstHousehold.household.id}/members`, {
      token: 'member',
    });
    expect(membersResponse.status).toBe(200);
    const members = GetHouseholdMembersResponseSchema.parse(await membersResponse.json());
    expect(members.members.map(({ role }) => role)).toEqual(['OWNER', 'MEMBER']);

    await pool.query(
      `UPDATE household_members
          SET status = 'REMOVED'
        WHERE household_id = $1 AND user_id = (
          SELECT id FROM users WHERE firebase_uid = $2
        )`,
      [firstHousehold.household.id, identities.member.firebaseUid],
    );
    expect(
      (await request(`/v1/households/${firstHousehold.household.id}`, { token: 'member' })).status,
    ).toBe(404);
  });

  it('allows only an OWNER to create an invite and persists only its SHA-256 hash', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const invite = await createInvite('owner', household.household.id, '  MEMBER@EXAMPLE.COM ');

    expect(invite.invite.email).toBe('member@example.com');
    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM household_invites WHERE id = $1',
      [invite.invite.id],
    );
    expect(stored.rows[0]?.token_hash).toBe(
      createHash('sha256').update(invite.token).digest('hex'),
    );
    expect(stored.rows[0]?.token_hash).not.toContain(invite.token);

    await acceptInvite('member', invite.token);
    const memberInvite = await request(`/v1/households/${household.household.id}/invites`, {
      method: 'POST',
      token: 'member',
      body: { email: 'other@example.com' },
    });
    expect(memberInvite.status).toBe(403);
  });

  it('revalidates stale OWNER access inside the invite transaction', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const owner = await pool.query<{ id: string; joined_at: Date }>(
      `SELECT u.id, hm.joined_at
         FROM users u
         JOIN household_members hm ON hm.user_id = u.id
        WHERE u.firebase_uid = $1 AND hm.household_id = $2`,
      [identities.owner.firebaseUid, household.household.id],
    );
    const ownerRow = owner.rows[0];
    expect(ownerRow).toBeDefined();

    const staleAccess: HouseholdAccess = {
      actorId: ownerRow?.id ?? '',
      householdId: household.household.id,
      role: 'OWNER',
      joinedAt: ownerRow?.joined_at ?? new Date(0),
    };
    await pool.query(
      `UPDATE household_members
          SET role = 'MEMBER'
        WHERE household_id = $1 AND user_id = $2`,
      [staleAccess.householdId, staleAccess.actorId],
    );

    await expect(
      householdsRepository.createInvite({
        access: staleAccess,
        email: identities.member.email,
        tokenHash: 'a'.repeat(64),
        createdAt: new Date('2026-07-16T12:00:00.000Z'),
        expiresAt: new Date('2026-07-19T12:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    const invites = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM household_invites WHERE household_id = $1',
      [household.household.id],
    );
    expect(invites.rows[0]?.count).toBe('0');
  });

  it('accepts only the invited email and rejects reuse', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const invite = await createInvite('owner', household.household.id, identities.member.email);

    expect((await acceptInvite('other', invite.token)).status).toBe(404);
    const unused = await pool.query<{ used_at: Date | null }>(
      'SELECT used_at FROM household_invites WHERE id = $1',
      [invite.invite.id],
    );
    expect(unused.rows[0]?.used_at).toBeNull();

    expect((await acceptInvite('member', invite.token)).status).toBe(201);
    expect((await acceptInvite('member', invite.token)).status).toBe(404);
  });

  it('rejects an expired invite without consuming it', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const invite = await createInvite('owner', household.household.id, identities.member.email);
    await pool.query(
      "UPDATE household_invites SET expires_at = created_at + interval '1 millisecond' WHERE id = $1",
      [invite.invite.id],
    );

    expect((await acceptInvite('member', invite.token)).status).toBe(404);
    const stored = await pool.query<{ used_at: Date | null }>(
      'SELECT used_at FROM household_invites WHERE id = $1',
      [invite.invite.id],
    );
    expect(stored.rows[0]?.used_at).toBeNull();
  });

  it('has exactly one winner when the same invite is accepted concurrently', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const invite = await createInvite('owner', household.household.id, identities.member.email);
    expect((await request('/v1/me', { token: 'member' })).status).toBe(200);

    const responses = await Promise.all([
      acceptInvite('member', invite.token),
      acceptInvite('member', invite.token),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 404]);

    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM household_members
        WHERE household_id = $1 AND user_id = (
          SELECT id FROM users WHERE firebase_uid = $2
        )`,
      [household.household.id, identities.member.firebaseUid],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('rolls back one of two distinct invites accepted concurrently by the same user', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const firstInvite = await createInvite(
      'owner',
      household.household.id,
      identities.member.email,
    );
    const secondInvite = await createInvite(
      'owner',
      household.household.id,
      identities.member.email,
    );
    expect((await request('/v1/me', { token: 'member' })).status).toBe(200);

    const responses = await Promise.all([
      acceptInvite('member', firstInvite.token),
      acceptInvite('member', secondInvite.token),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);

    const inviteState = await pool.query<{ consumed: string; unused: string }>(
      `SELECT count(*) FILTER (WHERE used_at IS NOT NULL)::text AS consumed,
              count(*) FILTER (WHERE used_at IS NULL)::text AS unused
         FROM household_invites
        WHERE household_id = $1`,
      [household.household.id],
    );
    expect(inviteState.rows[0]).toEqual({ consumed: '1', unused: '1' });
    const membershipCount = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM household_members
        WHERE household_id = $1 AND user_id = (
          SELECT id FROM users WHERE firebase_uid = $2
        )`,
      [household.household.id, identities.member.firebaseUid],
    );
    expect(membershipCount.rows[0]?.count).toBe('1');
  });

  it('rolls back the token claim when membership already exists', async () => {
    const household = await createHousehold('owner', 'Casa Nido');
    const invite = await createInvite('owner', household.household.id, identities.owner.email);

    expect((await acceptInvite('owner', invite.token)).status).toBe(409);
    const stored = await pool.query<{ used_at: Date | null }>(
      'SELECT used_at FROM household_invites WHERE id = $1',
      [invite.invite.id],
    );
    expect(stored.rows[0]?.used_at).toBeNull();
  });

  async function createHousehold(token: keyof typeof identities, name: string) {
    const response = await request('/v1/households', {
      method: 'POST',
      token,
      body: { name },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdResponseSchema.parse(await response.json());
  }

  async function createInvite(token: keyof typeof identities, householdId: string, email: string) {
    const response = await request(`/v1/households/${householdId}/invites`, {
      method: 'POST',
      token,
      body: { email },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdInviteResponseSchema.parse(await response.json());
  }

  function acceptInvite(token: keyof typeof identities, invitationToken: string) {
    return request(`/v1/invites/${invitationToken}/accept`, { method: 'POST', token });
  }

  function request(
    path: string,
    options: {
      readonly token?: string;
      readonly method?: 'GET' | 'POST';
      readonly body?: unknown;
    } = {},
  ): Promise<Response> {
    const headers = new Headers();
    if (options.token !== undefined) {
      headers.set('Authorization', `Bearer ${options.token}`);
    }
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }
});
