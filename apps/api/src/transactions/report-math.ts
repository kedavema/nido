import { Prisma } from '../generated/prisma/client.js';

/** Percentage rounded half-up to two decimals without converting money operands to number. */
export function reportPercentage(amount: Prisma.Decimal, total: Prisma.Decimal): number {
  if (total.isZero()) return 0;
  return amount
    .dividedBy(total)
    .times(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}
