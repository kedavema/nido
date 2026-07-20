import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  CreatePaymentSourceResponseSchema,
  CreateTransactionResponseSchema,
  ListTransactionsResponseSchema,
  UpdateTransactionResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-txn-owner',
    email: 'txn-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  member: {
    firebaseUid: 'firebase-txn-member',
    email: 'txn-member@example.com',
    displayName: 'Member',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-txn-outsider',
    email: 'txn-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

// HTTP-level cross-household isolation for transactions, mirroring the pattern established by
// `categories-api.integration.spec.ts` and `payment-sources-api.integration.spec.ts`. Per ADR
// 0002's "Verificación obligatoria": a member of household A must not be able to list, read,
// create against, update, or delete household B's transactions, even with known valid UUIDs, and
// a transaction cannot be created referencing a category or payment source from another
// household.
describe.skipIf(!hasTestDatabase)('Transactions API with PostgreSQL', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
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

    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { configureApplication } = await import('../src/configure-application.js');
    configureApplication(app, { corsOrigins: ['http://localhost:8081'] });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE transactions, categories, payment_sources, household_invites, household_members, households, users CASCADE',
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

  it('requires authentication on every transaction route', async () => {
    const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
    expect((await request(`/v1/households/${householdId}/transactions`)).status).toBe(401);
    expect(
      (await request(`/v1/households/${householdId}/transactions`, { method: 'POST', body: {} }))
        .status,
    ).toBe(401);
  });

  it('conceals the household from non-members with 404 on every verb', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const transaction = await createTransaction('owner', householdId, {
      categoryId: category.category.id,
    });

    expect(
      (await request(`/v1/households/${householdId}/transactions`, { token: 'outsider' })).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/transactions`, {
          method: 'POST',
          token: 'outsider',
          body: validTransactionBody({ categoryId: category.category.id }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/transactions/${transaction.transaction.id}`, {
          token: 'outsider',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/transactions/${transaction.transaction.id}`, {
          method: 'PATCH',
          token: 'outsider',
          body: { description: 'Stolen' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/transactions/${transaction.transaction.id}`, {
          method: 'DELETE',
          token: 'outsider',
        })
      ).status,
    ).toBe(404);
  });

  it('lets an active MEMBER manage transactions too', async () => {
    const householdId = await createHousehold('owner');
    await addActiveMember(householdId, identities.member);
    const category = await createCategory('owner', householdId, { name: 'Comida' });

    const created = await createTransaction('member', householdId, {
      categoryId: category.category.id,
    });
    const patchResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { method: 'PATCH', token: 'member', body: { description: 'Supermercado' } },
    );
    expect(patchResponse.status).toBe(200);
    const updated = UpdateTransactionResponseSchema.parse(await patchResponse.json());
    expect(updated.transaction.description).toBe('Supermercado');

    const deleteResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { method: 'DELETE', token: 'member' },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("cannot list, read, update, or delete another household's transactions with a known valid UUID", async () => {
    const ownHouseholdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const foreignCategory = await createCategory('outsider', otherHouseholdId, { name: 'Comida' });
    const foreign = await createTransaction('outsider', otherHouseholdId, {
      categoryId: foreignCategory.category.id,
    });

    // A owns a household of its own (so it is an active member somewhere) but must not reach
    // B's transaction, even though the transaction id is a real, known, valid UUID.
    expect(
      (
        await request(`/v1/households/${ownHouseholdId}/transactions/${foreign.transaction.id}`, {
          token: 'owner',
        })
      ).status,
    ).toBe(404);

    const patchResponse = await request(
      `/v1/households/${ownHouseholdId}/transactions/${foreign.transaction.id}`,
      { method: 'PATCH', token: 'owner', body: { description: 'Robado' } },
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await request(
      `/v1/households/${ownHouseholdId}/transactions/${foreign.transaction.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(404);

    // The transaction must not have been touched.
    const stored = await pool.query<{ description: string }>(
      'SELECT description FROM transactions WHERE id = $1',
      [foreign.transaction.id],
    );
    expect(stored.rows).toEqual([{ description: 'Test movement' }]);

    // And straight requests against B's own household route, authenticated as A, are equally
    // concealed (list included).
    expect(
      (await request(`/v1/households/${otherHouseholdId}/transactions`, { token: 'owner' })).status,
    ).toBe(404);
  });

  it('rejects creating a transaction against a category from a different household with 400', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const foreignCategory = await createCategory('outsider', otherHouseholdId, { name: 'Comida' });

    const response = await request(`/v1/households/${householdId}/transactions`, {
      method: 'POST',
      token: 'owner',
      body: validTransactionBody({ categoryId: foreignCategory.category.id }),
    });
    expect(response.status).toBe(400);

    const stored = await pool.query('SELECT id FROM transactions WHERE household_id = $1', [
      householdId,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it('rejects creating a transaction against a payment source from a different household with 400', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const foreignPaymentSource = await createPaymentSource('outsider', otherHouseholdId, {
      name: 'Efectivo ajeno',
    });

    const response = await request(`/v1/households/${householdId}/transactions`, {
      method: 'POST',
      token: 'owner',
      body: validTransactionBody({
        categoryId: category.category.id,
        paymentSourceId: foreignPaymentSource.paymentSource.id,
      }),
    });
    expect(response.status).toBe(400);

    const stored = await pool.query('SELECT id FROM transactions WHERE household_id = $1', [
      householdId,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it("rejects updating a transaction to reference another household's category or payment source with 400", async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const foreignCategory = await createCategory('outsider', otherHouseholdId, { name: 'Comida' });
    const foreignPaymentSource = await createPaymentSource('outsider', otherHouseholdId, {
      name: 'Efectivo ajeno',
    });
    const created = await createTransaction('owner', householdId, {
      categoryId: category.category.id,
    });

    const categoryPatch = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { method: 'PATCH', token: 'owner', body: { categoryId: foreignCategory.category.id } },
    );
    expect(categoryPatch.status).toBe(400);

    const paymentSourcePatch = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      {
        method: 'PATCH',
        token: 'owner',
        body: { paymentSourceId: foreignPaymentSource.paymentSource.id },
      },
    );
    expect(paymentSourcePatch.status).toBe(400);
  });

  it('creates, lists, updates, and deletes a transaction within its own household', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const paymentSource = await createPaymentSource('owner', householdId, { name: 'Efectivo' });

    const created = await createTransaction('owner', householdId, {
      categoryId: category.category.id,
      paymentSourceId: paymentSource.paymentSource.id,
    });

    const listResponse = await request(`/v1/households/${householdId}/transactions`, {
      token: 'owner',
    });
    expect(listResponse.status).toBe(200);
    const list = ListTransactionsResponseSchema.parse(await listResponse.json());
    expect(list.transactions.map((transaction) => transaction.id)).toEqual([
      created.transaction.id,
    ]);

    const getResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { token: 'owner' },
    );
    expect(getResponse.status).toBe(200);

    const patchResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { method: 'PATCH', token: 'owner', body: { description: 'Supermercado semanal' } },
    );
    expect(patchResponse.status).toBe(200);

    const deleteResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(204);

    const stored = await pool.query('SELECT id FROM transactions WHERE id = $1', [
      created.transaction.id,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it('rejects a malformed transaction id with 400', async () => {
    const householdId = await createHousehold('owner');

    const response = await request(`/v1/households/${householdId}/transactions/not-a-uuid`, {
      method: 'DELETE',
      token: 'owner',
    });
    expect(response.status).toBe(400);
  });

  function validTransactionBody(overrides: {
    readonly categoryId: string;
    readonly paymentSourceId?: string;
  }): Record<string, unknown> {
    return {
      type: 'EXPENSE',
      amount: '10000',
      currency: 'PYG',
      occurredAt: '2026-03-15T15:00:00.000Z',
      categoryId: overrides.categoryId,
      description: 'Test movement',
      ...(overrides.paymentSourceId === undefined
        ? {}
        : { paymentSourceId: overrides.paymentSourceId }),
    };
  }

  async function createHousehold(token: keyof typeof identities): Promise<string> {
    const response = await request('/v1/households', {
      method: 'POST',
      token,
      body: { name: `Casa ${token}` },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdResponseSchema.parse(await response.json()).household.id;
  }

  async function createCategory(
    token: keyof typeof identities,
    householdId: string,
    input: { readonly name: string; readonly kind?: 'EXPENSE' | 'INCOME' },
  ) {
    const response = await request(`/v1/households/${householdId}/categories`, {
      method: 'POST',
      token,
      body: {
        kind: input.kind ?? 'EXPENSE',
        name: input.name,
        icon: 'wallet',
        color: '#AABBCC',
      },
    });
    expect(response.status).toBe(201);
    return CreateCategoryResponseSchema.parse(await response.json());
  }

  async function createPaymentSource(
    token: keyof typeof identities,
    householdId: string,
    input: { readonly name: string },
  ) {
    const response = await request(`/v1/households/${householdId}/payment-sources`, {
      method: 'POST',
      token,
      body: { name: input.name, type: 'CASH' },
    });
    expect(response.status).toBe(201);
    return CreatePaymentSourceResponseSchema.parse(await response.json());
  }

  async function createTransaction(
    token: keyof typeof identities,
    householdId: string,
    input: { readonly categoryId: string; readonly paymentSourceId?: string },
  ) {
    const response = await request(`/v1/households/${householdId}/transactions`, {
      method: 'POST',
      token,
      body: validTransactionBody(input),
    });
    expect(response.status).toBe(201);
    return CreateTransactionResponseSchema.parse(await response.json());
  }

  async function addActiveMember(householdId: string, identity: VerifiedIdentity): Promise<void> {
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
