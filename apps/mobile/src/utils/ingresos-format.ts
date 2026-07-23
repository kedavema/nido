import type { Occurrence } from '@nido/contracts';

// ING-01 hero maths. The Fijos hero sums what is *still owed* (`sumPendingEstimatedPyg`); the
// Ingresos hero instead needs what has *already been received* this month and what was expected in
// total, to drive the "RECIBIDOS +Gs. X … de Gs. Y esperados · N%" progress line. These live apart
// from `fijos-format.ts` because they are income-list-specific and have no expense-side surface.

/** Integer digits of a wire decimal amount (PYG is scale 0), ignoring any fractional part. */
function integerDigits(amount: string): string {
  return amount.split('.')[0] ?? '0';
}

/**
 * Total already received this month — the sum of every SETTLED PYG occurrence's real amount, as a
 * decimal(18,0) string (BigInt, since it can exceed `Number.MAX_SAFE_INTEGER`). USD occurrences are
 * excluded for the same reason as the Fijos total: one Gs. figure can't mix currencies.
 */
export function sumSettledPyg(
  occurrences: readonly Pick<Occurrence, 'status' | 'currency' | 'amount'>[],
): string {
  const total = occurrences.reduce((accumulator, occurrence) => {
    if (occurrence.status !== 'SETTLED' || occurrence.currency !== 'PYG') {
      return accumulator;
    }
    return accumulator + BigInt(integerDigits(occurrence.amount));
  }, 0n);
  return total.toString();
}

/**
 * Total expected this month — every non-SKIPPED PYG occurrence (already received *plus* still
 * pending), as a decimal(18,0) string. This is the denominator of the ING-01 "de Gs. Y esperados"
 * figure and the progress bar's full width.
 */
export function sumExpectedPyg(
  occurrences: readonly Pick<Occurrence, 'status' | 'currency' | 'amount'>[],
): string {
  const total = occurrences.reduce((accumulator, occurrence) => {
    if (occurrence.status === 'SKIPPED' || occurrence.currency !== 'PYG') {
      return accumulator;
    }
    return accumulator + BigInt(integerDigits(occurrence.amount));
  }, 0n);
  return total.toString();
}

/**
 * Whole-percent received / expected, rounded to the nearest integer and clamped to 0–100. Returns 0
 * when nothing is expected (avoids a divide-by-zero) so the ING-01 progress bar reads empty rather
 * than NaN on an all-zero month. Number division is safe here: PYG magnitudes stay far below
 * `Number.MAX_SAFE_INTEGER`, and only the ratio — not the raw total — feeds this figure.
 */
export function receivedPercentage(received: string, expected: string): number {
  const expectedNumber = Number(expected);
  if (expectedNumber <= 0) return 0;
  const percent = Math.round((Number(received) / expectedNumber) * 100);
  return Math.max(0, Math.min(100, percent));
}
