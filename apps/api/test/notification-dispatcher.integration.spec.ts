import { randomBytes, randomUUID } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import type { NotificationChannel } from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Environment } from '../src/config/environment.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  AesGcmCredentialCipher,
  credentialAad,
  type CredentialCipher,
} from '../src/notifications/credential-cipher.js';
import { NotificationDispatcherService } from '../src/notifications/notification-dispatcher.service.js';
import { PrismaNotificationDeliveriesRepository } from '../src/notifications/prisma-notification-deliveries.repository.js';
import type {
  PushMessage,
  PushSender,
  PushSendResult,
  PushTarget,
} from '../src/notifications/push-sender.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const now = new Date('2026-08-10T15:00:00.000Z');
const today = '2026-08-10';

const cipher: CredentialCipher = new AesGcmCredentialCipher({
  keys: new Map([['k1', randomBytes(32)]]),
  activeKeyId: 'k1',
  pepper: randomBytes(32),
});

/**
 * Stands in for a real provider adapter so the dispatch policy can be tested without a network.
 * The real Expo and Web Push adapters land in their own slices behind the same port.
 */
class FakePushSender implements PushSender {
  public readonly received: { target: PushTarget; message: PushMessage }[] = [];

  constructor(
    public readonly channel: NotificationChannel,
    private readonly resultsByDevice: ReadonlyMap<string, PushSendResult> = new Map(),
    private readonly fallback: PushSendResult = { kind: 'sent' },
  ) {}

  send(target: PushTarget, message: PushMessage): Promise<PushSendResult> {
    this.received.push({ target, message });
    return Promise.resolve(this.resultsByDevice.get(target.deviceId) ?? this.fallback);
  }
}

function firstRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('expected the query to return one row');
  }
  return row;
}

