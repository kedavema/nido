import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function setup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
    return;
  }

  assertDisposableTestDatabaseUrl(testDatabaseUrl);

  const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDirectory,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
}

export function assertDisposableTestDatabaseUrl(value: string): void {
  let databaseUrl: URL;

  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  const databaseName = databaseUrl.pathname.slice(1);
  const usesPostgreSql =
    databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:';

  if (!usesPostgreSql || !/(?:_ci|_test)$/u.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL must select a disposable database ending in _test or _ci');
  }
}
