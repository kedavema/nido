import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  CreateTransactionResponseSchema,
  MonthlySummaryResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-txn-summary-owner',
    email: 'txn-summary-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

// Monthly-summary aggregation correctness (docs/system-design.md §6.8, ADR 0007) verified against
// the real aggregation SQL in `monthly-summary.service.ts`/`prisma-transactions.repository.ts` —
// no mocking. Several transactions mix PYG and USD, expense and income, and two expense root
// categories in the same household/month; the endpoint's balance/totals/breakdown are checked
// against hand-computed expectations.
describe.skipIf(!hasTestDatabase)('Monthly summary aggregation with PostgreSQL', () => {
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

  it('aggregates balance, totals, and category breakdown across mixed PYG/USD transactions', async () => {
    const householdId = await createHousehold();
    const foodCategoryId = await createCategory(householdId, 'Comida', 'EXPENSE');
    const transportCategoryId = await createCategory(householdId, 'Transporte', 'EXPENSE');
    const salaryCategoryId = await createCategory(householdId, 'Sueldo', 'INCOME');

    // Two expenses fold into the "Comida" root: a plain PYG amount and a USD amount converted
    // with ADR 0001's worked example (10.01 x 7350 = 73574 PYG half-up).
    await createTransaction(householdId, {
      type: 'EXPENSE',
      amount: '100000',
      currency: 'PYG',
      categoryId: foodCategoryId,
      occurredAt: '2026-03-05T15:00:00.000Z',
      description: 'Supermercado',
    });
    await createTransaction(householdId, {
      type: 'EXPENSE',
      amount: '10.01',
      currency: 'USD',
      fxRateToBase: '7350',
      categoryId: foodCategoryId,
      occurredAt: '2026-03-10T15:00:00.000Z',
      description: 'Delivery',
    });
    await createTransaction(householdId, {
      type: 'EXPENSE',
      amount: '50000',
      currency: 'PYG',
      categoryId: transportCategoryId,
      occurredAt: '2026-03-12T15:00:00.000Z',
      description: 'Combustible',
    });
    await createTransaction(householdId, {
      type: 'INCOME',
      amount: '500000',
      currency: 'PYG',
      categoryId: salaryCategoryId,
      occurredAt: '2026-03-01T15:00:00.000Z',
      description: 'Sueldo mensual',
    });

    // A transaction outside the queried month must not be aggregated.
    await createTransaction(householdId, {
      type: 'EXPENSE',
      amount: '999999',
      currency: 'PYG',
      categoryId: transportCategoryId,
      occurredAt: '2026-02-20T15:00:00.000Z',
      description: 'Fuera de mes',
    });

    const response = await request(`/v1/households/${householdId}/reports/monthly-summary`, {
      token: 'owner',
      query: { month: '2026-03' },
    });
    expect(response.status).toBe(200);
    const summary = MonthlySummaryResponseSchema.parse(await response.json());

    // Hand-computed expectations:
    // - Comida: 100000 + 73574 (10.01 USD x 7350 half-up) = 173574
    // - Transporte: 50000
    // - expenseTotal = 173574 + 50000 = 223574
    // - incomeTotal = 500000
    // - balance = 500000 - 223574 = 276426
    // - percentages (half-up to 2 decimals of amount/expenseTotal x 100):
    //   Comida: 173574 / 223574 x 100 = 77.64 ; Transporte: 50000 / 223574 x 100 = 22.36
    expect(summary.incomeTotal).toBe('500000');
    expect(summary.expenseTotal).toBe('223574');
    expect(summary.balance).toBe('276426');
    expect(summary.categoryBreakdown).toEqual([
      { categoryId: foodCategoryId, categoryName: 'Comida', amount: '173574', percentage: 77.64 },
      {
        categoryId: transportCategoryId,
        categoryName: 'Transporte',
        amount: '50000',
        percentage: 22.36,
      },
    ]);
  });

  it('returns zeroed totals and an empty breakdown for a month with no transactions', async () => {
    const householdId = await createHousehold();

    const response = await request(`/v1/households/${householdId}/reports/monthly-summary`, {
      token: 'owner',
      query: { month: '2026-05' },
    });
    expect(response.status).toBe(200);
    const summary = MonthlySummaryResponseSchema.parse(await response.json());

    expect(summary).toMatchObject({
      balance: '0',
      incomeTotal: '0',
      expenseTotal: '0',
      categoryBreakdown: [],
      recentTransactions: [],
    });
  });

  async function createHousehold(): Promise<string> {
    const response = await request('/v1/households', {
      method: 'POST',
      token: 'owner',
      body: { name: 'Casa owner' },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdResponseSchema.parse(await response.json()).household.id;
  }

  async function createCategory(
    householdId: string,
    name: string,
    kind: 'EXPENSE' | 'INCOME',
  ): Promise<string> {
    const response = await request(`/v1/households/${householdId}/categories`, {
      method: 'POST',
      token: 'owner',
      body: { kind, name, icon: 'wallet', color: '#AABBCC' },
    });
    expect(response.status).toBe(201);
    return CreateCategoryResponseSchema.parse(await response.json()).category.id;
  }

  async function createTransaction(
    householdId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const response = await request(`/v1/households/${householdId}/transactions`, {
      method: 'POST',
      token: 'owner',
      body,
    });
    expect(response.status).toBe(201);
    CreateTransactionResponseSchema.parse(await response.json());
  }

  function request(
    path: string,
    options: {
      readonly token?: string;
      readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      readonly body?: unknown;
      readonly query?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    const headers = new Headers();
    if (options.token !== undefined) {
      headers.set('Authorization', `Bearer ${options.token}`);
    }
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    return fetch(url, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }
});
