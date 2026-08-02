import { randomBytes, randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { RegisterDeviceResponseSchema } from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const credentialKey = randomBytes(32).toString('base64');
const credentialPepper = randomBytes(32).toString('base64');

const identities = {
  owner: {
    firebaseUid: 'firebase-device-owner',
    email: 'device-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  partner: {
    firebaseUid: 'firebase-device-partner',
    email: 'device-partner@example.com',
    displayName: 'Partner',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

function expoBody(installationId: string, token: string): Record<string, unknown> {
  return {
    installationId,
    platform: 'ANDROID',
    credential: { kind: 'EXPO', token },
  };
}

describe.skipIf(!hasTestDatabase)('Devices API with PostgreSQL', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let pool: Pool;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('DATABASE_URL', testDatabaseUrl ?? '');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'nido-integration');
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:8081');
    vi.stubEnv('NOTIFICATION_CREDENTIAL_KEYS', `k1:${credentialKey}`);
    vi.stubEnv('NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID', 'k1');
    vi.stubEnv('NOTIFICATION_CREDENTIAL_PEPPER', credentialPepper);

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
      'TRUNCATE TABLE device_installations, household_members, households, users CASCADE',
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

  it('requires authentication', async () => {
    const response = await request('/v1/devices/register', {
      method: 'POST',
      body: expoBody(randomUUID(), 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'),
    });
    expect(response.status).toBe(401);
  });

  it('registers a device and never returns the credential', async () => {
    const installationId = randomUUID();
    const response = await request('/v1/devices/register', {
      method: 'POST',
      token: 'owner',
      body: expoBody(installationId, 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'),
    });

    expect(response.status).toBe(201);
    const payload: unknown = await response.json();
    const { device } = RegisterDeviceResponseSchema.parse(payload);
    expect(device).toMatchObject({ installationId, platform: 'ANDROID', channel: 'EXPO' });

    // The schema is strict, so parsing above already proves no credential field came back. This
    // asserts the raw body too, in case a future response gains a passthrough layer.
    expect(JSON.stringify(payload)).not.toContain('ExponentPushToken');

    const stored = await pool.query<{
      credential_ciphertext: string;
      credential_fingerprint: string;
    }>('SELECT credential_ciphertext, credential_fingerprint FROM device_installations');
    expect(stored.rows[0]?.credential_ciphertext).toMatch(/^v1\.k1\./u);
    expect(stored.rows[0]?.credential_ciphertext).not.toContain('ExponentPushToken');
    expect(stored.rows[0]?.credential_fingerprint).toHaveLength(64);
  });

  it('updates the same row when the same installation re-registers with a rotated token', async () => {
    const installationId = randomUUID();
    const first = await register(
      'owner',
      installationId,
      'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
    );
    const before = await pool.query<{ credential_ciphertext: string; last_seen_at: Date }>(
      'SELECT credential_ciphertext, last_seen_at FROM device_installations',
    );

    const second = await register(
      'owner',
      installationId,
      'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]',
    );
    expect(second.id).toBe(first.id);

    const after = await pool.query<{ credential_ciphertext: string; last_seen_at: Date }>(
      'SELECT credential_ciphertext, last_seen_at FROM device_installations',
    );
    expect(after.rowCount).toBe(1);
    expect(after.rows[0]?.credential_ciphertext).not.toBe(before.rows[0]?.credential_ciphertext);
    expect(after.rows[0]?.last_seen_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0]?.last_seen_at.getTime() ?? 0,
    );
  });

  it('hands the installation over when another user signs in on the same device', async () => {
    const installationId = randomUUID();
    await register('owner', installationId, 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
    await register('partner', installationId, 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]');

    // One row, owned by the partner: the previous user must not stay subscribed to a phone they
    // signed out of, which is a cross-account leak and not just a duplicate.
    const rows = await pool.query<{ email: string }>(
      `SELECT u.email FROM device_installations d JOIN users u ON u.id = d.user_id`,
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.email).toBe(identities.partner.email);
  });

  it('retires the previous install when a reinstall reuses the same push token', async () => {
    const token = 'ExponentPushToken[cccccccccccccccccccccc]';
    const first = await register('owner', randomUUID(), token);
    const second = await register('owner', randomUUID(), token);

    // Without this, the partial unique index would reject the second registration and the user
    // would silently lose notifications after reinstalling the app.
    expect(second.id).not.toBe(first.id);
    const rows = await pool.query<{ id: string; deactivated_at: Date | null }>(
      'SELECT id, deactivated_at FROM device_installations ORDER BY created_at',
    );
    expect(rows.rowCount).toBe(2);
    expect(rows.rows.find((row) => row.id === first.id)?.deactivated_at).not.toBeNull();
    expect(rows.rows.find((row) => row.id === second.id)?.deactivated_at).toBeNull();
  });

  it('deactivates an own device idempotently and destroys its credential', async () => {
    const device = await register(
      'owner',
      randomUUID(),
      'ExponentPushToken[dddddddddddddddddddddd]',
    );

    expect(
      (await request(`/v1/devices/${device.id}`, { method: 'DELETE', token: 'owner' })).status,
    ).toBe(204);
    // A repeated delete is the same answer, so a client retrying a failed logout is not punished.
    expect(
      (await request(`/v1/devices/${device.id}`, { method: 'DELETE', token: 'owner' })).status,
    ).toBe(204);

    const rows = await pool.query<{
      deactivated_at: Date | null;
      credential_ciphertext: string | null;
      credential_fingerprint: string | null;
    }>(
      'SELECT deactivated_at, credential_ciphertext, credential_fingerprint FROM device_installations',
    );
    expect(rows.rows[0]?.deactivated_at).not.toBeNull();
    expect(rows.rows[0]?.credential_ciphertext).toBeNull();
    expect(rows.rows[0]?.credential_fingerprint).toBeNull();
  });

  it('conceals another user device behind the same 404 as a missing one', async () => {
    const device = await register(
      'owner',
      randomUUID(),
      'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]',
    );

    const foreign = await request(`/v1/devices/${device.id}`, {
      method: 'DELETE',
      token: 'partner',
    });
    const missing = await request(`/v1/devices/${randomUUID()}`, {
      method: 'DELETE',
      token: 'partner',
    });
    // Same status on purpose: a different one would let a caller enumerate other users' installs.
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);

    const stillActive = await pool.query(
      'SELECT 1 FROM device_installations WHERE deactivated_at IS NULL',
    );
    expect(stillActive.rowCount).toBe(1);
  });

  it('rejects a body that carries its own user id or mismatched platform', async () => {
    const installationId = randomUUID();
    const spoofed = await request('/v1/devices/register', {
      method: 'POST',
      token: 'owner',
      body: {
        ...expoBody(installationId, 'ExponentPushToken[ffffffffffffffffffffff]'),
        userId: randomUUID(),
      },
    });
    expect(spoofed.status).toBe(400);

    const mismatched = await request('/v1/devices/register', {
      method: 'POST',
      token: 'owner',
      body: {
        installationId,
        platform: 'WEB',
        credential: { kind: 'EXPO', token: 'ExponentPushToken[ffffffffffffffffffffff]' },
      },
    });
    expect(mismatched.status).toBe(400);

    expect((await pool.query('SELECT 1 FROM device_installations')).rowCount).toBe(0);
  });

  it('rejects a device id that is not a uuid', async () => {
    const response = await request('/v1/devices/not-a-uuid', { method: 'DELETE', token: 'owner' });
    expect(response.status).toBe(400);
  });

  async function register(
    token: keyof typeof identities,
    installationId: string,
    pushToken: string,
  ): Promise<{ id: string }> {
    const response = await request('/v1/devices/register', {
      method: 'POST',
      token,
      body: expoBody(installationId, pushToken),
    });
    expect(response.status).toBe(201);
    return RegisterDeviceResponseSchema.parse(await response.json()).device;
  }

  function request(
    path: string,
    options: {
      readonly token?: string;
      readonly method?: 'GET' | 'POST' | 'DELETE';
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
