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
