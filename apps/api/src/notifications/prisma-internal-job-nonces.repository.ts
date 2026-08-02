import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import {
  NONCE_RETENTION_MINUTES,
  type InternalJobNoncesRepository,
} from './internal-job-nonces.repository.js';

@Injectable()
export class PrismaInternalJobNoncesRepository implements InternalJobNoncesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async remember(nonce: string, now: Date): Promise<boolean> {
    // ON CONFLICT DO NOTHING makes the primary key itself the replay check: a second request with
    // the same nonce inserts zero rows, with no read-then-write window in between. An in-memory
    // set would be faster and useless — the free instance sleeps on inactivity, which is exactly
    // when it would forget every nonce it had seen (ADR 0004).
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO internal_job_nonces (nonce, created_at)
      VALUES (${nonce}, ${now})
      ON CONFLICT (nonce) DO NOTHING
    `;
    return inserted === 1;
  }

  async prune(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - NONCE_RETENTION_MINUTES * 60_000);
    await this.prisma.internalJobNonce.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }
}
