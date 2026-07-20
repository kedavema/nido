import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  CreateTransactionResponseSchema,
  ListTransactionsResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-txn-money-owner',
    email: 'txn-money-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

// Real-Postgres money edge cases per ADR 0001/0007: the actual decimal(18,2)/decimal(18,4)/
// decimal(18,0) column behavior, the actual half-up rounding through the real API, real
// decimal(18,0) overflow rejection, and proof that a persisted `baseAmountPyg` is never
// recalculated on a later read. Unit tests already cover `money.ts` in isolation with mocks
// (see `test/transactions-money.spec.ts`); this file exercises the same rules end-to-end against
// a real database instead.
describe.skipIf(!hasTestDatabase)('Transactions money edge cases with PostgreSQL', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let pool: Pool;
  let householdId: string;
  let categoryId: string;

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
    householdId = await createHousehold();
    categoryId = await createCategory(householdId, 'Comida');
  });

  afterAll(async () => {
    try {
      await pool.end();
      await app.close();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('invalid currency scale (rejected before it ever reaches the database)', () => {
    it('rejects a PYG amount with a fractional component', async () => {
      const response = await createTransactionResponse({
        type: 'EXPENSE',
        amount: '100.5',
        currency: 'PYG',
        categoryId,
      });
      expect(response.status).toBe(400);
      await expectNoTransactionsStored();
    });

    it('rejects a USD amount with three or more decimals', async () => {
      const response = await createTransactionResponse({
        type: 'EXPENSE',
        amount: '45.999',
        currency: 'USD',
        fxRateToBase: '7350',
        categoryId,
      });
      expect(response.status).toBe(400);
      await expectNoTransactionsStored();
    });
  });

  it('rounds the ADR 0001 worked example half-up end-to-end (10.01 USD x 7350 = 73574 PYG)', async () => {
    const created = await createTransaction({
      type: 'EXPENSE',
      amount: '10.01',
      currency: 'USD',
      fxRateToBase: '7350',
      categoryId,
    });
    expect(created.transaction.baseAmountPyg).toBe('73574');

    // Verify the persisted column directly too, independent of the API's own serialization.
    const stored = await pool.query<{ base_amount_pyg: string }>(
      'SELECT base_amount_pyg::text FROM transactions WHERE id = $1',
      [created.transaction.id],
    );
    expect(stored.rows).toEqual([{ base_amount_pyg: '73574' }]);
  });

  it('rejects an amount x fxRateToBase combination that would overflow decimal(18,0)', async () => {
    // Both operands individually satisfy the contract's field-level bounds (amount fits
    // decimal(18,2)'s 16 integer digits, fxRateToBase fits decimal(18,4)'s 14 integer digits),
    // so this reaches the service's `computeBaseAmountPyg` and is rejected there as a
    // `BaseAmountPygOverflowError` (see the mirrored unit test in transactions-money.spec.ts),
    // not by contract-schema validation.
    const response = await createTransactionResponse({
      type: 'EXPENSE',
      amount: '9999999999999999.99',
      currency: 'USD',
      fxRateToBase: '99999999999999.9999',
      categoryId,
    });
    expect(response.status).toBe(400);
    await expectNoTransactionsStored();
  });

  it('never recalculates a historical baseAmountPyg on a later read', async () => {
    const created = await createTransaction({
      type: 'EXPENSE',
      amount: '10.01',
      currency: 'USD',
      fxRateToBase: '7350',
      categoryId,
    });
    expect(created.transaction.baseAmountPyg).toBe('73574');

    // Editing an unrelated field goes through the same "recompute baseAmountPyg from the
    // merged effective state" code path as any other update (see the field comment on
    // `UpdateTransactionRecordChanges`), but since amount/currency/fxRateToBase are untouched
    // the recomputation must land on the exact same historical value, not drift.
    const patchResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { method: 'PATCH', token: 'owner', body: { notes: 'Compra semanal' } },
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await request(
      `/v1/households/${householdId}/transactions/${created.transaction.id}`,
      { token: 'owner' },
    );
    const fetched = CreateTransactionResponseSchema.parse(await getResponse.json());
    expect(fetched.transaction.baseAmountPyg).toBe('73574');

    const listResponse = await request(`/v1/households/${householdId}/transactions`, {
      token: 'owner',
    });
    const list = ListTransactionsResponseSchema.parse(await listResponse.json());
    expect(
      list.transactions.find((transaction) => transaction.id === created.transaction.id)
        ?.baseAmountPyg,
    ).toBe('73574');

    // And the raw stored column was never touched by the read/list calls above.
    const stored = await pool.query<{ base_amount_pyg: string }>(
      'SELECT base_amount_pyg::text FROM transactions WHERE id = $1',
      [created.transaction.id],
    );
    expect(stored.rows).toEqual([{ base_amount_pyg: '73574' }]);
  });

  async function expectNoTransactionsStored(): Promise<void> {
    const stored = await pool.query('SELECT id FROM transactions WHERE household_id = $1', [
      householdId,
    ]);
    expect(stored.rows).toEqual([]);
  }

  async function createHousehold(): Promise<string> {
    const response = await request('/v1/households', {
      method: 'POST',
      token: 'owner',
      body: { name: 'Casa owner' },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdResponseSchema.parse(await response.json()).household.id;
  }

  async function createCategory(forHouseholdId: string, name: string): Promise<string> {
    const response = await request(`/v1/households/${forHouseholdId}/categories`, {
      method: 'POST',
      token: 'owner',
      body: { kind: 'EXPENSE', name, icon: 'wallet', color: '#AABBCC' },
    });
    expect(response.status).toBe(201);
    return CreateCategoryResponseSchema.parse(await response.json()).category.id;
  }

  function createTransactionResponse(body: Record<string, unknown>): Promise<Response> {
    return request(`/v1/households/${householdId}/transactions`, {
      method: 'POST',
      token: 'owner',
      body: { occurredAt: '2026-03-15T15:00:00.000Z', description: 'Test movement', ...body },
    });
  }

  async function createTransaction(body: Record<string, unknown>) {
    const response = await createTransactionResponse(body);
    expect(response.status).toBe(201);
    return CreateTransactionResponseSchema.parse(await response.json());
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
