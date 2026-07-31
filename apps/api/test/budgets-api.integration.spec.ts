import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  CopyBudgetMonthResponseSchema,
  GetBudgetMonthResponseSchema,
  UpsertBudgetMonthResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-budget-owner',
    email: 'budget-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-budget-outsider',
    email: 'budget-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

describe.skipIf(!hasTestDatabase)('Budgets API with PostgreSQL', () => {
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
          const identity = (identities as Readonly<Record<string, VerifiedIdentity>>)[token];
          return identity === undefined
            ? Promise.reject(new InvalidIdentityTokenError())
            : Promise.resolve(identity);
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
      'TRUNCATE TABLE budget_allocations, budget_months, categories, payment_sources, household_invites, household_members, households, users CASCADE',
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

  it('requires authentication and conceals another household', async () => {
    const householdId = await createHousehold('owner');
    expect((await request(`/v1/households/${householdId}/budgets/2026-07`)).status).toBe(401);

    const outsiderHouseholdId = await createHousehold('outsider');
    expect(
      (await request(`/v1/households/${outsiderHouseholdId}/budgets/2026-07`, { token: 'owner' }))
        .status,
    ).toBe(404);
  });

  it('creates, reads, and replaces a monthly budget', async () => {
    const householdId = await createHousehold('owner');
    const food = await createCategory(householdId, 'Food');
    const transport = await createCategory(householdId, 'Transport');

    const createResponse = await request(`/v1/households/${householdId}/budgets/2026-07`, {
      method: 'PUT',
      token: 'owner',
      body: {
        totalLimitPyg: '1000000',
        allocations: [
          { categoryId: food, amountPyg: '300000' },
          { categoryId: transport, amountPyg: '200000' },
        ],
      },
    });
    expect(createResponse.status).toBe(200);
    expect(
      UpsertBudgetMonthResponseSchema.parse(await createResponse.json()).budgetMonth,
    ).toMatchObject({
      month: '2026-07',
      totalLimitPyg: '1000000',
      unallocatedPyg: '500000',
    });

    const getResponse = await request(`/v1/households/${householdId}/budgets/2026-07`, {
      token: 'owner',
    });
    expect(GetBudgetMonthResponseSchema.parse(await getResponse.json()).budgetMonth).not.toBeNull();

    const replaceResponse = await request(`/v1/households/${householdId}/budgets/2026-07`, {
      method: 'PUT',
      token: 'owner',
      body: {
        totalLimitPyg: '900000',
        allocations: [{ categoryId: food, amountPyg: '400000' }],
      },
    });
    const replaced = UpsertBudgetMonthResponseSchema.parse(await replaceResponse.json());
    expect(replaced.budgetMonth.allocations).toEqual([{ categoryId: food, amountPyg: '400000' }]);
    expect(replaced.budgetMonth.unallocatedPyg).toBe('500000');
  });

  it('rejects over-allocation and non-root/non-expense categories', async () => {
    const householdId = await createHousehold('owner');
    const root = await createCategory(householdId, 'Food');
    const child = await createCategory(householdId, 'Groceries', root);
    const income = await createCategory(householdId, 'Salary', undefined, 'INCOME');

    const cases = [
      [{ categoryId: root, amountPyg: '1000001' }],
      [{ categoryId: child, amountPyg: '100000' }],
      [{ categoryId: income, amountPyg: '100000' }],
    ];
    for (const allocations of cases) {
      const response = await request(`/v1/households/${householdId}/budgets/2026-07`, {
        method: 'PUT',
        token: 'owner',
        body: { totalLimitPyg: '1000000', allocations },
      });
      expect(response.status).toBe(400);
    }

    const stored = await pool.query('SELECT id FROM budget_months WHERE household_id = $1', [
      householdId,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it('copies an explicit source month and refuses to overwrite a target', async () => {
    const householdId = await createHousehold('owner');
    const food = await createCategory(householdId, 'Food');
    const sourceResponse = await request(`/v1/households/${householdId}/budgets/2026-07`, {
      method: 'PUT',
      token: 'owner',
      body: { totalLimitPyg: '1000000', allocations: [{ categoryId: food, amountPyg: '300000' }] },
    });
    const source = UpsertBudgetMonthResponseSchema.parse(await sourceResponse.json()).budgetMonth;

    const copyResponse = await request(`/v1/households/${householdId}/budgets/2026-08/copy`, {
      method: 'POST',
      token: 'owner',
      body: { sourceMonth: '2026-07' },
    });
    const copied = CopyBudgetMonthResponseSchema.parse(await copyResponse.json()).budgetMonth;
    expect(copied.month).toBe('2026-08');
    expect(copied.copiedFromId).toBe(source.id);
    expect(copied.allocations).toEqual([{ categoryId: food, amountPyg: '300000' }]);

    const conflict = await request(`/v1/households/${householdId}/budgets/2026-08/copy`, {
      method: 'POST',
      token: 'owner',
      body: { sourceMonth: '2026-07' },
    });
    expect(conflict.status).toBe(409);
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

  async function createCategory(
    householdId: string,
    name: string,
    parentId?: string,
    kind: 'EXPENSE' | 'INCOME' = 'EXPENSE',
  ): Promise<string> {
    const response = await request(`/v1/households/${householdId}/categories`, {
      method: 'POST',
      token: 'owner',
      body: {
        kind,
        name,
        icon: 'wallet',
        color: '#AABBCC',
        ...(parentId === undefined ? {} : { parentId }),
      },
    });
    expect(response.status).toBe(201);
    return CreateCategoryResponseSchema.parse(await response.json()).category.id;
  }

  function request(
    path: string,
    options: {
      readonly token?: string;
      readonly method?: 'GET' | 'POST' | 'PUT';
      body?: unknown;
    } = {},
  ): Promise<Response> {
    const headers = new Headers();
    if (options.token !== undefined) headers.set('Authorization', `Bearer ${options.token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    return fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }
});