describe.skipIf(!hasTestDatabase)('M7 delivery dispatcher', () => {
  let pool: Pool;
  let prisma: PrismaService;
  let repository: PrismaNotificationDeliveriesRepository;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    prisma = new PrismaService({
      get: () => testDatabaseUrl ?? '',
    } as unknown as ConfigService<Environment, true>);
    repository = new PrismaNotificationDeliveriesRepository(prisma);
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE notification_deliveries, device_installations, occurrences, recurring_items,
       categories, household_members, households, users CASCADE`,
    );
  });

  afterAll(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  function dispatcher(senders: readonly PushSender[], withCipher = true) {
    return new NotificationDispatcherService(repository, senders, withCipher ? cipher : null, {
      now: () => now,
    });
  }

  async function seedDelivery(offsetDays = 0): Promise<{ userId: string; deliveryId: string }> {
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, email, display_name, timezone, updated_at)
       VALUES ($1, $2, 'Owner', 'America/Asuncion', now()) RETURNING id`,
      [`firebase-${randomUUID()}`, `${randomUUID()}@example.com`],
    );
    const userId = firstRow(user.rows).id;

    const household = await pool.query<{ id: string }>(
      `INSERT INTO households (name, created_by, updated_at) VALUES ('Casa', $1, now()) RETURNING id`,
      [userId],
    );
    const householdId = firstRow(household.rows).id;
    await pool.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [householdId, userId],
    );

    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (household_id, kind, name, icon, color, updated_at)
       VALUES ($1, 'EXPENSE', 'Servicios', 'bolt', '#123456', now()) RETURNING id`,
      [householdId],
    );
    const rule = await pool.query<{ id: string }>(
      `INSERT INTO recurring_items (household_id, kind, name, category_id, responsible_user_id,
                                    estimated_amount, currency, frequency, first_due_date, updated_at)
       VALUES ($1, 'EXPENSE', 'Internet', $2, $3, 150000, 'PYG', 'ONE_TIME', DATE '2026-01-15', now())
       RETURNING id`,
      [householdId, firstRow(category.rows).id, userId],
    );
    const occurrence = await pool.query<{ id: string }>(
      `INSERT INTO occurrences (recurring_item_id, household_id, due_date, amount, currency,
                                responsible_user_id, updated_at)
       VALUES ($1, $2, DATE '2026-08-10', 150000, 'PYG', $3, now()) RETURNING id`,
      [firstRow(rule.rows).id, householdId, userId],
    );

    const delivery = await pool.query<{ id: string }>(
      `INSERT INTO notification_deliveries (household_id, occurrence_id, user_id, offset_days,
                                            scheduled_for, updated_at)
       VALUES ($1, $2, $3, $4, DATE '${today}', now()) RETURNING id`,
      [householdId, firstRow(occurrence.rows).id, userId, offsetDays],
    );

    return { userId, deliveryId: firstRow(delivery.rows).id };
  }

  async function addInstallation(
    userId: string,
    channel: NotificationChannel = 'EXPO',
    ciphertext?: string,
  ): Promise<string> {
    const installationId = randomUUID();
    const plaintext =
      channel === 'EXPO'
        ? 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
        : JSON.stringify({ endpoint: 'https://push.example/x', p256dh: 'BLc4', auth: 'tBHI' });
    const row = await pool.query<{ id: string }>(
      `INSERT INTO device_installations (user_id, installation_id, platform, channel,
                                         credential_ciphertext, credential_fingerprint,
                                         last_seen_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING id`,
      [
        userId,
        installationId,
        channel === 'EXPO' ? 'ANDROID' : 'WEB',
        channel,
        ciphertext ?? cipher.encrypt(plaintext, credentialAad(installationId, channel)),
        randomBytes(32).toString('hex'),
      ],
    );
    return firstRow(row.rows).id;
  }

  async function deliveryState(): Promise<{
    status: string;
    attempts: number;
    last_error_kind: string | null;
  }> {
    const rows = await pool.query<{
      status: string;
      attempts: number;
      last_error_kind: string | null;
    }>('SELECT status, attempts, last_error_kind FROM notification_deliveries');
    return firstRow(rows.rows);
  }

  it('sends and marks the delivery SENT', async () => {
    const { userId } = await seedDelivery(0);
    await addInstallation(userId);
    const sender = new FakePushSender('EXPO');

    const summary = await dispatcher([sender]).dispatch({ limit: 10 });

    expect(summary).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(await deliveryState()).toMatchObject({ status: 'SENT', attempts: 1 });
  });

  it('never puts financial data in the payload', async () => {
    const { userId } = await seedDelivery(3);
    await addInstallation(userId);
    const sender = new FakePushSender('EXPO');

    await dispatcher([sender]).dispatch({ limit: 10 });

    const message = sender.received[0]?.message;
    expect(message?.title).toBe('Vence en 3 días');
    // The lock screen shows this: no amount, no rule name, no token — only the id the deep link
    // needs, which is useless without an authenticated session.
    expect(JSON.stringify(message)).not.toMatch(/150000|Internet|ExponentPushToken/u);
  });

  it('claims each delivery exactly once across concurrent runs', async () => {
    const { userId } = await seedDelivery(0);
    await addInstallation(userId);
    const sender = new FakePushSender('EXPO');

    // FOR UPDATE SKIP LOCKED is what makes these disjoint rather than duplicated.
    const [first, second] = await Promise.all([
      dispatcher([sender]).dispatch({ limit: 10 }),
      dispatcher([sender]).dispatch({ limit: 10 }),
    ]);

    expect(first.claimed + second.claimed).toBe(1);
    expect(sender.received).toHaveLength(1);
  });

  it('retries a transient failure and stops at three attempts', async () => {
    const { userId } = await seedDelivery(0);
    const deviceId = await addInstallation(userId);
    const sender = new FakePushSender(
      'EXPO',
      new Map<string, PushSendResult>([[deviceId, { kind: 'transient' }]]),
    );

    await dispatcher([sender]).dispatch({ limit: 10 });
    expect(await deliveryState()).toMatchObject({ status: 'PENDING', attempts: 1 });

    await dispatcher([sender]).dispatch({ limit: 10 });
    expect(await deliveryState()).toMatchObject({ status: 'PENDING', attempts: 2 });

    await dispatcher([sender]).dispatch({ limit: 10 });
    expect(await deliveryState()).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      last_error_kind: 'TRANSIENT',
    });

    // The ceiling holds: a fourth run finds nothing left to claim.
    expect(await dispatcher([sender]).dispatch({ limit: 10 })).toMatchObject({ claimed: 0 });
    expect(sender.received).toHaveLength(3);
  });

  it('does not retry a permanent failure', async () => {
    const { userId } = await seedDelivery(0);
    const deviceId = await addInstallation(userId);
    const sender = new FakePushSender(
      'EXPO',
      new Map<string, PushSendResult>([[deviceId, { kind: 'permanent' }]]),
    );

    const summary = await dispatcher([sender]).dispatch({ limit: 10 });

    expect(summary).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(await deliveryState()).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      last_error_kind: 'PERMANENT',
    });
  });

  it('reclaims a claim abandoned by a crashed run without giving back the attempt', async () => {
    const { userId } = await seedDelivery(0);
    await addInstallation(userId);
    // A process that died right after claiming: SENDING, one attempt already spent, stale claim.
    await pool.query(
      `UPDATE notification_deliveries
       SET status = 'SENDING', attempts = 1, claimed_at = $1::timestamptz - interval '30 minutes'`,
      [now],
    );

    await dispatcher([new FakePushSender('EXPO')]).dispatch({ limit: 10 });

    expect(await deliveryState()).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('marks SENT when one of several installations accepts, and retires the dead one', async () => {
    const { userId } = await seedDelivery(0);
    const deadDeviceId = await addInstallation(userId);
    await addInstallation(userId);
    const sender = new FakePushSender(
      'EXPO',
      new Map<string, PushSendResult>([[deadDeviceId, { kind: 'invalid_credential' }]]),
    );

    const summary = await dispatcher([sender]).dispatch({ limit: 10 });

    expect(summary).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const dead = await pool.query<{
      deactivated_at: Date | null;
      credential_ciphertext: string | null;
    }>('SELECT deactivated_at, credential_ciphertext FROM device_installations WHERE id = $1', [
      deadDeviceId,
    ]);
    expect(firstRow(dead.rows).deactivated_at).not.toBeNull();
    expect(firstRow(dead.rows).credential_ciphertext).toBeNull();
  });

  it('retires an installation whose ciphertext can no longer be opened', async () => {
    const { userId } = await seedDelivery(0);
    // Sealed under a different AAD, which is exactly the tamper case the cipher is built to catch.
    const deviceId = await addInstallation(
      userId,
      'EXPO',
      cipher.encrypt('ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]', credentialAad('other', 'EXPO')),
    );

    await dispatcher([new FakePushSender('EXPO')]).dispatch({ limit: 10 });

    const row = await pool.query<{ deactivated_at: Date | null }>(
      'SELECT deactivated_at FROM device_installations WHERE id = $1',
      [deviceId],
    );
    expect(firstRow(row.rows).deactivated_at).not.toBeNull();
    expect(await deliveryState()).toMatchObject({ status: 'FAILED' });
  });

  it('fails a delivery whose responsible user has no active installation', async () => {
    await seedDelivery(0);

    const summary = await dispatcher([new FakePushSender('EXPO')]).dispatch({ limit: 10 });

    // Retrying would only spend the remaining attempts re-discovering the same emptiness.
    expect(summary).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(await deliveryState()).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      last_error_kind: 'PERMANENT',
    });
  });

  it('claims nothing at all when no keyring is configured', async () => {
    const { userId } = await seedDelivery(0);
    await addInstallation(userId);

    // Fail closed: claiming would burn attempts on a misconfiguration rather than a real failure.
    const summary = await dispatcher([new FakePushSender('EXPO')], false).dispatch({ limit: 10 });

    expect(summary).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(await deliveryState()).toMatchObject({ status: 'PENDING', attempts: 0 });
  });

  it('leaves a delivery cancelled by a settle mid-flight cancelled', async () => {
    const { userId } = await seedDelivery(0);
    const deviceId = await addInstallation(userId);
    const sender = new FakePushSender('EXPO');
    // Simulates the user paying between the claim and the finalize.
    const cancelDuringSend = new FakePushSender('EXPO');
    cancelDuringSend.send = async (target, message) => {
      await pool.query(`UPDATE notification_deliveries SET status = 'CANCELLED'`);
      return sender.send(target, message);
    };

    await dispatcher([cancelDuringSend]).dispatch({ limit: 10 });

    // Finalize is scoped to SENDING, so it cannot resurrect a reminder the user already settled.
    expect(await deliveryState()).toMatchObject({ status: 'CANCELLED' });
    expect(deviceId).toBeDefined();
  });
});
