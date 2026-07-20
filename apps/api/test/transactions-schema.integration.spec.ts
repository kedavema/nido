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

// Direct-SQL verification of `transactions_enforce_category_and_payment_source` (M3 migration),
// mirroring `categories-payment-sources.integration.spec.ts`'s approach for the M2 two-level
// trigger: exercise the real Postgres trigger through raw `pool.query`, independent of the
// application/service pre-checks in `TransactionsService`. Per ADR 0002's "Verificación
// obligatoria", this is the trigger actually firing against a real database, not the manual
// psql sanity check from the M3 schema PR (which was never preserved as a permanent test).
describe.skipIf(!hasTestDatabase)('M3 schema: transactions category/payment-source trigger', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE transactions, categories, payment_sources, household_invites, household_members, households, users CASCADE',
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
    const ownerUserId = await seedUser(
      `firebase-txn-schema-${suffix}`,
      `txn-schema-${suffix}@example.com`,
    );
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
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO categories (household_id, kind, name, icon, color, sort_order, is_active, updated_at)
       VALUES ($1, $2, $3, 'wallet', '#AABBCC', 0, true, now())
       RETURNING id`,
      [options.householdId, options.kind ?? 'EXPENSE', options.name],
    );
    return firstRow(result.rows).id;
  }

  async function insertPaymentSource(options: {
    householdId: string;
    name: string;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO payment_sources (household_id, name, type, updated_at)
       VALUES ($1, $2, 'CASH', now())
       RETURNING id`,
      [options.householdId, options.name],
    );
    return firstRow(result.rows).id;
  }

  async function insertTransaction(options: {
    householdId: string;
    categoryId: string;
    paymentSourceId?: string | null;
    type?: 'EXPENSE' | 'INCOME';
    createdBy: string;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO transactions
         (household_id, type, amount, currency, base_amount_pyg, occurred_at, local_date,
          category_id, payment_source_id, description, created_by, updated_by, updated_at)
       VALUES ($1, $2, '10000', 'PYG', '10000', now(), CURRENT_DATE, $3, $4, 'Test movement', $5, $5, now())
       RETURNING id`,
      [
        options.householdId,
        options.type ?? 'EXPENSE',
        options.categoryId,
        options.paymentSourceId ?? null,
        options.createdBy,
      ],
    );
    return firstRow(result.rows).id;
  }

  it('allows a transaction whose category and payment source belong to the same household', async () => {
    const { householdId, ownerUserId } = await seedHousehold('valid');
    const categoryId = await insertCategory({ householdId, name: 'Comida' });
    const paymentSourceId = await insertPaymentSource({ householdId, name: 'Efectivo' });

    await expect(
      insertTransaction({ householdId, categoryId, paymentSourceId, createdBy: ownerUserId }),
    ).resolves.toBeDefined();
  });

  it('rejects a category that belongs to a different household', async () => {
    const first = await seedHousehold('cat-a');
    const second = await seedHousehold('cat-b');
    const foreignCategoryId = await insertCategory({
      householdId: first.householdId,
      name: 'Comida',
    });

    await expect(
      insertTransaction({
        householdId: second.householdId,
        categoryId: foreignCategoryId,
        createdBy: second.ownerUserId,
      }),
    ).rejects.toThrow(/category must belong to the same household/u);
  });

  it("rejects a category whose kind does not match the transaction's type", async () => {
    const { householdId, ownerUserId } = await seedHousehold('kind-mismatch');
    const incomeCategoryId = await insertCategory({ householdId, name: 'Sueldo', kind: 'INCOME' });

    await expect(
      insertTransaction({
        householdId,
        categoryId: incomeCategoryId,
        type: 'EXPENSE',
        createdBy: ownerUserId,
      }),
    ).rejects.toThrow(/category kind must match the transaction type/u);
  });

  it('rejects a payment source that belongs to a different household', async () => {
    const first = await seedHousehold('ps-a');
    const second = await seedHousehold('ps-b');
    const categoryId = await insertCategory({ householdId: second.householdId, name: 'Comida' });
    const foreignPaymentSourceId = await insertPaymentSource({
      householdId: first.householdId,
      name: 'Efectivo',
    });

    await expect(
      insertTransaction({
        householdId: second.householdId,
        categoryId,
        paymentSourceId: foreignPaymentSourceId,
        createdBy: second.ownerUserId,
      }),
    ).rejects.toThrow(/payment source must belong to the same household/u);
  });

  it('rejects re-homing an existing transaction to a category from a different household (UPDATE)', async () => {
    const first = await seedHousehold('update-cat-a');
    const second = await seedHousehold('update-cat-b');
    const categoryId = await insertCategory({ householdId: first.householdId, name: 'Comida' });
    const foreignCategoryId = await insertCategory({
      householdId: second.householdId,
      name: 'Comida',
    });
    const transactionId = await insertTransaction({
      householdId: first.householdId,
      categoryId,
      createdBy: first.ownerUserId,
    });

    await expect(
      pool.query('UPDATE transactions SET category_id = $1 WHERE id = $2', [
        foreignCategoryId,
        transactionId,
      ]),
    ).rejects.toThrow(/category must belong to the same household/u);
  });

  it('rejects re-homing an existing transaction to a payment source from a different household (UPDATE)', async () => {
    const first = await seedHousehold('update-ps-a');
    const second = await seedHousehold('update-ps-b');
    const categoryId = await insertCategory({ householdId: first.householdId, name: 'Comida' });
    const foreignPaymentSourceId = await insertPaymentSource({
      householdId: second.householdId,
      name: 'Efectivo',
    });
    const transactionId = await insertTransaction({
      householdId: first.householdId,
      categoryId,
      createdBy: first.ownerUserId,
    });

    await expect(
      pool.query('UPDATE transactions SET payment_source_id = $1 WHERE id = $2', [
        foreignPaymentSourceId,
        transactionId,
      ]),
    ).rejects.toThrow(/payment source must belong to the same household/u);
  });

  it('rejects moving a transaction to a different household while its category stays behind (UPDATE household_id)', async () => {
    const first = await seedHousehold('move-a');
    const second = await seedHousehold('move-b');
    const categoryId = await insertCategory({ householdId: first.householdId, name: 'Comida' });
    const transactionId = await insertTransaction({
      householdId: first.householdId,
      categoryId,
      createdBy: first.ownerUserId,
    });

    await expect(
      pool.query('UPDATE transactions SET household_id = $1 WHERE id = $2', [
        second.householdId,
        transactionId,
      ]),
    ).rejects.toThrow(/category must belong to the same household/u);
  });
});
