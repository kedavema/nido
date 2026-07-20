import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateCategoryResponseSchema,
  CreateHouseholdResponseSchema,
  ListCategoriesResponseSchema,
  UpdateCategoryResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CATEGORIES_REPOSITORY,
  CategoryHierarchyViolationError,
  CategorySiblingNameConflictError,
  type CategoriesRepository,
} from '../src/categories/categories.repository.js';
import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const identities = {
  owner: {
    firebaseUid: 'firebase-cat-owner',
    email: 'cat-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  member: {
    firebaseUid: 'firebase-cat-member',
    email: 'cat-member@example.com',
    displayName: 'Member',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-cat-outsider',
    email: 'cat-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

describe.skipIf(!hasTestDatabase)('Categories API with PostgreSQL', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let pool: Pool;
  let categoriesRepository: CategoriesRepository;

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

    categoriesRepository = moduleRef.get<CategoriesRepository>(CATEGORIES_REPOSITORY);
    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { configureApplication } = await import('../src/configure-application.js');
    configureApplication(app, { corsOrigins: ['http://localhost:8081'] });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE categories, payment_sources, household_invites, household_members, households, users CASCADE',
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

  it('requires authentication on every category route', async () => {
    const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
    expect((await request(`/v1/households/${householdId}/categories`)).status).toBe(401);
    expect(
      (await request(`/v1/households/${householdId}/categories`, { method: 'POST', body: {} }))
        .status,
    ).toBe(401);
  });

  it('conceals the household from non-members with 404', async () => {
    const householdId = await createHousehold('owner');

    expect(
      (await request(`/v1/households/${householdId}/categories`, { token: 'outsider' })).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/households/${householdId}/categories`, {
          method: 'POST',
          token: 'outsider',
          body: { kind: 'EXPENSE', name: 'Food', icon: 'cart', color: '#AABBCC' },
        })
      ).status,
    ).toBe(404);
  });

  it('creates root and child categories and lists them, archived included', async () => {
    const householdId = await createHousehold('owner');

    const root = await createCategory('owner', householdId, { name: 'Test Food' });
    const child = await createCategory('owner', householdId, {
      name: 'Supermarket',
      parentId: root.category.id,
    });
    expect(child.category.parentId).toBe(root.category.id);

    const patchResponse = await request(
      `/v1/households/${householdId}/categories/${child.category.id}`,
      { method: 'PATCH', token: 'owner', body: { isActive: false } },
    );
    expect(patchResponse.status).toBe(200);

    const listResponse = await request(`/v1/households/${householdId}/categories`, {
      token: 'owner',
    });
    expect(listResponse.status).toBe(200);
    const list = ListCategoriesResponseSchema.parse(await listResponse.json());
    // The household also carries the atomically seeded default categories
    // (ADR 0006); scope the assertion to the two categories this test made.
    const created = list.categories.filter((category) =>
      [root.category.id, child.category.id].includes(category.id),
    );
    expect(created).toHaveLength(2);
    expect(created.map((category) => category.isActive).sort()).toEqual([false, true]);
  });

  it('lets an active MEMBER manage categories too', async () => {
    const householdId = await createHousehold('owner');
    await addActiveMember(householdId, identities.member);

    const created = await createCategory('member', householdId, { name: 'Test Transport' });
    const patchResponse = await request(
      `/v1/households/${householdId}/categories/${created.category.id}`,
      { method: 'PATCH', token: 'member', body: { name: 'Mobility' } },
    );
    expect(patchResponse.status).toBe(200);
    const updated = UpdateCategoryResponseSchema.parse(await patchResponse.json());
    expect(updated.category.name).toBe('Mobility');
  });

  it('rejects duplicate active sibling names with 409 and allows reusing archived names', async () => {
    const householdId = await createHousehold('owner');
    const first = await createCategory('owner', householdId, { name: 'Test Food' });

    const duplicateResponse = await request(`/v1/households/${householdId}/categories`, {
      method: 'POST',
      token: 'owner',
      body: { kind: 'EXPENSE', name: 'Test Food', icon: 'cart', color: '#AABBCC' },
    });
    expect(duplicateResponse.status).toBe(409);

    await request(`/v1/households/${householdId}/categories/${first.category.id}`, {
      method: 'PATCH',
      token: 'owner',
      body: { isActive: false },
    });
    const reuseResponse = await request(`/v1/households/${householdId}/categories`, {
      method: 'POST',
      token: 'owner',
      body: { kind: 'EXPENSE', name: 'Test Food', icon: 'cart', color: '#AABBCC' },
    });
    expect(reuseResponse.status).toBe(201);
  });

  it('rejects invalid parents with 400: third level, wrong kind, other household', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const root = await createCategory('owner', householdId, { name: 'Test Food' });
    const child = await createCategory('owner', householdId, {
      name: 'Supermarket',
      parentId: root.category.id,
    });
    const income = await createCategory('owner', householdId, {
      name: 'Test Salary',
      kind: 'INCOME',
    });
    const foreignRoot = await createCategory('outsider', otherHouseholdId, { name: 'Test Food' });

    for (const parentId of [child.category.id, income.category.id, foreignRoot.category.id]) {
      const response = await request(`/v1/households/${householdId}/categories`, {
        method: 'POST',
        token: 'owner',
        body: { kind: 'EXPENSE', name: 'Fruits', icon: 'apple', color: '#AABBCC', parentId },
      });
      expect(response.status).toBe(400);
    }
  });

  it('rejects reparenting a category that has subcategories with 400', async () => {
    const householdId = await createHousehold('owner');
    const root = await createCategory('owner', householdId, { name: 'Test Food' });
    await createCategory('owner', householdId, {
      name: 'Supermarket',
      parentId: root.category.id,
    });
    const otherRoot = await createCategory('owner', householdId, { name: 'Test Transport' });

    const response = await request(`/v1/households/${householdId}/categories/${root.category.id}`, {
      method: 'PATCH',
      token: 'owner',
      body: { parentId: otherRoot.category.id },
    });
    expect(response.status).toBe(400);
  });

  it('conceals categories of other households from members with 404', async () => {
    const householdId = await createHousehold('owner');
    const otherHouseholdId = await createHousehold('outsider');
    const foreign = await createCategory('outsider', otherHouseholdId, { name: 'Test Food' });

    const patchResponse = await request(
      `/v1/households/${householdId}/categories/${foreign.category.id}`,
      { method: 'PATCH', token: 'owner', body: { name: 'Stolen' } },
    );
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await request(
      `/v1/households/${householdId}/categories/${foreign.category.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(404);
  });

  it('archives on DELETE when references exist and hard-deletes otherwise', async () => {
    const householdId = await createHousehold('owner');
    const root = await createCategory('owner', householdId, { name: 'Test Food' });
    const child = await createCategory('owner', householdId, {
      name: 'Supermarket',
      parentId: root.category.id,
    });

    const archiveResponse = await request(
      `/v1/households/${householdId}/categories/${root.category.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(archiveResponse.status).toBe(204);

    const deleteResponse = await request(
      `/v1/households/${householdId}/categories/${child.category.id}`,
      { method: 'DELETE', token: 'owner' },
    );
    expect(deleteResponse.status).toBe(204);

    // The household also carries the atomically seeded default categories
    // (ADR 0006); scope the query to the two rows this test made.
    const stored = await pool.query<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM categories WHERE household_id = $1 AND id = ANY($2)',
      [householdId, [root.category.id, child.category.id]],
    );
    expect(stored.rows).toEqual([{ id: root.category.id, is_active: false }]);
  });

  it('translates database races that bypass the service pre-checks into domain errors', async () => {
    const householdId = await createHousehold('owner');
    const root = await createCategory('owner', householdId, { name: 'Test Food' });
    const child = await createCategory('owner', householdId, {
      name: 'Supermarket',
      parentId: root.category.id,
    });

    // Duplicate active sibling name straight at the persistence layer: the
    // partial unique index must surface as the sibling-name domain error.
    await expect(
      categoriesRepository.create({
        householdId,
        kind: 'EXPENSE',
        parentId: null,
        name: 'Test Food',
        icon: 'wallet',
        color: '#AABBCC',
        sortOrder: undefined,
      }),
    ).rejects.toBeInstanceOf(CategorySiblingNameConflictError);

    // Third level straight at the persistence layer: the two-level trigger
    // must surface as the hierarchy domain error.
    await expect(
      categoriesRepository.create({
        householdId,
        kind: 'EXPENSE',
        parentId: child.category.id,
        name: 'Fruits',
        icon: 'apple',
        color: '#AABBCC',
        sortOrder: undefined,
      }),
    ).rejects.toBeInstanceOf(CategoryHierarchyViolationError);
  });

  it('rejects a malformed category id with 400', async () => {
    const householdId = await createHousehold('owner');

    const response = await request(`/v1/households/${householdId}/categories/not-a-uuid`, {
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

  async function createCategory(
    token: keyof typeof identities,
    householdId: string,
    input: {
      readonly name: string;
      readonly kind?: 'EXPENSE' | 'INCOME';
      readonly parentId?: string;
    },
  ) {
    const response = await request(`/v1/households/${householdId}/categories`, {
      method: 'POST',
      token,
      body: {
        kind: input.kind ?? 'EXPENSE',
        name: input.name,
        icon: 'wallet',
        color: '#AABBCC',
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      },
    });
    expect(response.status).toBe(201);
    return CreateCategoryResponseSchema.parse(await response.json());
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
