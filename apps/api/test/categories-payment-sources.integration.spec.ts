import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

interface SeededHousehold {
  householdId: string;
  ownerUserId: string;
}

function firstRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('expected the query to return one row');
  }
  return row;
}

describe.skipIf(!hasTestDatabase)('M2 schema: categories and payment sources', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE categories, payment_sources, household_invites, household_members, households, users CASCADE',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedUser(firebaseUid: string, email: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, email, display_name, timezone, updated_at)
       VALUES ($1, $2, 'Test User', 'America/Asuncion', now())
       RETURNING id`,
      [firebaseUid, email],
    );
    return firstRow(result.rows).id;
  }

  async function seedHousehold(suffix: string): Promise<SeededHousehold> {
    const ownerUserId = await seedUser(`firebase-${suffix}`, `${suffix}@example.com`);
    const household = await pool.query<{ id: string }>(
      `INSERT INTO households (name, created_by, updated_at)
       VALUES ($1, $2, now())
       RETURNING id`,
      [`Casa ${suffix}`, ownerUserId],
    );
    return { householdId: firstRow(household.rows).id, ownerUserId };
  }

  async function insertCategory(options: {
    householdId: string;
    name: string;
    kind?: 'EXPENSE' | 'INCOME';
    parentId?: string | null;
    isActive?: boolean;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO categories (household_id, kind, parent_id, name, icon, color, sort_order, is_active, updated_at)
       VALUES ($1, $2, $3, $4, 'wallet', '#AABBCC', 0, $5, now())
       RETURNING id`,
      [
        options.householdId,
        options.kind ?? 'EXPENSE',
        options.parentId ?? null,
        options.name,
        options.isActive ?? true,
      ],
    );
    return firstRow(result.rows).id;
  }

  describe('categories', () => {
    it('creates a root category and a child category', async () => {
      const { householdId } = await seedHousehold('roots');

      const rootId = await insertCategory({ householdId, name: 'Hogar' });
      const childId = await insertCategory({ householdId, name: 'Supermercado', parentId: rootId });

      const stored = await pool.query<{ id: string; parent_id: string | null }>(
        'SELECT id, parent_id FROM categories WHERE household_id = $1 ORDER BY created_at',
        [householdId],
      );
      expect(stored.rows).toEqual([
        { id: rootId, parent_id: null },
        { id: childId, parent_id: rootId },
      ]);
    });

    it('rejects a third level: a child category cannot become a parent', async () => {
      const { householdId } = await seedHousehold('levels');

      const rootId = await insertCategory({ householdId, name: 'Hogar' });
      const childId = await insertCategory({ householdId, name: 'Supermercado', parentId: rootId });

      await expect(
        insertCategory({ householdId, name: 'Verduleria', parentId: childId }),
      ).rejects.toThrow(/two levels/u);
    });

    it('rejects giving a parent to a category that already has children', async () => {
      const { householdId } = await seedHousehold('reparent');

      const rootId = await insertCategory({ householdId, name: 'Hogar' });
      await insertCategory({ householdId, name: 'Supermercado', parentId: rootId });
      const otherRootId = await insertCategory({ householdId, name: 'Transporte' });

      await expect(
        pool.query('UPDATE categories SET parent_id = $1 WHERE id = $2', [otherRootId, rootId]),
      ).rejects.toThrow(/two levels/u);
    });

    it('rejects a duplicate active sibling name at the root level (NULL parent)', async () => {
      const { householdId } = await seedHousehold('root-dup');

      await insertCategory({ householdId, name: 'Hogar' });

      await expect(insertCategory({ householdId, name: 'Hogar' })).rejects.toThrow(
        /categories_active_sibling_name_key/u,
      );
    });

    it('rejects a duplicate active sibling name under the same parent', async () => {
      const { householdId } = await seedHousehold('child-dup');

      const rootId = await insertCategory({ householdId, name: 'Hogar' });
      await insertCategory({ householdId, name: 'Supermercado', parentId: rootId });

      await expect(
        insertCategory({ householdId, name: 'Supermercado', parentId: rootId }),
      ).rejects.toThrow(/categories_active_sibling_name_key/u);
    });

    it('allows reusing the name of an archived sibling', async () => {
      const { householdId } = await seedHousehold('archived');

      await insertCategory({ householdId, name: 'Hogar', isActive: false });

      await expect(insertCategory({ householdId, name: 'Hogar' })).resolves.toBeDefined();
    });

    it('allows the same name for siblings of a different kind', async () => {
      const { householdId } = await seedHousehold('kinds');

      await insertCategory({ householdId, name: 'Otros', kind: 'EXPENSE' });

      await expect(
        insertCategory({ householdId, name: 'Otros', kind: 'INCOME' }),
      ).resolves.toBeDefined();
    });

    it('rejects a parent that belongs to a different household', async () => {
      const first = await seedHousehold('tenant-a');
      const second = await seedHousehold('tenant-b');

      const foreignRootId = await insertCategory({
        householdId: first.householdId,
        name: 'Hogar',
      });

      await expect(
        insertCategory({
          householdId: second.householdId,
          name: 'Supermercado',
          parentId: foreignRootId,
        }),
      ).rejects.toThrow(/same household/u);
    });

    it('rejects a parent of a different kind', async () => {
      const { householdId } = await seedHousehold('cross-kind');

      const rootId = await insertCategory({ householdId, name: 'Sueldo', kind: 'INCOME' });

      await expect(
        insertCategory({ householdId, name: 'Extra', kind: 'EXPENSE', parentId: rootId }),
      ).rejects.toThrow(/same kind/u);
    });

    it('rejects changing the kind of a root category that has children', async () => {
      const { householdId } = await seedHousehold('root-kind-change');

      const rootId = await insertCategory({ householdId, name: 'Hogar', kind: 'EXPENSE' });
      await insertCategory({ householdId, name: 'Supermercado', parentId: rootId });

      await expect(
        pool.query('UPDATE categories SET kind = $1 WHERE id = $2', ['INCOME', rootId]),
      ).rejects.toThrow(/while it has children/u);
    });

    it('rejects moving a root category with children to another household', async () => {
      const first = await seedHousehold('root-move-a');
      const second = await seedHousehold('root-move-b');

      const rootId = await insertCategory({ householdId: first.householdId, name: 'Hogar' });
      await insertCategory({
        householdId: first.householdId,
        name: 'Supermercado',
        parentId: rootId,
      });

      await expect(
        pool.query('UPDATE categories SET household_id = $1 WHERE id = $2', [
          second.householdId,
          rootId,
        ]),
      ).rejects.toThrow(/while it has children/u);
    });

    it('allows changing the kind of a root category without children', async () => {
      const { householdId } = await seedHousehold('root-kind-free');

      const rootId = await insertCategory({ householdId, name: 'Varios', kind: 'EXPENSE' });

      await expect(
        pool.query('UPDATE categories SET kind = $1 WHERE id = $2', ['INCOME', rootId]),
      ).resolves.toBeDefined();
    });
  });

  describe('payment sources', () => {
    it('creates a payment source with an informational owner', async () => {
      const { householdId, ownerUserId } = await seedHousehold('with-owner');

      const result = await pool.query<{ id: string; type: string; is_active: boolean }>(
        `INSERT INTO payment_sources (household_id, name, type, owner_user_id, updated_at)
         VALUES ($1, 'Cuenta Itau', 'BANK_ACCOUNT', $2, now())
         RETURNING id, type::text, is_active`,
        [householdId, ownerUserId],
      );

      expect(result.rows[0]).toEqual(
        expect.objectContaining({ type: 'BANK_ACCOUNT', is_active: true }),
      );
    });

    it('creates a payment source without an owner', async () => {
      const { householdId } = await seedHousehold('no-owner');

      const result = await pool.query<{ owner_user_id: string | null }>(
        `INSERT INTO payment_sources (household_id, name, type, updated_at)
         VALUES ($1, 'Efectivo', 'CASH', now())
         RETURNING owner_user_id`,
        [householdId],
      );

      expect(result.rows[0]).toEqual({ owner_user_id: null });
    });

    it('keeps the payment source and clears the owner when the owner user is deleted', async () => {
      const { householdId } = await seedHousehold('owner-cleanup');
      const memberUserId = await seedUser('firebase-owner-cleanup-member', 'cleanup@example.com');

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO payment_sources (household_id, name, type, owner_user_id, updated_at)
         VALUES ($1, 'Billetera Personal', 'DIGITAL_WALLET', $2, now())
         RETURNING id`,
        [householdId, memberUserId],
      );
      await pool.query('DELETE FROM users WHERE id = $1', [memberUserId]);

      const stored = await pool.query<{ owner_user_id: string | null }>(
        'SELECT owner_user_id FROM payment_sources WHERE id = $1',
        [firstRow(inserted.rows).id],
      );
      expect(stored.rows).toEqual([{ owner_user_id: null }]);
    });
  });
});
