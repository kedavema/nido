import { calculateOccurrenceDueDate, type FrequencyKind } from '@nido/domain-types';

/** ADR 0009: occurrences are generated with 12 months of anticipation from `first_due_date`. */
const HORIZON_MONTHS = 12;

/**
 * Defensive upper bound on how many due dates a single schedule computation can produce. Given
 * the contract's validated `intervalMonths >= 1` this loop always terminates well before this
 * many iterations (13 for MONTHLY/EVERY_N_MONTHS-by-1, far fewer otherwise) — this is only a
 * backstop against an unforeseen input turning the loop unbounded.
 */
const MAX_ITERATIONS = 400;

export interface OccurrenceScheduleInput {
  readonly firstDueDate: Date;
  readonly frequency: FrequencyKind;
  readonly intervalMonths: number | null;
  readonly endDate: Date | null;
}

/**
 * Computes every occurrence due date for a recurring-item rule within the ADR 0009 12-month
 * horizon (`first_due_date` .. `first_due_date + 12 months`, both inclusive), additionally capped
 * by `endDate` when set. Every date — including the horizon boundary itself — is computed with
 * `calculateOccurrenceDueDate` (the accepted per-frequency date math from `@nido/domain-types`)
 * rather than reimplementing month arithmetic: the boundary is
 * `calculateOccurrenceDueDate(firstDueDate, 'MONTHLY', 12, null)` because "12 calendar months
 * forward, day clamped" is exactly what MONTHLY at index 12 already means.
 */
export function generateOccurrenceSchedule(input: OccurrenceScheduleInput): Date[] {
  const horizonEnd = calculateOccurrenceDueDate(
    input.firstDueDate,
    'MONTHLY',
    HORIZON_MONTHS,
    null,
  );
  const upperBound =
    input.endDate !== null && input.endDate.getTime() < horizonEnd.getTime()
      ? input.endDate
      : horizonEnd;

  const dueDates: Date[] = [];
  for (let index = 0; index <= MAX_ITERATIONS; index += 1) {
    if (input.frequency === 'ONE_TIME' && index > 0) {
      break;
    }

    const dueDate = calculateOccurrenceDueDate(
      input.firstDueDate,
      input.frequency,
      index,
      input.intervalMonths,
    );
    if (dueDate.getTime() > upperBound.getTime()) {
      break;
    }

    dueDates.push(dueDate);

    if (input.frequency === 'ONE_TIME') {
      break;
    }
  }
  return dueDates;
}

/** Truncates a `Date` to UTC-midnight of its calendar day, matching the `@db.Date` convention. */
export function truncateToUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
