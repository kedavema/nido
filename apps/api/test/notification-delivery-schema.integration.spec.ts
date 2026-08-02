import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

interface SeededOccurrence {
  householdId: string;
  responsibleUserId: string;
  occurrenceId: string;
}

function firstRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('expected the query to return one row');
  }
  return row;
}

/** SHA-256-sized hex, matching the CHAR(64) credential fingerprint column. */
function fingerprint(seed: string): string {
  return seed.padEnd(64, '0').slice(0, 64);
}

describe.skipIf(!hasTestDatabase)('M7 schema: device installations and deliveries', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE internal_job_nonces, notification_deliveries, device_installations,
       occurrences, recurring_items, categories, household_members, households, users CASCADE`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedUser(suffix: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, email, display_name, timezone, updated_at)
       VALUES ($1, $2, 'Test User', 'America/Asuncion', now())
       RETURNING id`,
      [`firebase-${suffix}`, `${suffix}@example.com`],
    );
    return firstRow(result.rows).id;
  }

  async function seedOccurrence(suffix: string): Promise<SeededOccurrence> {
    const responsibleUserId = await seedUser(suffix);
    const household = await pool.query<{ id: string }>(
      `INSERT INTO households (name, created_by, updated_at)
       VALUES ('Casa', $1, now()) RETURNING id`,
      [responsibleUserId],
    );
    const householdId = firstRow(household.rows).id;

    await pool.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [householdId, responsibleUserId],
    );

    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (household_id, kind, name, icon, color, updated_at)
       VALUES ($1, 'EXPENSE', 'Servicios', 'bolt', '#123456', now()) RETURNING id`,
      [householdId],
    );

    const rule = await pool.query<{ id: string }>(
      `INSERT INTO recurring_items (household_id, kind, name, category_id, responsible_user_id,
                                    estimated_amount, currency, frequency, first_due_date,
                                    notification_offsets, updated_at)
       VALUES ($1, 'EXPENSE', 'Internet', $2, $3, 150000, 'PYG', 'MONTHLY', DATE '2026-08-10',
               ARRAY[7, 3, 1, 0], now())
       RETURNING id`,
      [householdId, firstRow(category.rows).id, responsibleUserId],
    );

    const occurrence = await pool.query<{ id: string }>(
      `INSERT INTO occurrences (recurring_item_id, household_id, due_date, amount, currency,
                                responsible_user_id, updated_at)
       VALUES ($1, $2, DATE '2026-08-10', 150000, 'PYG', $3, now())
       RETURNING id`,
      [firstRow(rule.rows).id, householdId, responsibleUserId],
    );

    return { householdId, responsibleUserId, occurrenceId: firstRow(occurrence.rows).id };
  }

  async function insertInstallation(
    userId: string,
    installationId: string,
    credentialFingerprint: string | null,
    deactivated = false,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO device_installations (user_id, installation_id, platform, channel,
                                         credential_ciphertext, credential_fingerprint,
                                         last_seen_at, deactivated_at, updated_at)
       VALUES ($1, $2, 'ANDROID', 'EXPO', $3, $4, now(), $5, now())`,
      [
        userId,
        installationId,
        deactivated ? null : 'v1.k1.aXY.Y3Q',
        deactivated ? null : credentialFingerprint,
        deactivated ? new Date() : null,
      ],
    );
  }

  async function insertDelivery(occurrence: SeededOccurrence, offsetDays: number): Promise<number> {
    const result = await pool.query(
      `INSERT INTO notification_deliveries (household_id, occurrence_id, user_id, offset_days,
                                            scheduled_for, updated_at)
       VALUES ($1, $2, $3, $4, DATE '2026-08-10' - $4::int, now())
       ON CONFLICT (occurrence_id, offset_days) DO NOTHING`,
      [occurrence.householdId, occurrence.occurrenceId, occurrence.responsibleUserId, offsetDays],
    );
    return result.rowCount ?? 0;
  }

  describe('device_installations', () => {
    it('rejects a second row reusing the same installation id', async () => {
      const first = await seedUser('install-owner');
      const second = await seedUser('install-other');
      await insertInstallation(first, 'installation-a', fingerprint('a'));

      // The unique key is `installation_id` alone, so even a different user cannot hold a second
      // active row for the same physical install — re-registration must overwrite instead.
      await expect(insertInstallation(second, 'installation-a', fingerprint('b'))).rejects.toThrow(
        /device_installations_installation_id_key/u,
      );
    });

    it('rejects two active installs sharing a credential fingerprint', async () => {
      const userId = await seedUser('fingerprint-owner');
      await insertInstallation(userId, 'installation-a', fingerprint('same'));

      // A reinstall can hand the same provider token to a fresh installation id; without the
      // partial unique index that would mean two active rows and duplicate push.
      await expect(
        insertInstallation(userId, 'installation-b', fingerprint('same')),
      ).rejects.toThrow(/device_installations_credential_fingerprint_active_key/u);
    });

    it('allows reusing a fingerprint once the previous install is deactivated', async () => {
      const userId = await seedUser('fingerprint-reuse');
      await insertInstallation(userId, 'installation-a', fingerprint('same'), true);
      await insertInstallation(userId, 'installation-b', fingerprint('same'));

      const active = await pool.query<{ installation_id: string }>(
        `SELECT installation_id FROM device_installations WHERE deactivated_at IS NULL`,
      );
      expect(active.rows.map((row) => row.installation_id)).toEqual(['installation-b']);
    });

    it('rejects an active install without credential material', async () => {
      const userId = await seedUser('credential-check');
      await expect(
        pool.query(
          `INSERT INTO device_installations (user_id, installation_id, platform, channel,
                                             last_seen_at, updated_at)
           VALUES ($1, 'installation-a', 'WEB', 'WEB_PUSH', now(), now())`,
          [userId],
        ),
      ).rejects.toThrow(/device_installations_active_has_credential_check/u);
    });

    it('deletes installs when their user is deleted', async () => {
      const userId = await seedUser('cascade-user');
      await insertInstallation(userId, 'installation-a', fingerprint('a'));

      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      const remaining = await pool.query('SELECT 1 FROM device_installations');
      expect(remaining.rowCount).toBe(0);
    });
  });

  describe('notification_deliveries', () => {
    it('queues one row per occurrence and offset, and ignores a repeated enqueue', async () => {
      const occurrence = await seedOccurrence('enqueue');

      expect(await insertDelivery(occurrence, 7)).toBe(1);
      expect(await insertDelivery(occurrence, 0)).toBe(1);
      // Re-running the sweep — or the cron racing an app open — must not queue the reminder twice.
      expect(await insertDelivery(occurrence, 7)).toBe(0);

      const rows = await pool.query<{ offset_days: number; scheduled_for: Date }>(
        `SELECT offset_days, scheduled_for FROM notification_deliveries ORDER BY offset_days`,
      );
      expect(rows.rowCount).toBe(2);
      expect(rows.rows.map((row) => row.offset_days)).toEqual([0, 7]);
    });

    it('derives scheduled_for as the due date minus the offset', async () => {
      const occurrence = await seedOccurrence('scheduled');
      await insertDelivery(occurrence, 3);

      const row = await pool.query<{ scheduled_for: string }>(
        `SELECT to_char(scheduled_for, 'YYYY-MM-DD') AS scheduled_for FROM notification_deliveries`,
      );
      expect(firstRow(row.rows).scheduled_for).toBe('2026-08-07');
    });

    it('rejects an attempt count beyond the three-attempt ceiling', async () => {
      const occurrence = await seedOccurrence('attempts');
      await insertDelivery(occurrence, 1);

      await expect(pool.query(`UPDATE notification_deliveries SET attempts = 4`)).rejects.toThrow(
        /notification_deliveries_attempts_range_check/u,
      );
    });

    it('rejects a negative offset', async () => {
      const occurrence = await seedOccurrence('offset');
      await expect(insertDelivery(occurrence, -1)).rejects.toThrow(
        /notification_deliveries_offset_days_range_check/u,
      );
    });

    it('rejects SENT without a send timestamp and SENDING without a claim', async () => {
      const occurrence = await seedOccurrence('states');
      await insertDelivery(occurrence, 1);

      await expect(
        pool.query(`UPDATE notification_deliveries SET status = 'SENT'`),
      ).rejects.toThrow(/notification_deliveries_sent_at_status_check/u);
      await expect(
        pool.query(`UPDATE notification_deliveries SET status = 'SENDING'`),
      ).rejects.toThrow(/notification_deliveries_sending_is_claimed_check/u);
    });

    it('allows the claim then send transition', async () => {
      const occurrence = await seedOccurrence('transition');
      await insertDelivery(occurrence, 1);

      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'SENDING', claimed_at = now(), attempts = attempts + 1`,
      );
      await pool.query(
        `UPDATE notification_deliveries SET status = 'SENT', sent_at = now()
         WHERE status = 'SENDING'`,
      );

      const row = await pool.query<{ status: string; attempts: number }>(
        `SELECT status, attempts FROM notification_deliveries`,
      );
      expect(firstRow(row.rows)).toMatchObject({ status: 'SENT', attempts: 1 });
    });

    it('deletes queued deliveries when the occurrence is deleted', async () => {
      const occurrence = await seedOccurrence('cascade-occurrence');
      await insertDelivery(occurrence, 1);

      await pool.query('DELETE FROM occurrences WHERE id = $1', [occurrence.occurrenceId]);

      const remaining = await pool.query('SELECT 1 FROM notification_deliveries');
      expect(remaining.rowCount).toBe(0);
    });

    it('deletes queued deliveries when the household is deleted', async () => {
      const occurrence = await seedOccurrence('cascade-household');
      await insertDelivery(occurrence, 1);

      await pool.query('DELETE FROM households WHERE id = $1', [occurrence.householdId]);

      const remaining = await pool.query('SELECT 1 FROM notification_deliveries');
      expect(remaining.rowCount).toBe(0);
    });
  });

  describe('internal_job_nonces', () => {
    it('rejects a replayed nonce', async () => {
      await pool.query(`INSERT INTO internal_job_nonces (nonce) VALUES ('nonce-1')`);

      // The duplicate insert IS the replay detection — there is no separate lookup to race with.
      await expect(
        pool.query(`INSERT INTO internal_job_nonces (nonce) VALUES ('nonce-1')`),
      ).rejects.toThrow(/internal_job_nonces_pkey/u);
    });

    it('lets a pruned nonce be accepted again', async () => {
      await pool.query(
        `INSERT INTO internal_job_nonces (nonce, created_at) VALUES ('nonce-1', now() - interval '1 hour')`,
      );
      await pool.query(
        `DELETE FROM internal_job_nonces WHERE created_at < now() - interval '10 minutes'`,
      );

      await pool.query(`INSERT INTO internal_job_nonces (nonce) VALUES ('nonce-1')`);
      const rows = await pool.query('SELECT 1 FROM internal_job_nonces');
      expect(rows.rowCount).toBe(1);
    });
  });
});
