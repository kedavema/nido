import { Injectable } from '@nestjs/common';
import { SUPPORTED_CURRENCY_CODES, type SupportedCurrencyCode } from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import {
  OCCURRENCE_STATUSES,
  type OccurrenceListFilters,
  type OccurrenceRecord,
} from './occurrence.js';
import type { OccurrencesRepository } from './occurrences.repository.js';

@Injectable()
export class PrismaOccurrencesRepository implements OccurrencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    householdId: string,
    filters: OccurrenceListFilters,
  ): Promise<readonly OccurrenceRecord[]> {
    const occurrences = await this.prisma.occurrence.findMany({
      where: {
        householdId,
        ...(filters.statuses !== undefined && filters.statuses.length > 0
          ? { status: { in: [...filters.statuses] } }
          : {}),
        ...(filters.from !== undefined || filters.to !== undefined
          ? {
              dueDate: {
                ...(filters.from !== undefined ? { gte: filters.from } : {}),
                ...(filters.to !== undefined ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
    return occurrences.map(toOccurrenceRecord);
  }
}

function toOccurrenceRecord(occurrence: {
  readonly id: string;
  readonly recurringItemId: string;
  readonly householdId: string;
  readonly dueDate: Date;
  readonly amount: OccurrenceRecord['amount'];
  readonly currency: string;
  readonly fxRateToBase: OccurrenceRecord['fxRateToBase'];
  readonly responsibleUserId: string | null;
  readonly status: string;
  readonly settledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): OccurrenceRecord {
  return {
    id: occurrence.id,
    recurringItemId: occurrence.recurringItemId,
    householdId: occurrence.householdId,
    dueDate: occurrence.dueDate,
    amount: occurrence.amount,
    currency: toSupportedCurrencyCode(occurrence.currency),
    fxRateToBase: occurrence.fxRateToBase,
    responsibleUserId: occurrence.responsibleUserId,
    status: toOccurrenceStatus(occurrence.status),
    settledAt: occurrence.settledAt,
    createdAt: occurrence.createdAt,
    updatedAt: occurrence.updatedAt,
  };
}

function toSupportedCurrencyCode(value: string): SupportedCurrencyCode {
  if ((SUPPORTED_CURRENCY_CODES as readonly string[]).includes(value)) {
    return value as SupportedCurrencyCode;
  }
  throw new Error('Unsupported occurrence currency');
}

function toOccurrenceStatus(value: string): OccurrenceRecord['status'] {
  if ((OCCURRENCE_STATUSES as readonly string[]).includes(value)) {
    return value as OccurrenceRecord['status'];
  }
  throw new Error('Unsupported occurrence status');
}
