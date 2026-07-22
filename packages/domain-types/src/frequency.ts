import type { FrequencyKind } from './index.js';

/**
 * Adds a number of calendar months to a date, clamping the day to the last
 * calendar day of the destination month when the original day doesn't exist
 * there (e.g. day 31 landing in a 30-day month, or Feb 29 landing in a
 * non-leap February).
 *
 * Operates in UTC so the result doesn't shift across local time zones.
 */
function addMonthsClamped(date: Date, monthsToAdd: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

/**
 * Calculates the due date of the Nth occurrence (0-based) of a recurring
 * item, per docs/system-design.md §6.4: dates are calculated forward from
 * `firstDueDate`; if the target day doesn't exist in the destination month
 * (e.g. day 31 in February), the month's last calendar day is used instead.
 *
 * `occurrenceIndex` is 0-based: index 0 always returns `firstDueDate` itself
 * (normalized to a date-only UTC value), regardless of frequency.
 *
 * `intervalMonths` is required (and must be a positive integer) only for
 * `EVERY_N_MONTHS`; it's ignored for every other frequency.
 */
export function calculateOccurrenceDueDate(
  firstDueDate: Date,
  frequency: FrequencyKind,
  occurrenceIndex: number,
  intervalMonths?: number | null,
): Date {
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
    throw new RangeError('occurrenceIndex must be a non-negative integer');
  }

  if (occurrenceIndex === 0) {
    return new Date(
      Date.UTC(
        firstDueDate.getUTCFullYear(),
        firstDueDate.getUTCMonth(),
        firstDueDate.getUTCDate(),
      ),
    );
  }

  switch (frequency) {
    case 'ONE_TIME':
      throw new RangeError('ONE_TIME frequency only has a single occurrence (index 0)');
    case 'MONTHLY':
      return addMonthsClamped(firstDueDate, occurrenceIndex);
    case 'YEARLY':
      return addMonthsClamped(firstDueDate, occurrenceIndex * 12);
    case 'EVERY_N_MONTHS': {
      if (
        typeof intervalMonths !== 'number' ||
        !Number.isInteger(intervalMonths) ||
        intervalMonths < 1
      ) {
        throw new RangeError('EVERY_N_MONTHS frequency requires a positive integer intervalMonths');
      }
      return addMonthsClamped(firstDueDate, occurrenceIndex * intervalMonths);
    }
    default: {
      const exhaustiveCheck: never = frequency;
      throw new RangeError(`Unsupported frequency: ${String(exhaustiveCheck)}`);
    }
  }
}
