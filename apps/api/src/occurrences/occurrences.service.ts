import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ListOccurrencesQuery,
  ListOccurrencesResponse,
  Occurrence,
  SettleOccurrenceRequest,
  SettleOccurrenceResponse,
  SkipOccurrenceResponse,
} from '@nido/contracts';

import { CLOCK, type Clock } from '../common/clock.js';
import type { HouseholdAccess } from '../households/household.js';
import { truncateToUtcDate } from '../recurring-items/occurrence-generation.js';
import { formatLocalDate, parseLocalDate } from '../transactions/local-date.js';
import { toTransaction } from '../transactions/transactions.service.js';
import type { OccurrenceRecord } from './occurrence.js';
import {
  OCCURRENCE_SETTLEMENT_REPOSITORY,
  type OccurrenceSettlementRepository,
} from './occurrence-settlement.repository.js';
import {
  OCCURRENCE_SWEEP_REPOSITORY,
  type OccurrenceSweepRepository,
} from './occurrence-sweep.repository.js';
import { OCCURRENCES_REPOSITORY, type OccurrencesRepository } from './occurrences.repository.js';

const OCCURRENCE_UNAVAILABLE = 'Occurrence is unavailable';

@Injectable()
export class OccurrencesService {
  constructor(
    @Inject(OCCURRENCES_REPOSITORY)
    private readonly occurrencesRepository: OccurrencesRepository,
    @Inject(OCCURRENCE_SWEEP_REPOSITORY)
    private readonly sweepRepository: OccurrenceSweepRepository,
    @Inject(OCCURRENCE_SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: OccurrenceSettlementRepository,
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

  async settleOccurrence(
    access: HouseholdAccess,
    occurrenceId: string,
    request: SettleOccurrenceRequest,
  ): Promise<SettleOccurrenceResponse> {
    const result = await this.settlementRepository.settle({
      householdId: access.householdId,
      occurrenceId,
      actorId: access.actorId,
      ...(request.amount !== undefined ? { amount: request.amount } : {}),
      ...(request.currency !== undefined ? { currency: request.currency } : {}),
      ...(request.fxRateToBase !== undefined ? { fxRateToBase: request.fxRateToBase } : {}),
      ...(request.paymentSourceId !== undefined
        ? { paymentSourceId: request.paymentSourceId }
        : {}),
      ...(request.settledAt !== undefined ? { settledAt: new Date(request.settledAt) } : {}),
    });

    if (result.kind === 'not_found') {
      throw new NotFoundException(OCCURRENCE_UNAVAILABLE);
    }
    if (result.kind === 'not_transitionable') {
      // A SETTLED/SKIPPED occurrence cannot be settled again — a conflict, not a not-found.
      throw new ConflictException(`Occurrence cannot be settled while it is ${result.status}`);
    }
    return {
      transaction: toTransaction(result.transaction),
      occurrence: toOccurrence(result.occurrence),
    };
  }

  async skipOccurrence(
    access: HouseholdAccess,
    occurrenceId: string,
  ): Promise<SkipOccurrenceResponse> {
    const result = await this.settlementRepository.skip({
      householdId: access.householdId,
      occurrenceId,
    });

    if (result.kind === 'not_found') {
      throw new NotFoundException(OCCURRENCE_UNAVAILABLE);
    }
    if (result.kind === 'not_transitionable') {
      throw new ConflictException(`Occurrence cannot be skipped while it is ${result.status}`);
    }
    return { occurrence: toOccurrence(result.occurrence) };
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
