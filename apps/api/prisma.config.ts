import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'prisma/config';

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const environmentFile = resolve(projectDirectory, '.env');

if (existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

// Code generation does not connect, but Prisma still requires a syntactically valid datasource.
// Port 1 is a fail-closed sentinel so a data-accessing command can never select a real database
// when DATABASE_URL is absent.
const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
const databaseUrl =
  configuredDatabaseUrl === undefined || configuredDatabaseUrl.length === 0
    ? 'postgresql://configuration-required:configuration-required@127.0.0.1:1/configuration-required'
    : configuredDatabaseUrl;

export default defineConfig({
  schema: resolve(projectDirectory, 'prisma/schema.prisma'),
  migrations: {
    path: resolve(projectDirectory, 'prisma/migrations'),
  },
  datasource: {
    url: databaseUrl,
  },
});
