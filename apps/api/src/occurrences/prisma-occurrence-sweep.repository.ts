import { Injectable } from '@nestjs/common';
import { FREQUENCY_KINDS, type FrequencyKind } from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import {
  generateOccurrenceSchedule,
  truncateToUtcDate,
} from '../recurring-items/occurrence-generation.js';
import { deriveLocalDate } from '../transactions/local-date.js';
import type { OccurrenceSweepRepository } from './occurrence-sweep.repository.js';

@Injectable()
export class PrismaOccurrenceSweepRepository implements OccurrenceSweepRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sweep(householdId: string, now: Date): Promise<void> {
    const today = truncateToUtcDate(now);
    // No-lock fast path: the overwhelming majority of authenticated requests in a day are not the
    // first, so a single indexed primary-key read lets them skip opening a transaction and taking
    // the advisory lock entirely. The authoritative once-per-day guarantee still lives under the
    // lock below (re-checked there); this only avoids paying for the lock when it is clearly a
    // no-op. A stale read here at worst lets a request fall through to the locked re-check.
    const marker = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { lastSweptOn: true, timezone: true },
    });
    if (marker === null || sameUtcDay(marker.lastSweptOn, today)) {
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      // Scoped by household id (hashed to the bigint key pg_advisory_xact_lock requires): a
      // second concurrent call for the same household blocks here until the first call's
      // transaction commits or rolls back, then proceeds against the now-up-to-date rows — it
      // never runs the generate/mark-overdue steps below in parallel with another call for the
      // same household. Different households use different lock keys and never block each other.
      // The lock is released automatically when this transaction ends (xact-scoped).
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${householdId}))`;

      // Re-check the daily marker now that we hold the lock. The service already skipped the
      // no-lock fast path when `last_swept_on` was today, but a concurrent first-of-the-day
      // request can win the lock and sweep while this one waits — so the loser re-reads here and
      // becomes a no-op instead of redoing the generate/mark-overdue work a second time. This is
      // what makes the whole "primera apertura del día" trigger exactly-once under concurrency.
      const household = await transaction.household.findUnique({
        where: { id: householdId },
        select: { lastSweptOn: true, timezone: true },
      });
      if (household === null || sameUtcDay(household.lastSweptOn, today)) {
        return;
      }

      const activeRecurringItems = await transaction.recurringItem.findMany({
        where: { householdId, isActive: true },
      });

      const missingOccurrences = activeRecurringItems.flatMap((item) =>
        generateOccurrenceSchedule({
          firstDueDate: item.firstDueDate,
          frequency: toFrequencyKind(item.frequency),
          intervalMonths: item.intervalMonths,
          endDate: item.endDate,
        }).map((dueDate) => ({
          recurringItemId: item.id,
          householdId,
          dueDate,
          amount: item.estimatedAmount,
          currency: item.currency,
          fxRateToBase: item.plannedFxRateToBase,
          responsibleUserId: item.responsibleUserId,
        })),
      );

      if (missingOccurrences.length > 0) {
        // ADR 0009 point 3: only occurrences whose (recurring_item_id, due_date) doesn't exist yet
        // are inserted — an existing row at that due date, whatever its status (PENDING,
        // SETTLED, OVERDUE, or SKIPPED), is silently skipped instead of colliding with the unique
        // constraint. This is what makes a repeated or concurrent sweep call idempotent.
        await transaction.occurrence.createMany({
          data: missingOccurrences,
          skipDuplicates: true,
        });
      }

      // Only rows still PENDING are ever selected here, so a SETTLED or SKIPPED occurrence (and
      // an already-OVERDUE one) can never be touched by this update.
      await transaction.occurrence.updateMany({
        where: { householdId, status: 'PENDING', dueDate: { lt: today } },
        data: { status: 'OVERDUE' },
      });

      // M7 (ADR 0012), still inside this transaction and lock: queue the reminders that fall due
      // today. Only EXPENSE rules notify, only the occurrence's responsible user receives one,
      // and an occurrence without a responsible user produces nothing. The offsets come from
      // `recurring_items.notification_offsets`, so a rule with an empty array simply contributes
      // no rows; nothing is ever back-filled with defaults.
      //
      // The `[today - 1, today]` window absorbs one missed scheduler day without letting a first
      // run over a database with history fire months of stale reminders at once. The day is the
      // household-local one because a due date is a financial date (§14), not a UTC instant.
      //
      // `ON CONFLICT DO NOTHING` against the (occurrence_id, offset_days) unique index is what
      // makes a repeated sweep — or the cron racing an app open — insert nothing the second time.
      const localToday = deriveLocalDate(now, household.timezone);
      await transaction.$executeRaw`
        INSERT INTO notification_deliveries
          (household_id, occurrence_id, user_id, offset_days, scheduled_for, updated_at)
        SELECT o.household_id, o.id, o.responsible_user_id, "offset".value,
               (o.due_date - "offset".value), now()
        FROM occurrences o
        JOIN recurring_items r ON r.id = o.recurring_item_id
        CROSS JOIN LATERAL unnest(r.notification_offsets) AS "offset"(value)
        WHERE o.household_id = ${householdId}::uuid
          AND r.kind = 'EXPENSE'
          AND o.responsible_user_id IS NOT NULL
          AND o.status IN ('PENDING', 'OVERDUE')
          AND (o.due_date - "offset".value)
              BETWEEN (${localToday}::date - 1) AND ${localToday}::date
        ON CONFLICT (occurrence_id, offset_days) DO NOTHING
      `;

      // Stamp the daily marker inside the same locked transaction: the next request that reads
      // `last_swept_on === today` short-circuits before ever opening a transaction or taking the
      // lock, so the sweep runs at most once per household per calendar day.
      await transaction.household.update({
        where: { id: householdId },
        data: { lastSweptOn: today },
      });
    });
  }
}

/** True when both dates fall on the same UTC calendar day (or both are the same null marker). */
function sameUtcDay(left: Date | null, right: Date): boolean {
  if (left === null) {
    return false;
  }
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function toFrequencyKind(value: string): FrequencyKind {
  if ((FREQUENCY_KINDS as readonly string[]).includes(value)) {
    return value as FrequencyKind;
  }
  throw new Error('Unsupported recurring item frequency');
}
