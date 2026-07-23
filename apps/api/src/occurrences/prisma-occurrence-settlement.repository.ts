import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { toTransactionRecord } from '../transactions/prisma-transactions.repository.js';
import { deriveLocalDate, parseLocalDate } from '../transactions/local-date.js';
import { assertAmountCurrencyConsistency, computeBaseAmountPyg } from '../transactions/money.js';
import { OCCURRENCE_STATUSES, type OccurrenceStatus } from './occurrence.js';
import type {
  OccurrenceSettlementRepository,
  SettleOccurrenceInput,
  SettleOccurrenceResult,
  SkipOccurrenceInput,
  SkipOccurrenceResult,
} from './occurrence-settlement.repository.js';
import { toOccurrenceRecord } from './prisma-occurrences.repository.js';

// An occurrence can only be settled or skipped while it is still awaiting action.
const TRANSITIONABLE_STATUSES: readonly OccurrenceStatus[] = ['PENDING', 'OVERDUE'];

@Injectable()
export class PrismaOccurrenceSettlementRepository implements OccurrenceSettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async settle(input: SettleOccurrenceInput): Promise<SettleOccurrenceResult> {
    return this.prisma.$transaction(async (transaction) => {
      // Step 1: lock the occurrence row for the duration of the transaction. A concurrent settle
      // of the same occurrence blocks here until this transaction commits, then re-reads the (now
      // SETTLED) row below and is rejected — so the amount is never double-counted.
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT id FROM occurrences
        WHERE id = ${input.occurrenceId}::uuid AND household_id = ${input.householdId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { kind: 'not_found' };
      }

      const occurrence = await transaction.occurrence.findUniqueOrThrow({
        where: { id: input.occurrenceId },
      });

      // Step 2: only a PENDING/OVERDUE occurrence can be settled. A SETTLED or SKIPPED one is a
      // conflict, not a re-settle.
      const status = toOccurrenceStatus(occurrence.status);
      if (!TRANSITIONABLE_STATUSES.includes(status)) {
        return { kind: 'not_transitionable', status };
      }

      const rule = await transaction.recurringItem.findUniqueOrThrow({
        where: { id: occurrence.recurringItemId },
      });
      const household = await transaction.household.findUniqueOrThrow({
        where: { id: input.householdId },
        select: { timezone: true },
      });

      // Effective money: each field falls back to the value copied onto the occurrence at
      // generation. The occurrence was generated from a valid rule, so the as-planned path is
      // already consistent; an override re-runs the same scale/fx rule the create endpoint uses.
      const currency = input.currency ?? occurrence.currency;
      const amount = input.amount ?? occurrence.amount.toFixed(currency === 'PYG' ? 0 : 2);
      const fxRateToBase =
        input.fxRateToBase !== undefined
          ? input.fxRateToBase
          : occurrence.fxRateToBase === null
            ? null
            : occurrence.fxRateToBase.toString();
      assertAmountCurrencyConsistency({ currency, amount, fxRateToBase });
      const baseAmountPyg = computeBaseAmountPyg({ currency, amount, fxRateToBase });

      const occurredAt = input.settledAt ?? new Date();
      const localDate = parseLocalDate(deriveLocalDate(occurredAt, household.timezone));
      const paymentSourceId =
        input.paymentSourceId !== undefined ? input.paymentSourceId : rule.paymentSourceId;

      // Steps 3 & 4: create the real transaction, linked 1:1 to the occurrence and stamped
      // RECURRING so it is never mistaken for a manual entry.
      const createdTransaction = await transaction.transaction.create({
        data: {
          householdId: input.householdId,
          type: rule.kind,
          amount: new Prisma.Decimal(amount),
          currency,
          fxRateToBase: fxRateToBase === null ? null : new Prisma.Decimal(fxRateToBase),
          baseAmountPyg,
          occurredAt,
          localDate,
          categoryId: rule.categoryId,
          paymentSourceId,
          description: rule.name,
          notes: null,
          origin: 'RECURRING',
          sourceOccurrenceId: occurrence.id,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
      });

      // Step 5: mark the occurrence SETTLED, stamped with the same instant the transaction records.
      // Step 6 (cancel pending notification deliveries) is a no-op until M7 adds that table.
      const settledOccurrence = await transaction.occurrence.update({
        where: { id: occurrence.id },
        data: { status: 'SETTLED', settledAt: occurredAt },
      });

      // Step 7: return both, mapped through the shared record mappers.
      return {
        kind: 'settled',
        transaction: toTransactionRecord(createdTransaction),
        occurrence: toOccurrenceRecord(settledOccurrence),
      };
    });
  }

  async skip(input: SkipOccurrenceInput): Promise<SkipOccurrenceResult> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT id FROM occurrences
        WHERE id = ${input.occurrenceId}::uuid AND household_id = ${input.householdId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { kind: 'not_found' };
      }

      const occurrence = await transaction.occurrence.findUniqueOrThrow({
        where: { id: input.occurrenceId },
      });
      const status = toOccurrenceStatus(occurrence.status);
      if (!TRANSITIONABLE_STATUSES.includes(status)) {
        return { kind: 'not_transitionable', status };
      }

      const skippedOccurrence = await transaction.occurrence.update({
        where: { id: occurrence.id },
        data: { status: 'SKIPPED' },
      });
      return { kind: 'skipped', occurrence: toOccurrenceRecord(skippedOccurrence) };
    });
  }
}

function toOccurrenceStatus(value: string): OccurrenceStatus {
  if ((OCCURRENCE_STATUSES as readonly string[]).includes(value)) {
    return value as OccurrenceStatus;
  }
  throw new Error('Unsupported occurrence status');
}
