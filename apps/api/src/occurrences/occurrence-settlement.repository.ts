import type { SupportedCurrencyCode } from '@nido/domain-types';

import type { TransactionRecord } from '../transactions/transaction.js';
import type { OccurrenceRecord, OccurrenceStatus } from './occurrence.js';

export const OCCURRENCE_SETTLEMENT_REPOSITORY = Symbol('OCCURRENCE_SETTLEMENT_REPOSITORY');

/** Effective settle input: every field overrides the value copied onto the occurrence at generation. */
export interface SettleOccurrenceInput {
  readonly householdId: string;
  readonly occurrenceId: string;
  readonly actorId: string;
  readonly amount?: string;
  readonly currency?: SupportedCurrencyCode;
  readonly fxRateToBase?: string | null;
  readonly paymentSourceId?: string | null;
  readonly settledAt?: Date;
}

export interface SkipOccurrenceInput {
  readonly householdId: string;
  readonly occurrenceId: string;
}

/** The occurrence does not exist in this household. */
export interface OccurrenceNotFoundResult {
  readonly kind: 'not_found';
}

/**
 * The occurrence is not in a state that can transition (settle requires PENDING/OVERDUE; a
 * SETTLED or SKIPPED occurrence can be neither settled again nor skipped). Carries the current
 * status so the service can build a stable conflict message.
 */
export interface OccurrenceNotTransitionableResult {
  readonly kind: 'not_transitionable';
  readonly status: OccurrenceStatus;
}

export interface OccurrenceSettledResult {
  readonly kind: 'settled';
  readonly transaction: TransactionRecord;
  readonly occurrence: OccurrenceRecord;
}

export interface OccurrenceSkippedResult {
  readonly kind: 'skipped';
  readonly occurrence: OccurrenceRecord;
}

export type SettleOccurrenceResult =
  OccurrenceNotFoundResult | OccurrenceNotTransitionableResult | OccurrenceSettledResult;

export type SkipOccurrenceResult =
  OccurrenceNotFoundResult | OccurrenceNotTransitionableResult | OccurrenceSkippedResult;

export interface OccurrenceSettlementRepository {
  /**
   * docs/system-design.md §10 "Pagar un gasto fijo", all seven steps in one SQL transaction:
   * locks the occurrence row (`SELECT ... FOR UPDATE`), validates it is still PENDING/OVERDUE,
   * creates the real Transaction with the actual amount (linked 1:1 back via
   * `source_occurrence_id`, origin RECURRING), marks the occurrence SETTLED, and returns both.
   * Because it all shares one transaction boundary, an occurrence can never end up SETTLED without
   * its transaction, nor a transaction created without its occurrence marked. Concurrent settles
   * of the same occurrence serialize on the row lock; the loser sees SETTLED and is rejected, and
   * the unique `source_occurrence_id` index is the final backstop against a double transaction.
   */
  settle(input: SettleOccurrenceInput): Promise<SettleOccurrenceResult>;

  /** Locks the occurrence, validates PENDING/OVERDUE, and marks it SKIPPED. Creates no transaction. */
  skip(input: SkipOccurrenceInput): Promise<SkipOccurrenceResult>;
}
