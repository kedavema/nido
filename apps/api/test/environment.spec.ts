import { describe, expect, it } from 'vitest';

import { EnvironmentSchema, validateEnvironment } from '../src/config/environment.js';

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
});
