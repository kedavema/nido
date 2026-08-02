import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaOccurrenceSweepRepository } from '../src/occurrences/prisma-occurrence-sweep.repository.js';
import { PrismaOccurrenceSettlementRepository } from '../src/occurrences/prisma-occurrence-settlement.repository.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Environment } from '../src/config/environment.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

/** Noon UTC on the day the fixtures are built around; 08:00 in America/Asuncion. */
const now = new Date('2026-08-10T15:00:00.000Z');
const today = '2026-08-10';

interface Fixture {
  householdId: string;
  userId: string;
  ruleId: string;
}

function firstRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('expected the query to return one row');
  }
  return row;
}

describe.skipIf(!hasTestDatabase)('M7 delivery enqueue and cancellation', () => {
  let pool: Pool;
  let prisma: PrismaService;
  let sweep: PrismaOccurrenceSweepRepository;
  let settlement: PrismaOccurrenceSettlementRepository;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    // The repositories are exercised directly rather than through HTTP: this slice has no
    // endpoint of its own yet, and the behaviour under test is the transaction boundary.
    prisma = new PrismaService({
      get: () => testDatabaseUrl ?? '',
    } as unknown as ConfigService<Environment, true>);
    sweep = new PrismaOccurrenceSweepRepository(prisma);
    settlement = new PrismaOccurrenceSettlementRepository(prisma);
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE notification_deliveries, transactions, occurrences, recurring_items,
       categories, payment_sources, household_members, households, users CASCADE`,
    );
  });

  afterAll(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  async function seed(
    options: {
      readonly kind?: 'EXPENSE' | 'INCOME';
      readonly offsets?: readonly number[];
      readonly withResponsible?: boolean;
      readonly isActive?: boolean;
    } = {},
  ): Promise<Fixture> {
    const {
      kind = 'EXPENSE',
      offsets = [7, 3, 1, 0],
      withResponsible = true,
      isActive = true,
    } = options;

    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, email, display_name, timezone, updated_at)
       VALUES ('firebase-enqueue', 'enqueue@example.com', 'Owner', 'America/Asuncion', now())
       RETURNING id`,
    );
    const userId = firstRow(user.rows).id;

    const household = await pool.query<{ id: string }>(
      `INSERT INTO households (name, created_by, timezone, updated_at)
       VALUES ('Casa', $1, 'America/Asuncion', now()) RETURNING id`,
      [userId],
    );
    const householdId = firstRow(household.rows).id;
    await pool.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [householdId, userId],
    );

    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (household_id, kind, name, icon, color, updated_at)
       VALUES ($1, $2, 'Servicios', 'bolt', '#123456', now()) RETURNING id`,
      [householdId, kind === 'EXPENSE' ? 'EXPENSE' : 'INCOME'],
    );

    // ONE_TIME and dated well before the window under test, so the sweep's own generation step
    // produces exactly one occurrence whose offsets land in January and never pollutes the
    // assertions about the occurrences each test adds explicitly.
    const rule = await pool.query<{ id: string }>(
      `INSERT INTO recurring_items (household_id, kind, name, category_id, responsible_user_id,
                                    estimated_amount, currency, frequency, first_due_date,
                                    notification_offsets, is_active, updated_at)
       VALUES ($1, $2, 'Internet', $3, $4, 150000, 'PYG', 'ONE_TIME', DATE '2026-01-15', $5,
               $6, now())
       RETURNING id`,
      [
        householdId,
        kind,
        firstRow(category.rows).id,
        withResponsible ? userId : null,
        offsets,
        isActive,
      ],
    );

    return { householdId, userId, ruleId: firstRow(rule.rows).id };
  }

  async function addOccurrence(
    fixture: Fixture,
    dueDate: string,
    status: 'PENDING' | 'OVERDUE' | 'SETTLED' = 'PENDING',
    withResponsible = true,
  ): Promise<string> {
    const occurrence = await pool.query<{ id: string }>(
      `INSERT INTO occurrences (recurring_item_id, household_id, due_date, amount, currency,
                                responsible_user_id, status, updated_at)
       VALUES ($1, $2, $3::date, 150000, 'PYG', $4, $5::occurrence_status, now())
       RETURNING id`,
      [
        fixture.ruleId,
        fixture.householdId,
        dueDate,
        withResponsible ? fixture.userId : null,
        status,
      ],
    );
    return firstRow(occurrence.rows).id;
  }

  async function queuedOffsets(): Promise<readonly number[]> {
    const rows = await pool.query<{ offset_days: number }>(
      'SELECT offset_days FROM notification_deliveries ORDER BY offset_days',
    );
    return rows.rows.map((row) => row.offset_days);
  }

  /** Clears the daily marker so a second sweep in the same test actually runs. */
  async function resetMarker(householdId: string): Promise<void> {
    await pool.query('UPDATE households SET last_swept_on = NULL WHERE id = $1', [householdId]);
  }

  it('queues only the offsets whose scheduled day is today or yesterday', async () => {
    const fixture = await seed({ offsets: [7, 3, 1, 0] });
    // due 2026-08-11 → offset 1 lands today, offset 0 lands tomorrow, 3 and 7 are already past.
    await addOccurrence(fixture, '2026-08-11');

    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([1]);
  });

  it('absorbs one missed day without firing months of history', async () => {
    const fixture = await seed({ offsets: [0] });
    await addOccurrence(fixture, '2026-08-09', 'OVERDUE'); // yesterday — inside the grace window
    await addOccurrence(fixture, '2026-05-01', 'OVERDUE'); // months ago — must stay silent

    await sweep.sweep(fixture.householdId, now);

    const rows = await pool.query<{ scheduled_for: string }>(
      `SELECT to_char(scheduled_for, 'YYYY-MM-DD') AS scheduled_for FROM notification_deliveries`,
    );
    expect(rows.rows.map((row) => row.scheduled_for)).toEqual(['2026-08-09']);
  });

  it('queues nothing for an income rule', async () => {
    const fixture = await seed({ kind: 'INCOME', offsets: [0] });
    await addOccurrence(fixture, today);

    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([]);
  });

  it('queues nothing when the occurrence has no responsible user', async () => {
    const fixture = await seed({ offsets: [0], withResponsible: false });
    await addOccurrence(fixture, today, 'PENDING', false);

    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([]);
  });

  it('queues nothing for a rule with no configured offsets', async () => {
    const fixture = await seed({ offsets: [] });
    await addOccurrence(fixture, today);

    // Nothing is ever back-filled with the 7/3/1/0 defaults — those belong to the form.
    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([]);
  });

  it('queues nothing for an occurrence that is already settled or skipped', async () => {
    const fixture = await seed({ offsets: [0] });
    await addOccurrence(fixture, today, 'SETTLED');

    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([]);
  });

  it('is idempotent across repeated sweeps', async () => {
    const fixture = await seed({ offsets: [0] });
    await addOccurrence(fixture, today);

    await sweep.sweep(fixture.householdId, now);
    await resetMarker(fixture.householdId);
    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([0]);
  });

  it('does not duplicate rows when two sweeps run concurrently', async () => {
    const fixture = await seed({ offsets: [7, 3, 1, 0] });
    await addOccurrence(fixture, today);

    // The advisory lock serializes them and the daily marker makes the loser a no-op; the unique
    // index is the backstop if either ever fails. Offset 0 lands today and offset 1 landed
    // yesterday (inside the grace window), so two rows are expected — each exactly once.
    await Promise.all([
      sweep.sweep(fixture.householdId, now),
      sweep.sweep(fixture.householdId, now),
    ]);

    expect(await queuedOffsets()).toEqual([0, 1]);
  });

  it('still queues an occurrence whose rule was deactivated afterwards', async () => {
    const fixture = await seed({ offsets: [0], isActive: false });
    await addOccurrence(fixture, today);

    // Deactivating a rule stops future generation (ADR 0009) but does not erase obligations that
    // already exist, so those still deserve their reminder.
    await sweep.sweep(fixture.householdId, now);

    expect(await queuedOffsets()).toEqual([0]);
  });

  it('cancels retryable reminders in the same transaction that settles the occurrence', async () => {
    const fixture = await seed({ offsets: [0] });
    const occurrenceId = await addOccurrence(fixture, today);
    await sweep.sweep(fixture.householdId, now);
    await pool.query(
      `UPDATE notification_deliveries SET status = 'SENDING', claimed_at = now(), attempts = 1`,
    );

    const result = await settlement.settle({
      householdId: fixture.householdId,
      occurrenceId,
      actorId: fixture.userId,
    });
    expect(result.kind).toBe('settled');

    const rows = await pool.query<{ status: string }>('SELECT status FROM notification_deliveries');
    expect(rows.rows.map((row) => row.status)).toEqual(['CANCELLED']);
  });

  it('cancels retryable reminders when the occurrence is skipped', async () => {
    const fixture = await seed({ offsets: [0] });
    const occurrenceId = await addOccurrence(fixture, today);
    await sweep.sweep(fixture.householdId, now);

    await settlement.skip({ householdId: fixture.householdId, occurrenceId });

    const rows = await pool.query<{ status: string }>('SELECT status FROM notification_deliveries');
    expect(rows.rows.map((row) => row.status)).toEqual(['CANCELLED']);
  });

  it('leaves already sent and failed reminders alone, because they are history', async () => {
    const fixture = await seed({ offsets: [7, 3] });
    await addOccurrence(fixture, '2026-08-13'); // offset 3 lands today
    const occurrenceId = await addOccurrence(fixture, '2026-08-17'); // offset 7 lands today
    await sweep.sweep(fixture.householdId, now);
    await pool.query(
      `UPDATE notification_deliveries SET status = 'SENT', sent_at = now(), attempts = 1
       WHERE occurrence_id = $1`,
      [occurrenceId],
    );

    await settlement.skip({ householdId: fixture.householdId, occurrenceId });

    const rows = await pool.query<{ status: string }>(
      'SELECT status FROM notification_deliveries WHERE occurrence_id = $1',
      [occurrenceId],
    );
    expect(rows.rows.map((row) => row.status)).toEqual(['SENT']);
  });
});
