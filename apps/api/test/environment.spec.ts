import { describe, expect, it } from 'vitest';

import { EnvironmentSchema, validateEnvironment } from '../src/config/environment.js';

describe('environment validation', () => {
  it('applies deterministic development defaults', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost:5432/nido',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://localhost:5432/nido',
    });
  });

  it('coerces a valid port supplied by the process environment', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        PORT: '8080',
        DATABASE_URL: 'postgresql://localhost:5432/nido',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL: 'postgresql://localhost:5432/nido',
    });
  });

  it.each([
    { DATABASE_URL: 'not-a-url' },
    { DATABASE_URL: 'https://example.com/nido' },
    { DATABASE_URL: 'postgresql://localhost:5432/nido', NODE_ENV: 'staging' },
    { DATABASE_URL: 'postgresql://localhost:5432/nido', PORT: '0' },
    { DATABASE_URL: 'postgresql://localhost:5432/nido', PORT: '65536' },
  ])('rejects invalid input %#', (values) => {
    expect(() => EnvironmentSchema.parse(values)).toThrow();
  });
});
