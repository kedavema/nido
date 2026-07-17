import { describe, expect, it } from 'vitest';

import { assertDisposableTestDatabaseUrl } from './global-setup.js';

describe('integration database safety', () => {
  it.each([
    'postgresql://nido:nido@localhost:5432/nido_test',
    'postgres://nido:nido@localhost:5432/nido_ci',
  ])('allows an explicitly disposable database: %s', (databaseUrl) => {
    expect(() => {
      assertDisposableTestDatabaseUrl(databaseUrl);
    }).not.toThrow();
  });

  it.each([
    'postgresql://nido:nido@localhost:5432/nido',
    'postgresql://nido:nido@localhost:5432/postgres',
    'https://example.com/nido_test',
    'not-a-url',
  ])('rejects a database that is not explicitly disposable: %s', (databaseUrl) => {
    expect(() => {
      assertDisposableTestDatabaseUrl(databaseUrl);
    }).toThrow(/TEST_DATABASE_URL/u);
  });
});
