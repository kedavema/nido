import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { deriveLocalDate } from '../transactions/local-date.js';
import {
  CLAIM_TIMEOUT_MINUTES,
  MAX_DELIVERY_ATTEMPTS,
  type ClaimedDelivery,
  type DeliveryOutcome,
  type NotificationDeliveriesRepository,
  type StoredInstallation,
} from './notification-deliveries.repository.js';

interface ClaimedRow {
  readonly id: string;
  readonly user_id: string;
  readonly occurrence_id: string;
  readonly offset_days: number;
  readonly attempts: number;
}

@Injectable()
export class PrismaNotificationDeliveriesRepository implements NotificationDeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claim(now: Date, limit: number, householdId?: string): Promise<readonly ClaimedDelivery[]> {
    // Deliveries are scheduled on household-local days, but a global dispatch has no single
    // timezone. Asuncion is behind UTC, so using the UTC day here can only ever be equal or one
    // day ahead of any household's local day — never earlier — which means a reminder is never
    // claimed before the day it belongs to.
    const today = deriveLocalDate(now, 'UTC');
    const householdFilter = householdId ?? null;

    const rows = await this.prisma.$queryRaw<readonly ClaimedRow[]>`
      UPDATE notification_deliveries
      SET status = 'SENDING', claimed_at = ${now}, attempts = attempts + 1, updated_at = ${now}
      WHERE id IN (
        SELECT id FROM notification_deliveries
        WHERE attempts < ${MAX_DELIVERY_ATTEMPTS}
          AND scheduled_for <= ${today}::date
          AND (
            status = 'PENDING'
            OR (
              status = 'SENDING'
              AND claimed_at
                  < ${now}::timestamptz - make_interval(mins => ${CLAIM_TIMEOUT_MINUTES}::int)
            )
          )
          AND (${householdFilter}::uuid IS NULL OR household_id = ${householdFilter}::uuid)
        ORDER BY scheduled_for, created_at
        -- SKIP LOCKED is what makes two concurrent dispatch runs disjoint instead of duplicated.
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING id, user_id, occurrence_id, offset_days, attempts
    `;

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      occurrenceId: row.occurrence_id,
      offsetDays: row.offset_days,
      attempts: row.attempts,
    }));
  }

  async findActiveInstallations(userId: string): Promise<readonly StoredInstallation[]> {
    const installations = await this.prisma.deviceInstallation.findMany({
      where: { userId, deactivatedAt: null, credentialCiphertext: { not: null } },
      select: { id: true, installationId: true, channel: true, credentialCiphertext: true },
    });

    return installations.map((installation) => ({
      deviceId: installation.id,
      installationId: installation.installationId,
      channel: installation.channel,
      credentialCiphertext: installation.credentialCiphertext ?? '',
    }));
  }

  async finalize(deliveryId: string, outcome: DeliveryOutcome, now: Date): Promise<void> {
    const data =
      outcome.kind === 'sent'
        ? { status: 'SENT' as const, sentAt: now, lastErrorKind: null }
        : outcome.kind === 'retry'
          ? // Back to PENDING with claimedAt cleared: the attempt is already spent, so the next
            // run sees a fresh candidate rather than an abandoned claim to time out.
            { status: 'PENDING' as const, claimedAt: null, lastErrorKind: outcome.errorKind }
          : { status: 'FAILED' as const, lastErrorKind: outcome.errorKind };

    // Scoped to SENDING so a concurrent settle/skip that already moved the row to CANCELLED wins:
    // finishing a send must never resurrect a reminder for an occurrence the user just paid.
    await this.prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, status: 'SENDING' },
      data,
    });
  }

  async deactivateInstallation(deviceId: string, now: Date): Promise<void> {
    await this.prisma.deviceInstallation.updateMany({
      where: { id: deviceId, deactivatedAt: null },
      data: { deactivatedAt: now, credentialCiphertext: null, credentialFingerprint: null },
    });
  }
}
