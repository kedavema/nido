import { Inject, Injectable } from '@nestjs/common';
import type { ListOccurrencesQuery, ListOccurrencesResponse, Occurrence } from '@nido/contracts';

import { CLOCK, type Clock } from '../common/clock.js';
import type { HouseholdAccess } from '../households/household.js';
import { truncateToUtcDate } from '../recurring-items/occurrence-generation.js';
import { formatLocalDate, parseLocalDate } from '../transactions/local-date.js';
import type { OccurrenceRecord } from './occurrence.js';
import {
  OCCURRENCE_SWEEP_REPOSITORY,
  type OccurrenceSweepRepository,
} from './occurrence-sweep.repository.js';
import { OCCURRENCES_REPOSITORY, type OccurrencesRepository } from './occurrences.repository.js';

@Injectable()
export class OccurrencesService {
  constructor(
    @Inject(OCCURRENCES_REPOSITORY)
    private readonly occurrencesRepository: OccurrencesRepository,
    @Inject(OCCURRENCE_SWEEP_REPOSITORY)
    private readonly sweepRepository: OccurrenceSweepRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async listOccurrences(
    access: HouseholdAccess,
    query: ListOccurrencesQuery,
  ): Promise<ListOccurrencesResponse> {
    // Lazy-on-read (ADR 0009 point 3): reading occurrences is "una apertura autenticada", so it is
    // where the once-per-day sweep is triggered. The sweep no-ops cheaply when already run today,
    // and generates/marks-overdue under an advisory lock otherwise, so the list below always
    // reflects a freshly-swept horizon without depending on the (not-yet-built, M7) scheduler.
    await this.sweepRepository.sweep(access.householdId, truncateToUtcDate(this.clock.now()));

    const occurrences = await this.occurrencesRepository.list(access.householdId, {
      ...(query.status !== undefined ? { statuses: query.status } : {}),
      ...(query.from !== undefined ? { from: parseLocalDate(query.from) } : {}),
      ...(query.to !== undefined ? { to: parseLocalDate(query.to) } : {}),
    });
    return { occurrences: occurrences.map(toOccurrence) };
  }
}

function toOccurrence(record: OccurrenceRecord): Occurrence {
  return {
    id: record.id,
    recurringItemId: record.recurringItemId,
    householdId: record.householdId,
    dueDate: formatLocalDate(record.dueDate),
    amount: record.amount.toFixed(record.currency === 'PYG' ? 0 : 2),
    currency: record.currency,
    fxRateToBase: record.fxRateToBase === null ? null : record.fxRateToBase.toString(),
    responsibleUserId: record.responsibleUserId,
    status: record.status,
    settledAt: record.settledAt === null ? null : record.settledAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
