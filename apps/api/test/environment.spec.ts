import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EnvironmentSchema, validateEnvironment } from '../src/config/environment.js';

const credentialKey = randomBytes(32).toString('base64');
const credentialPepper = randomBytes(32).toString('base64');

const baseEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://localhost:5432/nido',
  FIREBASE_PROJECT_ID: 'nido-production',
  CORS_ORIGINS: 'https://nido.example',
} as const;

describe('environment validation', () => {
  it('applies deterministic non-security defaults for an explicit development mode', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost:5432/nido',
        FIREBASE_PROJECT_ID: 'nido-test',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
      CORS_ORIGINS: ['http://localhost:8081', 'http://localhost:19006'],
    });
  });

  it('coerces a valid port supplied by the process environment', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        PORT: '8080',
        DATABASE_URL: 'postgresql://localhost:5432/nido',
        FIREBASE_PROJECT_ID: 'nido-production',
        CORS_ORIGINS: 'https://nido.example,https://admin.nido.example',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-production',
      CORS_ORIGINS: ['https://nido.example', 'https://admin.nido.example'],
    });
  });

  it.each([
    {
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
    },
    { NODE_ENV: 'development', DATABASE_URL: 'not-a-url', FIREBASE_PROJECT_ID: 'nido-test' },
    {
      NODE_ENV: 'development',
      DATABASE_URL: 'https://example.com/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
    },
    {
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
      NODE_ENV: 'staging',
    },
    {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
      PORT: '0',
    },
    {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
      PORT: '65536',
    },
    {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: '',
    },
    {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
      CORS_ORIGINS: 'not-an-origin',
    },
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-production',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    },
    {
      DATABASE_URL: 'postgresql://localhost:5432/nido',
      FIREBASE_PROJECT_ID: 'nido-test',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    },
  ])('rejects invalid input %#', (values) => {
    expect(() => EnvironmentSchema.parse(values)).toThrow();
  });

  describe('notification credential keyring', () => {
    it('accepts an environment that leaves the keyring unconfigured', () => {
      // Notifications off is a legitimate state (ADR 0004 fail-closed): the device endpoints
      // refuse the request, the API still boots.
      expect(validateEnvironment({ ...baseEnvironment })).not.toHaveProperty(
        'NOTIFICATION_CREDENTIAL_KEYS',
      );
    });

    it('accepts a complete keyring', () => {
      expect(
        validateEnvironment({
          ...baseEnvironment,
          NOTIFICATION_CREDENTIAL_KEYS: `k1:${credentialKey}`,
          NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID: 'k1',
          NOTIFICATION_CREDENTIAL_PEPPER: credentialPepper,
        }).NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID,
      ).toBe('k1');
    });

    it.each([
      [
        'a keyring configured without its active key id or pepper',
        { NOTIFICATION_CREDENTIAL_KEYS: `k1:${credentialKey}` },
      ],
      [
        'an active key id that is not in the keyring',
        {
          NOTIFICATION_CREDENTIAL_KEYS: `k1:${credentialKey}`,
          NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID: 'k9',
          NOTIFICATION_CREDENTIAL_PEPPER: credentialPepper,
        },
      ],
      [
        'a key that does not decode to 32 bytes',
        {
          NOTIFICATION_CREDENTIAL_KEYS: `k1:${randomBytes(8).toString('base64')}`,
          NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID: 'k1',
          NOTIFICATION_CREDENTIAL_PEPPER: credentialPepper,
        },
      ],
    ])('rejects %s at startup', (_label, values) => {
      // Startup is the only place these can fail loudly; deferring them would surface on the first
      // device registration, long after the deploy looked successful.
      expect(() => validateEnvironment({ ...baseEnvironment, ...values })).toThrow();
    });
  });
});
