import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  CreateRecurringItemResponseSchema,
  ListOccurrencesResponseSchema,
  MonthlySummaryResponseSchema,
  SettleOccurrenceResponseSchema,
  SkipOccurrenceResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-occ-owner',
    email: 'occ-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-occ-outsider',
    email: 'occ-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

// HTTP-level coverage for the occurrences slice (T-505 / issue #77), mirroring the harness of
// recurring-items-api.integration.spec.ts. Focus is the ADR 0009 point-3 lazy-on-read sweep: it
// runs on the first authenticated read of the day, marks past-due PENDING occurrences OVERDUE
// without ever touching SETTLED/SKIPPED, is idempotent and safe under concurrency (advisory lock),
// and never fires twice in the same calendar day for the same household.
describe.skipIf(!hasTestDatabase)('Occurrences API with PostgreSQL', () => {
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
      'TRUNCATE TABLE occurrences, recurring_items, categories, payment_sources, household_invites, household_members, households, users CASCADE',
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

  it('requires authentication on the occurrences route', async () => {
    const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
    expect((await request(`/v1/households/${householdId}/occurrences`)).status).toBe(401);
  });

  it("conceals another household's occurrences from a non-member with 404", async () => {
    const householdId = await createHousehold('owner');
    expect(
      (await request(`/v1/households/${householdId}/occurrences`, { token: 'outsider' })).status,
    ).toBe(404);
  });

  it('rejects an unknown status filter with 400', async () => {
    const householdId = await createHousehold('owner');
    expect(
      (
        await request(`/v1/households/${householdId}/occurrences?status=CANCELLED`, {
          token: 'owner',
        })
      ).status,
    ).toBe(400);
  });

  // The core lazy-on-read behavior: a rule whose first due date is in the past generates PENDING
  // occurrences (T-504), and the first GET of the day sweeps them so anything before today becomes
  // OVERDUE — without a scheduler ever running.
  it('marks past-due PENDING occurrences OVERDUE on the first read, and filters by status and date range', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-01-10',
      frequency: 'MONTHLY',
    });

    // Before any read, no sweep has run: every generated occurrence is still PENDING.
    const beforeRead = await pool.query<{ status: string }>(
      'SELECT status FROM occurrences WHERE recurring_item_id = $1',
      [created.recurringItem.id],
    );
    expect(beforeRead.rows.every((row) => row.status === 'PENDING')).toBe(true);

    const listResponse = await request(`/v1/households/${householdId}/occurrences`, {
      token: 'owner',
    });
    expect(listResponse.status).toBe(200);
    const list = ListOccurrencesResponseSchema.parse(await listResponse.json());
    expect(list.occurrences.length).toBeGreaterThan(0);

    const todayIso = new Date().toISOString().slice(0, 10);
    for (const occurrence of list.occurrences) {
      if (occurrence.dueDate < todayIso) {
        expect(occurrence.status).toBe('OVERDUE');
      } else {
        expect(occurrence.status).toBe('PENDING');
      }
    }

    // The daily marker is stamped so subsequent reads short-circuit.
    const marker = await pool.query<{ last_swept_on: Date | null }>(
      'SELECT last_swept_on FROM households WHERE id = $1',
      [householdId],
    );
    expect(marker.rows[0]?.last_swept_on?.toISOString().slice(0, 10)).toBe(todayIso);

    // Status filter: only OVERDUE rows come back, and they are exactly the past-due ones.
    const overdueResponse = await request(
      `/v1/households/${householdId}/occurrences?status=OVERDUE`,
      { token: 'owner' },
    );
    const overdue = ListOccurrencesResponseSchema.parse(await overdueResponse.json());
    expect(overdue.occurrences.length).toBeGreaterThan(0);
    expect(overdue.occurrences.every((occurrence) => occurrence.status === 'OVERDUE')).toBe(true);
    expect(overdue.occurrences.every((occurrence) => occurrence.dueDate < todayIso)).toBe(true);

    // Date-range filter: an inclusive window returns only occurrences inside it.
    const rangeResponse = await request(
      `/v1/households/${householdId}/occurrences?from=2026-01-01&to=2026-03-31`,
      { token: 'owner' },
    );
    const range = ListOccurrencesResponseSchema.parse(await rangeResponse.json());
    expect(range.occurrences.map((occurrence) => occurrence.dueDate)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ]);
  });

  // The single most important sweep invariant: it only ever creates PENDING rows or flips
  // PENDING -> OVERDUE. A SETTLED or SKIPPED occurrence must survive a sweep completely untouched.
  it('never touches SETTLED or SKIPPED occurrences when sweeping', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-01-10',
      frequency: 'MONTHLY',
    });

    // Settle one past occurrence and skip another, directly via SQL (settle/skip endpoints are
    // T-506, out of scope) — both are past-due, so a naive sweep would wrongly mark them OVERDUE.
    await pool.query(
      `UPDATE occurrences SET status = 'SETTLED', settled_at = now(), amount = '195000.00'
       WHERE recurring_item_id = $1 AND due_date = $2`,
      [created.recurringItem.id, '2026-02-10'],
    );
    await pool.query(
      `UPDATE occurrences SET status = 'SKIPPED' WHERE recurring_item_id = $1 AND due_date = $2`,
      [created.recurringItem.id, '2026-03-10'],
    );

    const readResponse = await request(`/v1/households/${householdId}/occurrences`, {
      token: 'owner',
    });
    expect(readResponse.status).toBe(200);

    const settled = await pool.query<{ status: string; amount: string; settled_at: Date | null }>(
      'SELECT status, amount, settled_at FROM occurrences WHERE recurring_item_id = $1 AND due_date = $2',
      [created.recurringItem.id, '2026-02-10'],
    );
    expect(settled.rows[0]?.status).toBe('SETTLED');
    expect(Number(settled.rows[0]?.amount)).toBe(195000);
    expect(settled.rows[0]?.settled_at).not.toBeNull();

    const skipped = await pool.query<{ status: string }>(
      'SELECT status FROM occurrences WHERE recurring_item_id = $1 AND due_date = $2',
      [created.recurringItem.id, '2026-03-10'],
    );
    expect(skipped.rows[0]?.status).toBe('SKIPPED');
  });

  // ADR 0009: at most one sweep per household per calendar day. Once today's read has stamped the
  // marker, a later occurrence that would otherwise be swept OVERDUE is left alone until tomorrow.
  it('does not sweep again on a second read the same day', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-01-10',
      frequency: 'MONTHLY',
    });

    // First read sweeps and stamps last_swept_on = today.
    expect(
      (await request(`/v1/households/${householdId}/occurrences`, { token: 'owner' })).status,
    ).toBe(200);

    // Inject a fresh past-due PENDING occurrence that a second sweep *would* mark OVERDUE.
    await pool.query(
      `INSERT INTO occurrences (recurring_item_id, household_id, due_date, amount, currency, status, updated_at)
       VALUES ($1, $2, $3, '200000.00', 'PYG', 'PENDING', now())`,
      [created.recurringItem.id, householdId, '2025-12-10'],
    );

    // Second read the same day must be a no-op: the injected row stays PENDING.
    expect(
      (await request(`/v1/households/${householdId}/occurrences`, { token: 'owner' })).status,
    ).toBe(200);
    const injected = await pool.query<{ status: string }>(
      'SELECT status FROM occurrences WHERE recurring_item_id = $1 AND due_date = $2',
      [created.recurringItem.id, '2025-12-10'],
    );
    expect(injected.rows[0]?.status).toBe('PENDING');
  });

  // Concurrency: two simultaneous first-of-the-day reads both trigger the sweep, but the advisory
  // lock plus idempotent generation must leave exactly one horizon's worth of occurrences — no
  // duplicates, no double-processing.
  it('is safe under two concurrent first-of-day reads (no duplicate occurrences)', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });

    // Simulate a household that has never been swept and whose occurrences were lost, so both
    // concurrent reads have real generation work to do at the same time.
    await pool.query('DELETE FROM occurrences WHERE recurring_item_id = $1', [
      created.recurringItem.id,
    ]);
    await pool.query('UPDATE households SET last_swept_on = NULL WHERE id = $1', [householdId]);

    const [first, second] = await Promise.all([
      request(`/v1/households/${householdId}/occurrences`, { token: 'owner' }),
      request(`/v1/households/${householdId}/occurrences`, { token: 'owner' }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // MONTHLY from 2026-07-10 across the 12-month horizon is exactly 13 rows, with unique due dates.
    const occurrences = await pool.query<{ due_date: Date }>(
      'SELECT due_date FROM occurrences WHERE recurring_item_id = $1 ORDER BY due_date',
      [created.recurringItem.id],
    );
    expect(occurrences.rows).toHaveLength(13);
    expect(new Set(occurrences.rows.map((row) => row.due_date.toISOString())).size).toBe(13);
  });

  // docs/system-design.md §10 "Pagar un gasto fijo": settling creates a real transaction linked 1:1
  // to the occurrence and flips it to SETTLED, atomically.
  it('settles a due occurrence into a linked RECURRING transaction and marks it SETTLED', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });
    const occurrenceId = await occurrenceIdAt(created.recurringItem.id, '2026-07-10');

    // Settle with a real amount that differs from the estimate.
    const response = await request(
      `/v1/households/${householdId}/occurrences/${occurrenceId}/settle`,
      { method: 'POST', token: 'owner', body: { amount: '198500' } },
    );
    expect(response.status).toBe(200);
    const settled = SettleOccurrenceResponseSchema.parse(await response.json());
    expect(settled.occurrence.status).toBe('SETTLED');
    expect(settled.occurrence.settledAt).not.toBeNull();
    expect(settled.transaction.origin).toBe('RECURRING');
    expect(settled.transaction.type).toBe('EXPENSE');
    expect(settled.transaction.amount).toBe('198500');
    expect(settled.transaction.categoryId).toBe(category.category.id);

    // Exactly one transaction, linked back to the occurrence.
    const stored = await pool.query<{ source_occurrence_id: string | null; origin: string }>(
      'SELECT source_occurrence_id, origin FROM transactions WHERE household_id = $1',
      [householdId],
    );
    expect(stored.rows).toEqual([{ source_occurrence_id: occurrenceId, origin: 'RECURRING' }]);
  });

  it('skips an occurrence without creating any transaction', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });
    const occurrenceId = await occurrenceIdAt(created.recurringItem.id, '2026-07-10');

    const response = await request(
      `/v1/households/${householdId}/occurrences/${occurrenceId}/skip`,
      { method: 'POST', token: 'owner' },
    );
    expect(response.status).toBe(200);
    const skipped = SkipOccurrenceResponseSchema.parse(await response.json());
    expect(skipped.occurrence.status).toBe('SKIPPED');

    const transactions = await pool.query('SELECT id FROM transactions WHERE household_id = $1', [
      householdId,
    ]);
    expect(transactions.rows).toEqual([]);
  });

  it('rejects settling an occurrence that is already SETTLED or SKIPPED with 409', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });
    const settleId = await occurrenceIdAt(created.recurringItem.id, '2026-07-10');
    const skipId = await occurrenceIdAt(created.recurringItem.id, '2026-08-10');

    expect(
      (
        await request(`/v1/households/${householdId}/occurrences/${settleId}/settle`, {
          method: 'POST',
          token: 'owner',
          body: {},
        })
      ).status,
    ).toBe(200);
    // Second settle of the same occurrence is a conflict, and creates no second transaction.
    expect(
      (
        await request(`/v1/households/${householdId}/occurrences/${settleId}/settle`, {
          method: 'POST',
          token: 'owner',
          body: {},
        })
      ).status,
    ).toBe(409);

    expect(
      (
        await request(`/v1/households/${householdId}/occurrences/${skipId}/skip`, {
          method: 'POST',
          token: 'owner',
        })
      ).status,
    ).toBe(200);
    // A SKIPPED occurrence cannot then be settled.
    expect(
      (
        await request(`/v1/households/${householdId}/occurrences/${skipId}/settle`, {
          method: 'POST',
          token: 'owner',
          body: {},
        })
      ).status,
    ).toBe(409);

    const transactions = await pool.query('SELECT id FROM transactions WHERE household_id = $1', [
      householdId,
    ]);
    expect(transactions.rows).toHaveLength(1);
  });

  // The atomicity guarantee: two concurrent settles of the same occurrence must produce exactly one
  // transaction (the row lock serializes them; the loser sees SETTLED and is rejected).
  it('creates only one transaction when the same occurrence is settled twice concurrently', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });
    const occurrenceId = await occurrenceIdAt(created.recurringItem.id, '2026-07-10');

    const [first, second] = await Promise.all([
      request(`/v1/households/${householdId}/occurrences/${occurrenceId}/settle`, {
        method: 'POST',
        token: 'owner',
        body: {},
      }),
      request(`/v1/households/${householdId}/occurrences/${occurrenceId}/settle`, {
        method: 'POST',
        token: 'owner',
        body: {},
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    // One wins (200), the other conflicts (409) — never two successes.
    expect(statuses).toEqual([200, 409]);

    const transactions = await pool.query('SELECT id FROM transactions WHERE household_id = $1', [
      householdId,
    ]);
    expect(transactions.rows).toHaveLength(1);
  });

  it("cannot settle another household's occurrence with 404", async () => {
    const ownHouseholdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const category = await createCategory('outsider', otherHouseholdId, { name: 'Comida' });
    const foreign = await createRecurringItem('outsider', otherHouseholdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });
    const foreignOccurrenceId = await occurrenceIdAt(foreign.recurringItem.id, '2026-07-10');

    expect(
      (
        await request(
          `/v1/households/${ownHouseholdId}/occurrences/${foreignOccurrenceId}/settle`,
          { method: 'POST', token: 'owner', body: {} },
        )
      ).status,
    ).toBe(404);
    const transactions = await pool.query('SELECT id FROM transactions');
    expect(transactions.rows).toEqual([]);
  });

  // docs/system-design.md §6.4 "evita que se contabilice dos veces": the full lifecycle
  // (rule → occurrence → settle → linked transaction → monthly summary) must count each settled
  // amount EXACTLY ONCE. The occurrence itself is never a movement — only its linked RECURRING
  // transaction contributes to the totals — and the rule's other (still PENDING) occurrences
  // contribute nothing. This ties the T-504/505/506 slices together end to end.
  it('counts a settled recurring amount exactly once in the monthly summary (no double counting)', async () => {
    const householdId = await createHousehold('owner');
    const expenseCategory = await createCategory('owner', householdId, { name: 'Comida' });
    const incomeCategory = await createCategory('owner', householdId, {
      name: 'Freelance',
      kind: 'INCOME',
    });

    const expenseRule = await createRecurringItem('owner', householdId, {
      categoryId: expenseCategory.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
      estimatedAmount: '200000',
    });
    const incomeRule = await createRecurringItem('owner', householdId, {
      categoryId: incomeCategory.category.id,
      firstDueDate: '2026-07-05',
      frequency: 'MONTHLY',
      kind: 'INCOME',
      estimatedAmount: '9500000',
      name: 'Salario',
    });

    // Settle exactly one occurrence of each, both dated inside July 2026, with real amounts that
    // differ from the estimates.
    const settleExpense = await request(
      `/v1/households/${householdId}/occurrences/${await occurrenceIdAt(expenseRule.recurringItem.id, '2026-07-10')}/settle`,
      {
        method: 'POST',
        token: 'owner',
        body: { amount: '198500', settledAt: '2026-07-10T13:00:00.000Z' },
      },
    );
    expect(settleExpense.status).toBe(200);
    const settleIncome = await request(
      `/v1/households/${householdId}/occurrences/${await occurrenceIdAt(incomeRule.recurringItem.id, '2026-07-05')}/settle`,
      {
        method: 'POST',
        token: 'owner',
        body: { amount: '9600000', settledAt: '2026-07-05T13:00:00.000Z' },
      },
    );
    expect(settleIncome.status).toBe(200);

    // Both rules generated a full 12-month horizon of occurrences, but only the two settled ones
    // became transactions — so the July totals reflect each settled amount once and nothing else.
    const summaryResponse = await request(
      `/v1/households/${householdId}/reports/monthly-summary?month=2026-07`,
      { token: 'owner' },
    );
    expect(summaryResponse.status).toBe(200);
    const summary = MonthlySummaryResponseSchema.parse(await summaryResponse.json());
    expect(summary.incomeTotal).toBe('9600000');
    expect(summary.expenseTotal).toBe('198500');
    expect(summary.balance).toBe('9401500');

    // And there are exactly two transactions total, both RECURRING and linked to their occurrence.
    const transactions = await pool.query<{ origin: string; source_occurrence_id: string | null }>(
      'SELECT origin, source_occurrence_id FROM transactions WHERE household_id = $1',
      [householdId],
    );
    expect(transactions.rows).toHaveLength(2);
    expect(transactions.rows.every((row) => row.origin === 'RECURRING')).toBe(true);
    expect(transactions.rows.every((row) => row.source_occurrence_id !== null)).toBe(true);
  });

  async function occurrenceIdAt(recurringItemId: string, dueDate: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      'SELECT id FROM occurrences WHERE recurring_item_id = $1 AND due_date = $2',
      [recurringItemId, dueDate],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error(`expected an occurrence at ${dueDate}`);
    }
    return id;
  }

  function validRecurringItemBody(overrides: {
    readonly categoryId: string;
    readonly firstDueDate?: string;
    readonly frequency?: 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'EVERY_N_MONTHS';
    readonly kind?: 'EXPENSE' | 'INCOME';
    readonly estimatedAmount?: string;
    readonly name?: string;
  }): Record<string, unknown> {
    return {
      kind: overrides.kind ?? 'EXPENSE',
      name: overrides.name ?? 'Internet',
      categoryId: overrides.categoryId,
      estimatedAmount: overrides.estimatedAmount ?? '200000',
      currency: 'PYG',
      frequency: overrides.frequency ?? 'MONTHLY',
      firstDueDate: overrides.firstDueDate ?? '2026-07-10',
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
      body: { kind: input.kind ?? 'EXPENSE', name: input.name, icon: 'wifi', color: '#AABBCC' },
    });
    expect(response.status).toBe(201);
    return CreateCategoryResponseSchema.parse(await response.json());
  }

  async function createRecurringItem(
    token: keyof typeof identities,
    householdId: string,
    input: {
      readonly categoryId: string;
      readonly firstDueDate?: string;
      readonly frequency?: 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'EVERY_N_MONTHS';
      readonly kind?: 'EXPENSE' | 'INCOME';
      readonly estimatedAmount?: string;
      readonly name?: string;
    },
  ) {
    const response = await request(`/v1/households/${householdId}/recurring-items`, {
      method: 'POST',
      token,
      body: validRecurringItemBody(input),
    });
    expect(response.status).toBe(201);
    return CreateRecurringItemResponseSchema.parse(await response.json());
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
