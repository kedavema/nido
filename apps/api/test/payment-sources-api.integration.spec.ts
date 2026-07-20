import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateHouseholdResponseSchema,
  CreatePaymentSourceResponseSchema,
  ListPaymentSourcesResponseSchema,
  UpdatePaymentSourceResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PAYMENT_SOURCES_REPOSITORY,
  PaymentSourceOwnerMissingError,
  type PaymentSourcesRepository,
} from '../src/payment-sources/payment-sources.repository.js';
import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-ps-owner',
    email: 'ps-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  member: {
    firebaseUid: 'firebase-ps-member',
    email: 'ps-member@example.com',
    displayName: 'Member',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-ps-outsider',
    email: 'ps-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

describe.skipIf(!hasTestDatabase)('Payment sources API with PostgreSQL', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let pool: Pool;
  let paymentSourcesRepository: PaymentSourcesRepository;

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

    paymentSourcesRepository = moduleRef.get<PaymentSourcesRepository>(PAYMENT_SOURCES_REPOSITORY);
    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { configureApplication } = await import('../src/configure-application.js');
    configureApplication(app, { corsOrigins: ['http://localhost:8081'] });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    pool = new Pool({ connectionString: testDatabaseUrl });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_source_test_references (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_source_id uuid NOT NULL REFERENCES payment_sources(id) ON DELETE RESTRICT
      )
    `);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE payment_source_test_references, categories, payment_sources, household_invites, household_members, households, users CASCADE',
    );
  });

  afterAll(async () => {
    try {
      await pool.query('DROP TABLE IF EXISTS payment_source_test_references');
      await pool.end();
      await app.close();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('requires authentication on every payment source route', async () => {
    const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
    expect((await request(`/v1/households/${householdId}/payment-sources`)).status).toBe(401);
    expect(
      (await request(`/v1/households/${householdId}/payment-sources`, { method: 'POST', body: {} }))
        .status,
    ).toBe(401);
  });

  it('conceals the household from non-members with 404', async () => {
    const householdId = await createHousehold('owner');

    expect(
      (await request(`/v1/households/${householdId}/payment-sources`, { token: 'outsider' }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/payment-sources`, {
          method: 'POST',
          token: 'outsider',
          body: { name: 'Efectivo', type: 'CASH' },
        })
      ).status,
    ).toBe(404);
  });

  it('creates payment sources and lists them, archived included', async () => {
    const householdId = await createHousehold('owner');

    const bank = await createPaymentSource('owner', householdId, {
      name: 'Ueno Kevin',
      type: 'BANK_ACCOUNT',
    });
    const cash = await createPaymentSource('owner', householdId, {
      name: 'Efectivo',
      type: 'CASH',
    });
    expect(bank.paymentSource.ownerUserId).toBeNull();

    const patchResponse = await request(
      `/v1/households/${householdId}/payment-sources/${cash.paymentSource.id}`,
      { method: 'PATCH', token: 'owner', body: { isActive: false } },
    );
    expect(patchResponse.status).toBe(200);

    const listResponse = await request(`/v1/households/${householdId}/payment-sources`, {
      token: 'owner',
    });
    expect(listResponse.status).toBe(200);
    const list = ListPaymentSourcesResponseSchema.parse(await listResponse.json());
    expect(list.paymentSources).toHaveLength(2);
    expect(list.paymentSources.map((source) => source.isActive).sort()).toEqual([false, true]);
  });

  it('lets an active MEMBER manage payment sources too', async () => {
    const householdId = await createHousehold('owner');
    await addActiveMember(householdId, identities.member);

    const created = await createPaymentSource('member', householdId, {
      name: 'Billetera',
      type: 'DIGITAL_WALLET',
    });
    const patchResponse = await request(
      `/v1/households/${householdId}/payment-sources/${created.paymentSource.id}`,
      { method: 'PATCH', token: 'member', body: { name: 'Zimple' } },
    );
    expect(patchResponse.status).toBe(200);
    const updated = UpdatePaymentSourceResponseSchema.parse(await patchResponse.json());
    expect(updated.paymentSource.name).toBe('Zimple');
  });

  it('allows duplicate names because the database has no uniqueness rule for them', async () => {
    const householdId = await createHousehold('owner');

    await createPaymentSource('owner', householdId, { name: 'Efectivo', type: 'CASH' });
    const duplicate = await request(`/v1/households/${householdId}/payment-sources`, {
      method: 'POST',
      token: 'owner',
      body: { name: 'Efectivo', type: 'CASH' },
    });
    expect(duplicate.status).toBe(201);
  });

  it('assigns an active household member as informative owner and clears it later', async () => {
    const householdId = await createHousehold('owner');
    const memberUserId = await addActiveMember(householdId, identities.member);

    const created = await createPaymentSource('owner', householdId, {
      name: 'Cuenta Ale',
      type: 'BANK_ACCOUNT',
      ownerUserId: memberUserId,
    });
    expect(created.paymentSource.ownerUserId).toBe(memberUserId);

    const cleared = await request(
      `/v1/households/${householdId}/payment-sources/${created.paymentSource.id}`,
      { method: 'PATCH', token: 'owner', body: { ownerUserId: null } },
    );
    expect(cleared.status).toBe(200);
    expect(
      UpdatePaymentSourceResponseSchema.parse(await cleared.json()).paymentSource.ownerUserId,
    ).toBeNull();
  });

  it('rejects an owner that is not an active member of the household with 400', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const outsiderUserId = await findUserId(identities.outsider.firebaseUid);
    expect(otherHouseholdId).toBeTruthy();

    const createResponse = await request(`/v1/households/${householdId}/payment-sources`, {
      method: 'POST',
      token: 'owner',
      body: { name: 'Cuenta Ajena', type: 'BANK_ACCOUNT', ownerUserId: outsiderUserId },
    });
    expect(createResponse.status).toBe(400);

    const created = await createPaymentSource('owner', householdId, {
      name: 'Efectivo',
      type: 'CASH',
    });
    const patchResponse = await request(
      `/v1/households/${householdId}/payment-sources/${created.paymentSource.id}`,
      { method: 'PATCH', token: 'owner', body: { ownerUserId: outsiderUserId } },
    );
    expect(patchResponse.status).toBe(400);
  });

  it('changes the type through PATCH', async () => {
    const householdId = await createHousehold('owner');
    const created = await createPaymentSource('owner', householdId, {
      name: 'Ueno TC',
      type: 'BANK_ACCOUNT',
    });

    const patchResponse = await request(
      `/v1/households/${householdId}/payment-sources/${created.paymentSource.id}`,
      { method: 'PATCH', token: 'owner', body: { type: 'CREDIT_CARD' } },
    );
    expect(patchResponse.status).toBe(200);
    expect(
      UpdatePaymentSourceResponseSchema.parse(await patchResponse.json()).paymentSource.type,
    ).toBe('CREDIT_CARD');
  });

  it('conceals payment sources of other households from members with 404', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const foreign = await createPaymentSource('outsider', otherHouseholdId, {
      name: 'Efectivo',
      type: 'CASH',
    });

    const patchResponse = await request(
      `/v1/households/${householdId}/payment-sources/${foreign.paymentSource.id}`,
      { method: 'PATCH', token: 'owner', body: { name: 'Robado' } },
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await request(
      `/v1/households/${householdId}/payment-sources/${foreign.paymentSource.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(404);
  });

  it('hard-deletes on DELETE while nothing references payment sources', async () => {
    const householdId = await createHousehold('owner');
    const created = await createPaymentSource('owner', householdId, {
      name: 'Efectivo',
      type: 'CASH',
    });

    const deleteResponse = await request(
      `/v1/households/${householdId}/payment-sources/${created.paymentSource.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(204);

    const stored = await pool.query('SELECT id FROM payment_sources WHERE household_id = $1', [
      householdId,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it('archives on DELETE when another row references the payment source', async () => {
    const householdId = await createHousehold('owner');
    const created = await createPaymentSource('owner', householdId, {
      name: 'Ueno TC',
      type: 'CREDIT_CARD',
    });
    await pool.query('INSERT INTO payment_source_test_references (payment_source_id) VALUES ($1)', [
      created.paymentSource.id,
    ]);

    const response = await request(
      `/v1/households/${householdId}/payment-sources/${created.paymentSource.id}`,
      { method: 'DELETE', token: 'owner' },
    );

    expect(response.status).toBe(204);
    const stored = await pool.query<{ is_active: boolean }>(
      'SELECT is_active FROM payment_sources WHERE id = $1',
      [created.paymentSource.id],
    );
    expect(stored.rows).toEqual([{ is_active: false }]);
  });

  it('translates an owner foreign-key race into the owner-missing domain error', async () => {
    const householdId = await createHousehold('owner');

    // A user id that satisfies the membership pre-check in real requests can
    // still vanish before the write; the FK backstop must surface as the
    // owner-missing domain error straight from the persistence layer.
    await expect(
      paymentSourcesRepository.create({
        householdId,
        name: 'Cuenta Fantasma',
        type: 'BANK_ACCOUNT',
        ownerUserId: 'e2b7c5c1-5f7a-4f7e-9a5e-0f3d2c1b4a69',
      }),
    ).rejects.toBeInstanceOf(PaymentSourceOwnerMissingError);
  });

  it('rejects a malformed payment source id with 400', async () => {
    const householdId = await createHousehold('owner');

    const response = await request(`/v1/households/${householdId}/payment-sources/not-a-uuid`, {
      method: 'DELETE',
      token: 'owner',
    });
    expect(response.status).toBe(400);
  });

  async function createHousehold(token: keyof typeof identities): Promise<string> {
    const response = await request('/v1/households', {
      method: 'POST',
      token,
      body: { name: `Casa ${token}` },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdResponseSchema.parse(await response.json()).household.id;
  }

  async function createPaymentSource(
    token: keyof typeof identities,
    householdId: string,
    input: {
      readonly name: string;
      readonly type: 'BANK_ACCOUNT' | 'CASH' | 'CREDIT_CARD' | 'DIGITAL_WALLET' | 'OTHER';
      readonly ownerUserId?: string;
    },
  ) {
    const response = await request(`/v1/households/${householdId}/payment-sources`, {
      method: 'POST',
      token,
      body: {
        name: input.name,
        type: input.type,
        ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
      },
    });
    expect(response.status).toBe(201);
    return CreatePaymentSourceResponseSchema.parse(await response.json());
  }

  async function addActiveMember(householdId: string, identity: VerifiedIdentity): Promise<string> {
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, email, display_name, timezone, updated_at)
       VALUES ($1, $2, $3, 'America/Asuncion', now())
       RETURNING id`,
      [identity.firebaseUid, identity.email, identity.displayName],
    );
    const userId = user.rows[0]?.id;
    if (userId === undefined) {
      throw new Error('expected the seeded user id');
    }
    await pool.query(
      `INSERT INTO household_members (household_id, user_id, role, status)
       VALUES ($1, $2, 'MEMBER', 'ACTIVE')`,
      [householdId, userId],
    );
    return userId;
  }

  async function findUserId(firebaseUid: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE firebase_uid = $1',
      [firebaseUid],
    );
    const userId = result.rows[0]?.id;
    if (userId === undefined) {
      throw new Error('expected the user to exist');
    }
    return userId;
  }

  function request(
    path: string,
    options: {
      readonly token?: string;
      readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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
