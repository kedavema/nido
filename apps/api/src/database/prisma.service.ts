import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Environment } from '../config/environment.js';
import { PrismaClient } from '../generated/prisma/client.js';

const DATABASE_OPERATION_TIMEOUT_MILLISECONDS = 5_000;
const REQUIRED_MIGRATION = '20260716180000_m1_auth_households';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Environment, true>) {
    const connectionString = config.get('DATABASE_URL', { infer: true });
    super({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: DATABASE_OPERATION_TIMEOUT_MILLISECONDS,
        query_timeout: DATABASE_OPERATION_TIMEOUT_MILLISECONDS,
        statement_timeout: DATABASE_OPERATION_TIMEOUT_MILLISECONDS,
      }),
    });
  }

  async assertReady(): Promise<void> {
    const result = await this.$queryRaw<readonly { ready: boolean }[]>`
      SELECT
        EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE "migration_name" = ${REQUIRED_MIGRATION}
            AND "finished_at" IS NOT NULL
            AND "rolled_back_at" IS NULL
        )
        AND to_regclass('public.users') IS NOT NULL
        AND to_regclass('public.households') IS NOT NULL
        AND to_regclass('public.household_members') IS NOT NULL
        AND to_regclass('public.household_invites') IS NOT NULL AS "ready"
    `;

    if (result[0]?.ready !== true) {
      throw new Error('Required database migration is unavailable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
