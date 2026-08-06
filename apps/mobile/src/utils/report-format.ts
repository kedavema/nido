import { formatBudgetPyg } from './budget-overview';

/** Largest non-negative decimal-string amount, without crossing JavaScript's safe integer limit. */
export function largestReportAmount(values: readonly string[]): string {
  return values
    .reduce((largest, value) => {
      const amount = BigInt(value);
      return amount > largest ? amount : largest;
    }, 0n)
    .toString();
}

/** Width percentage rounded half-up to two decimals, using bigint for the ratio. */
export function reportBarWidth(value: string, maximum: string): `${number}%` {
  const amount = BigInt(value);
  const max = BigInt(maximum);
  if (amount <= 0n || max <= 0n) return '0%';
  const basisPoints = ((amount > max ? max : amount) * 10_000n + max / 2n) / max;
  return `${(Number(basisPoints) / 100).toString()}%` as `${number}%`;
}

export function formatReportPercentage(value: number): string {
  const text = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2).replace(/0$/u, '');
  return text.replace('.', ',');
}

export function formatSignedReportPyg(value: string): string {
  return BigInt(value) > 0n ? `+${formatBudgetPyg(value)}` : formatBudgetPyg(value);
}

/** What a category's spending looks like against its own budget limit. */
export interface CategoryLimitProgress {
  readonly width: `${number}%`;
  /** Absolute distance to the limit; read together with `isOver`. */
  readonly remainingPyg: string;
  readonly isOver: boolean;
}

/**
 * A category bar used to measure its share of the largest category, which made the top row always
 * 100 % full — tautological with one category, and with several it repeated what the ordering
 * already said. Measured against the category's own limit it answers the question the screen is
 * for: how much is left.
 *
 * Returns `undefined` when there is no limit to measure against. A category can carry spend with
 * no allocation for the month, and the caller must render the amount without a bar rather than
 * hide the row — hiding it would report a subset of spending as if it were the total.
 */
export function categoryLimitProgress(
  spentPyg: string,
  limitPyg: string | undefined,
): CategoryLimitProgress | undefined {
  if (limitPyg === undefined) return undefined;
  const limit = BigInt(limitPyg);
  if (limit <= 0n) return undefined;

  const spent = BigInt(spentPyg);
  const difference = limit - spent;
  return {
    width: reportBarWidth(spentPyg, limitPyg),
    remainingPyg: (difference < 0n ? -difference : difference).toString(),
    isOver: difference < 0n,
  };
}
