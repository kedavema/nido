import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  CreateRecurringItemResponseSchema,
  ListRecurringItemsResponseSchema,
  UpdateRecurringItemResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-recur-owner',
    email: 'recur-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  member: {
    firebaseUid: 'firebase-recur-member',
    email: 'recur-member@example.com',
    displayName: 'Member',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-recur-outsider',
    email: 'recur-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

// HTTP-level coverage for recurring-items (T-504 / issue #75), mirroring the pattern established
// by transactions-api.integration.spec.ts: household-membership guarding, cross-household
// isolation, plus the two ADR 0009 behaviors that are easiest to get wrong — a `SETTLED`
// occurrence must survive a rule edit completely untouched, and re-generating occurrences for the
// same rule must never duplicate rows or throw on the unique (recurring_item_id, due_date)
// constraint.
describe.skipIf(!hasTestDatabase)('Recurring items API with PostgreSQL', () => {
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

  it('requires authentication on every recurring-item route', async () => {
    const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
    expect((await request(`/v1/households/${householdId}/recurring-items`)).status).toBe(401);
    expect(
      (
        await request(`/v1/households/${householdId}/recurring-items`, {
          method: 'POST',
          body: {},
        })
      ).status,
    ).toBe(401);
  });

  it('conceals the household from non-members with 404 on every verb', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });
    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
    });

    expect(
      (await request(`/v1/households/${householdId}/recurring-items`, { token: 'outsider' }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/recurring-items`, {
          method: 'POST',
          token: 'outsider',
          body: validRecurringItemBody({ categoryId: category.category.id }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`, {
          token: 'outsider',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`, {
          method: 'PATCH',
          token: 'outsider',
          body: { name: 'Robado' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`, {
          method: 'DELETE',
          token: 'outsider',
        })
      ).status,
    ).toBe(404);
  });

  it('lets an active MEMBER manage recurring items too', async () => {
    const householdId = await createHousehold('owner');
    await addActiveMember(householdId, identities.member);
    const category = await createCategory('owner', householdId, { name: 'Comida' });

    const created = await createRecurringItem('member', householdId, {
      categoryId: category.category.id,
    });
    const patchResponse = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'PATCH', token: 'member', body: { name: 'Internet fibra' } },
    );
    expect(patchResponse.status).toBe(200);

    const deleteResponse = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'DELETE', token: 'member' },
    );
    expect(deleteResponse.status).toBe(204);
  });

  // Cross-household isolation (mirrors transactions-api.integration.spec.ts's equivalent test).
  it("cannot list, read, update, or delete another household's recurring items with a known valid UUID", async () => {
    const ownHouseholdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const foreignCategory = await createCategory('outsider', otherHouseholdId, {
      name: 'Comida',
    });
    const foreign = await createRecurringItem('outsider', otherHouseholdId, {
      categoryId: foreignCategory.category.id,
    });

    expect(
      (
        await request(
          `/v1/households/${ownHouseholdId}/recurring-items/${foreign.recurringItem.id}`,
          { token: 'owner' },
        )
      ).status,
    ).toBe(404);

    const patchResponse = await request(
      `/v1/households/${ownHouseholdId}/recurring-items/${foreign.recurringItem.id}`,
      { method: 'PATCH', token: 'owner', body: { name: 'Robado' } },
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await request(
      `/v1/households/${ownHouseholdId}/recurring-items/${foreign.recurringItem.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(404);

    const stored = await pool.query<{ name: string; is_active: boolean }>(
      'SELECT name, is_active FROM recurring_items WHERE id = $1',
      [foreign.recurringItem.id],
    );
    expect(stored.rows).toEqual([{ name: 'Internet', is_active: true }]);

    expect(
      (await request(`/v1/households/${otherHouseholdId}/recurring-items`, { token: 'owner' }))
        .status,
    ).toBe(404);
  });

  it('rejects creating a recurring item against a category from a different household with 400', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const foreignCategory = await createCategory('outsider', otherHouseholdId, {
      name: 'Comida',
    });

    const response = await request(`/v1/households/${householdId}/recurring-items`, {
      method: 'POST',
      token: 'owner',
      body: validRecurringItemBody({ categoryId: foreignCategory.category.id }),
    });
    expect(response.status).toBe(400);

    const stored = await pool.query('SELECT id FROM recurring_items WHERE household_id = $1', [
      householdId,
    ]);
    expect(stored.rows).toEqual([]);
  });

  it('rejects a malformed recurring item id with 400', async () => {
    const householdId = await createHousehold('owner');

    const response = await request(`/v1/households/${householdId}/recurring-items/not-a-uuid`, {
      method: 'DELETE',
      token: 'owner',
    });
    expect(response.status).toBe(400);
  });

  it('creates a rule, generates its 12-month PENDING horizon, lists/gets/updates it, and deactivates instead of hard-deleting on delete', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });

    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });
    expect(created.recurringItem.isActive).toBe(true);

    // ADR 0009 point 1: MONTHLY from 2026-07-10 through the 12-month horizon (2027-07-10),
    // both inclusive, is exactly 13 occurrences, all PENDING.
    const occurrences = await pool.query<{ due_date: Date; status: string }>(
      'SELECT due_date, status FROM occurrences WHERE recurring_item_id = $1 ORDER BY due_date',
      [created.recurringItem.id],
    );
    expect(occurrences.rows).toHaveLength(13);
    expect(occurrences.rows.every((row) => row.status === 'PENDING')).toBe(true);

    const listResponse = await request(`/v1/households/${householdId}/recurring-items`, {
      token: 'owner',
    });
    expect(listResponse.status).toBe(200);
    const list = ListRecurringItemsResponseSchema.parse(await listResponse.json());
    expect(list.recurringItems.map((item) => item.id)).toEqual([created.recurringItem.id]);

    const getResponse = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { token: 'owner' },
    );
    expect(getResponse.status).toBe(200);

    const patchResponse = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'PATCH', token: 'owner', body: { name: 'Internet fibra 300MB' } },
    );
    expect(patchResponse.status).toBe(200);
    const updated = UpdateRecurringItemResponseSchema.parse(await patchResponse.json());
    expect(updated.recurringItem.name).toBe('Internet fibra 300MB');

    // DELETE deactivates (is_active = false) rather than hard-deleting: Occurrence.recurringItemId
    // cascades on delete, so a hard delete would silently wipe every occurrence the rule ever
    // generated. A GET afterwards must still find the (now inactive) rule, not 404.
    const deleteResponse = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDelete = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { token: 'owner' },
    );
    expect(afterDelete.status).toBe(200);
    const afterDeleteBody = CreateRecurringItemResponseSchema.parse(await afterDelete.json());
    expect(afterDeleteBody.recurringItem.isActive).toBe(false);

    const occurrencesAfterDelete = await pool.query(
      'SELECT id FROM occurrences WHERE recurring_item_id = $1',
      [created.recurringItem.id],
    );
    expect(occurrencesAfterDelete.rows).toHaveLength(13);
  });

  // The single most important ADR 0009 invariant: editing a rule must never touch an occurrence
  // that has already been SETTLED, no matter how different the new rule values are.
  it('never modifies a SETTLED occurrence when the rule is edited, while still regenerating other future PENDING occurrences', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });

    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-01-10',
      frequency: 'MONTHLY',
      estimatedAmount: '200000',
    });

    // Settle the 2026-09-10 occurrence directly via Prisma/SQL (the settle endpoint is T-506, out
    // of scope) with an amount that differs from the rule's estimate, so any later overwrite is
    // clearly detectable.
    const settledOccurrence = await pool.query<{ id: string }>(
      'SELECT id FROM occurrences WHERE recurring_item_id = $1 AND due_date = $2',
      [created.recurringItem.id, '2026-09-10'],
    );
    const settledId = settledOccurrence.rows[0]?.id;
    expect(settledId).toBeDefined();
    await pool.query(
      `UPDATE occurrences SET status = 'SETTLED', settled_at = now(), amount = '195000.00' WHERE id = $1`,
      [settledId],
    );

    const before = await pool.query<{
      id: string;
      due_date: Date;
      status: string;
      amount: string;
      settled_at: Date | null;
    }>('SELECT id, due_date, status, amount, settled_at FROM occurrences WHERE id = $1', [
      settledId,
    ]);
    const settledBefore = before.rows[0];
    expect(settledBefore?.status).toBe('SETTLED');

    // Edit the rule's estimated amount — this must regenerate future PENDING occurrences with the
    // new amount but must leave the SETTLED occurrence completely untouched.
    const patchResponse = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'PATCH', token: 'owner', body: { estimatedAmount: '250000' } },
    );
    expect(patchResponse.status).toBe(200);

    const after = await pool.query<{
      id: string;
      due_date: Date;
      status: string;
      amount: string;
      settled_at: Date | null;
    }>('SELECT id, due_date, status, amount, settled_at FROM occurrences WHERE id = $1', [
      settledId,
    ]);
    const settledAfter = after.rows[0];
    expect(settledAfter?.status).toBe('SETTLED');
    expect(settledAfter?.amount).toBe(settledBefore?.amount);
    expect(settledAfter?.settled_at?.toISOString()).toBe(settledBefore?.settled_at?.toISOString());
    expect(settledAfter?.due_date.toISOString()).toBe(settledBefore?.due_date.toISOString());

    // Every remaining PENDING occurrence still due today-or-later must have been regenerated with
    // the new amount; past-due PENDING occurrences (before the real "now" the service's clock
    // uses) must be left exactly as they were generated.
    const allOccurrences = await pool.query<{
      due_date: Date;
      status: string;
      amount: string;
    }>('SELECT due_date, status, amount FROM occurrences WHERE recurring_item_id = $1', [
      created.recurringItem.id,
    ]);
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const row of allOccurrences.rows) {
      const dueDateIso = row.due_date.toISOString().slice(0, 10);
      if (row.status === 'SETTLED') {
        expect(Number(row.amount)).toBe(195000);
        continue;
      }
      if (dueDateIso >= todayIso) {
        expect(Number(row.amount)).toBe(250000);
      } else {
        expect(Number(row.amount)).toBe(200000);
      }
    }
  });

  // ADR 0009: re-running generation for the same rule must be idempotent against the unique
  // (recurring_item_id, due_date) constraint — never throw, never duplicate rows.
  it('regenerating occurrences for the same rule twice never duplicates rows or errors', async () => {
    const householdId = await createHousehold('owner');
    const category = await createCategory('owner', householdId, { name: 'Comida' });

    const created = await createRecurringItem('owner', householdId, {
      categoryId: category.category.id,
      firstDueDate: '2026-07-10',
      frequency: 'MONTHLY',
    });

    const countOccurrences = async (): Promise<number> => {
      const result = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM occurrences WHERE recurring_item_id = $1',
        [created.recurringItem.id],
      );
      return Number(result.rows[0]?.count ?? '0');
    };

    expect(await countOccurrences()).toBe(13);

    // Trigger regeneration twice in a row for the exact same effective rule (PATCH is a no-op
    // change but still goes through the full regenerate-future-PENDING path on every edit).
    const firstPatch = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'PATCH', token: 'owner', body: { name: 'Internet' } },
    );
    expect(firstPatch.status).toBe(200);
    expect(await countOccurrences()).toBe(13);

    const secondPatch = await request(
      `/v1/households/${householdId}/recurring-items/${created.recurringItem.id}`,
      { method: 'PATCH', token: 'owner', body: { name: 'Internet' } },
    );
    expect(secondPatch.status).toBe(200);
    expect(await countOccurrences()).toBe(13);

    const dueDates = await pool.query<{ due_date: Date }>(
      'SELECT due_date FROM occurrences WHERE recurring_item_id = $1 ORDER BY due_date',
      [created.recurringItem.id],
    );
    expect(new Set(dueDates.rows.map((row) => row.due_date.toISOString())).size).toBe(13);
  });

  function validRecurringItemBody(overrides: {
    readonly categoryId: string;
    readonly firstDueDate?: string;
    readonly frequency?: 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'EVERY_N_MONTHS';
    readonly estimatedAmount?: string;
  }): Record<string, unknown> {
    return {
      kind: 'EXPENSE',
      name: 'Internet',
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
      body: {
        kind: input.kind ?? 'EXPENSE',
        name: input.name,
        icon: 'wifi',
        color: '#AABBCC',
      },
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
      readonly estimatedAmount?: string;
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
      readonly headers?: Readonly<Record<string, string>>;
    } = {},
  ): Promise<Response> {
    const headers = new Headers();
    if (options.token !== undefined) {
      headers.set('Authorization', `Bearer ${options.token}`);
    }
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      headers.set(name, value);
    }

    return fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }
});
