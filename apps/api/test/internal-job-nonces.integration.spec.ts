import { randomUUID } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Environment } from '../src/config/environment.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { NONCE_RETENTION_MINUTES } from '../src/notifications/internal-job-nonces.repository.js';
import { PrismaInternalJobNoncesRepository } from '../src/notifications/prisma-internal-job-nonces.repository.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;

const now = new Date('2026-08-10T15:00:00.000Z');

describe.skipIf(!hasTestDatabase)('M7 internal job nonces', () => {
  let pool: Pool;
  let prisma: PrismaService;
  let repository: PrismaInternalJobNoncesRepository;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    prisma = new PrismaService({
      get: () => testDatabaseUrl ?? '',
    } as unknown as ConfigService<Environment, true>);
    repository = new PrismaInternalJobNoncesRepository(prisma);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE internal_job_nonces');
  });

  afterAll(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  it('accepts a nonce once and refuses the replay', async () => {
    const nonce = randomUUID();

    expect(await repository.remember(nonce, now)).toBe(true);
    expect(await repository.remember(nonce, now)).toBe(false);
  });

  it('lets exactly one of two concurrent replays through', async () => {
    const nonce = randomUUID();

    // The duplicate insert IS the check, so there is no read-then-write window for both to win.
    const results = await Promise.all([
      repository.remember(nonce, now),
      repository.remember(nonce, now),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('drops nonces past the retention window and keeps the recent ones', async () => {
    const stale = randomUUID();
    const recent = randomUUID();
    await pool.query(
      `INSERT INTO internal_job_nonces (nonce, created_at)
       VALUES ($1, $2::timestamptz - make_interval(mins => $4::int)),
              ($3, $2::timestamptz)`,
      [stale, now, recent, NONCE_RETENTION_MINUTES + 5],
    );

    await repository.prune(now);

    const rows = await pool.query<{ nonce: string }>('SELECT nonce FROM internal_job_nonces');
    expect(rows.rows.map((row) => row.nonce)).toEqual([recent]);
  });

  it('lets a pruned nonce be used again, which the clock window makes safe', async () => {
    const nonce = randomUUID();
    await repository.remember(nonce, new Date(now.getTime() - 60 * 60_000));

    await repository.prune(now);

    // Forgetting is only safe because the signature's clock window is far narrower than the
    // retention window, so a captured request is already expired by the time it is forgotten.
    expect(await repository.remember(nonce, now)).toBe(true);
  });
});
