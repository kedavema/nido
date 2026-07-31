import { formatPygMagnitude } from './movement-format';

export function formatBudgetPyg(value: string): string {
  const amount = BigInt(value);
  const magnitude = (amount < 0n ? -amount : amount).toString();
  return `${amount < 0n ? '−' : ''}Gs. ${formatPygMagnitude(magnitude)}`;
}

/** Percentage as hundredths of one percent, rounded half-up without floating point. */
export function budgetCategoryBasisPoints(spent: bigint, limit: bigint): bigint {
  if (limit === 0n) {
    return spent === 0n ? 0n : 10_001n;
  }
  return (spent * 10_000n + limit / 2n) / limit;
}

export function formatBudgetBasisPoints(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0').replace(/0+$/u, '');
  return fraction === '' ? whole.toString() : `${whole.toString()},${fraction}`;
}
