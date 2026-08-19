import { randomBytes, randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateHouseholdResponseSchema,
  DispatchNotificationsResponseSchema,
} from '@nido/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { signJobRequest } from '../src/notifications/internal-job-hmac.guard.js';
import type { VerifiedIdentity } from '../src/users/user.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const credentialKey = randomBytes(32).toString('base64');
const credentialPepper = randomBytes(32).toString('base64');
const jobSecret = randomBytes(32).toString('hex');

const identities = {
  owner: {
    firebaseUid: 'firebase-dispatch-owner',
    email: 'dispatch-owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
  },
  outsider: {
    firebaseUid: 'firebase-dispatch-outsider',
    email: 'dispatch-outsider@example.com',
    displayName: 'Outsider',
    avatarUrl: null,
  },
} as const satisfies Record<string, VerifiedIdentity>;

/**
 * These two routes are the reason this file exists. Both were written, unit tested and left
 * unmounted for an entire milestone — the guard and the dispatcher had full coverage while no
 * controller referenced them, so nothing failed. Unit tests cannot catch that; only a request that
 * travels the real router can.
 */
describe.skipIf(!hasTestDatabase)('Notification dispatch API with PostgreSQL', () => {
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
    vi.stubEnv('NOTIFICATIONS_JOB_HMAC_SECRET', jobSecret);

    const { AppModule } = await import('../src/app.module.js');
    const { IDENTITY_TOKEN_VERIFIER, InvalidIdentityTokenError } =
      await import('../src/auth/identity-token-verifier.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_TOKEN_VERIFIER)
      .useValue({
        verify: (token: string): Promise<VerifiedIdentity> => {
          const identitiesByToken: Readonly<Record<string, VerifiedIdentity>> = identities;
          const identity = identitiesByToken[token];
          return identity === undefined
            ? Promise.reject(new InvalidIdentityTokenError())
            : Promise.resolve(identity);
        },
      })
      .compile();

    // `rawBody` exactly as main.ts creates it: the HMAC guard signs the bytes that arrived, so an
    // application built without it would reject every correctly signed request.
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    const { configureApplication } = await import('../src/configure-application.js');
    configureApplication(app, { corsOrigins: ['http://localhost:8081'] });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE internal_job_nonces, notification_deliveries, device_installations, household_members, households, users CASCADE',
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

  describe('POST /v1/households/:householdId/notifications/dispatch', () => {
    it('requires authentication', async () => {
      const response = await request(
        `/v1/households/${randomUUID()}/notifications/dispatch`,
        'POST',
      );
      expect(response.status).toBe(401);
    });

    it("conceals another household's dispatch from a non-member with 404", async () => {
      const householdId = await createHousehold('owner');
      const response = await request(
        `/v1/households/${householdId}/notifications/dispatch`,
        'POST',
        { token: 'outsider' },
      );
      expect(response.status).toBe(404);
    });

    it('answers a member with the aggregate counters', async () => {
      const householdId = await createHousehold('owner');
      const response = await request(
        `/v1/households/${householdId}/notifications/dispatch`,
        'POST',
        { token: 'owner' },
      );

      expect(response.status).toBe(200);
      // Nothing is enqueued for a fresh household, so this proves the route is wired end to end
      // rather than proving anything about delivery.
      expect(DispatchNotificationsResponseSchema.parse(await response.json())).toEqual({
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: false,
      });
    });
  });

  describe('POST /v1/internal/jobs/due-notifications', () => {
    const path = '/v1/internal/jobs/due-notifications';

    it('rejects a request with no signature at all', async () => {
      expect((await request(path, 'POST')).status).toBe(401);
    });

    it('rejects a Firebase token, which is not how a scheduler authenticates', async () => {
      expect((await request(path, 'POST', { token: 'owner' })).status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const response = await signedRequest({ secret: 'not-the-configured-secret-but-long-enough' });
      expect(response.status).toBe(401);
    });

    it('rejects a timestamp outside the clock-skew window', async () => {
      const stale = String(Math.floor(Date.now() / 1000) - 600);
      expect((await signedRequest({ timestamp: stale })).status).toBe(401);
    });

    it('accepts a valid signature and answers with the counters', async () => {
      const response = await signedRequest();

      expect(response.status).toBe(200);
      expect(DispatchNotificationsResponseSchema.parse(await response.json())).toEqual({
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: false,
      });
    });

    it('remembers the nonce so the same request cannot be replayed', async () => {
      const nonce = randomUUID();
      expect((await signedRequest({ nonce })).status).toBe(200);

      // A captured request is refused on its second use; the duplicate primary-key insert is the
      // detection, so this also proves the nonce reached the table.
      expect((await signedRequest({ nonce })).status).toBe(401);

      const stored = await pool.query('SELECT nonce FROM internal_job_nonces WHERE nonce = $1', [
        nonce,
      ]);
      expect(stored.rowCount).toBe(1);
    });
  });

  function signedRequest(
    overrides: {
      readonly secret?: string;
      readonly timestamp?: string;
      readonly nonce?: string;
    } = {},
  ): Promise<Response> {
    const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    const nonce = overrides.nonce ?? randomUUID();
    // Empty body, matching what the GitHub Actions workflow actually sends.
    const signature = signJobRequest(
      overrides.secret ?? jobSecret,
      timestamp,
      nonce,
      Buffer.alloc(0),
    );

    return fetch(`${baseUrl}/v1/internal/jobs/due-notifications`, {
      method: 'POST',
      headers: {
        'x-nido-timestamp': timestamp,
        'x-nido-nonce': nonce,
        'x-nido-signature': signature,
      },
    });
  }

  async function createHousehold(token: keyof typeof identities): Promise<string> {
    const response = await request('/v1/households', 'POST', {
      token,
      body: { name: `Casa ${token}` },
    });
    expect(response.status).toBe(201);
    return CreateHouseholdResponseSchema.parse(await response.json()).household.id;
  }

  function request(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    options: { readonly token?: string; readonly body?: unknown } = {},
  ): Promise<Response> {
    const headers = new Headers();
    if (options.token !== undefined) {
      headers.set('Authorization', `Bearer ${options.token}`);
    }
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }
});
