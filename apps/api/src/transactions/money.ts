import { BaseAmountPygSchema, type TransactionCurrency } from '@nido/contracts';

import { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

/**
 * decimal.js-light (the library backing Prisma's `Decimal`, see ADR 0007) rounds every
 * arithmetic result to the constructor's `precision` config (20 significant digits by
 * default) using its `rounding` mode. The largest contractual amount (16 integer digits + 2
 * decimals) times the largest contractual fx rate (14 integer digits + 4 decimals) can need up
 * to 36 significant digits to represent exactly, so relying on the default `Decimal` risks a
 * silent extra rounding step happening *inside* `times()`, before our own half-up rounding to
 * PYG runs — which would violate ADR 0001's "un único redondeo half-up" rule for large enough
 * inputs. `Decimal.clone()` returns an independent constructor with headroom instead of
 * mutating `Decimal.set(...)` on the shared class, which every other Prisma `Decimal` in the
 * process (and every concurrent request) would otherwise be affected by.
 */
const MoneyDecimal = Prisma.Decimal.clone({
  precision: 50,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});

const PYG_SCALE_REGEX = /^\d+$/u;
const USD_SCALE_REGEX = /^\d+(\.\d{1,2})?$/u;

/** The amount's decimal scale does not match its currency (PYG0 or USD2, per ADR 0001). */
export class AmountCurrencyScaleError extends Error {}

/** `fxRateToBase` is present for a PYG movement, or absent for a USD movement. */
export class FxRateRequirementError extends Error {}

/** The computed `baseAmountPyg` would exceed the `decimal(18,0)` column range. */
export class BaseAmountPygOverflowError extends Error {}

export interface AmountCurrencyConsistencyInput {
  readonly currency: TransactionCurrency;
  readonly amount: string;
  readonly fxRateToBase: string | null;
}

/**
 * Re-implements, on the server side, the same cross-field rule
 * `packages/contracts/src/transactions.ts` enforces via `superRefine` on create (currency
 * scale, and fxRateToBase required for USD / forbidden for PYG). That helper is not exported
 * from the contracts package, and — per the comment on `UpdateTransactionRequestSchema` — a
 * partial update payload alone cannot re-check this rule when only one of `currency`/`amount`
 * is present; the service merges the update with the persisted row into an effective state and
 * calls this before persisting.
 */
export function assertAmountCurrencyConsistency(input: AmountCurrencyConsistencyInput): void {
  const matchesScale =
    input.currency === 'PYG'
      ? PYG_SCALE_REGEX.test(input.amount)
      : USD_SCALE_REGEX.test(input.amount);
  if (!matchesScale) {
    throw new AmountCurrencyScaleError(
      input.currency === 'PYG'
        ? 'PYG amounts must be integral (scale 0)'
        : 'USD amounts must have at most 2 decimals (scale 2)',
    );
  }

  const hasFxRate = input.fxRateToBase !== null;
  if (input.currency === 'USD' && !hasFxRate) {
    throw new FxRateRequirementError('fxRateToBase is required for USD transactions');
  }
  if (input.currency === 'PYG' && hasFxRate) {
    throw new FxRateRequirementError('fxRateToBase must be absent for PYG transactions');
  }
}

export interface ComputeBaseAmountPygInput {
  readonly currency: TransactionCurrency;
  readonly amount: string;
  readonly fxRateToBase: string | null;
}

/**
 * ADR 0001: for PYG, `baseAmountPyg` is the amount itself (already integral). For USD, it is
 * `amount × fxRateToBase` with a single half-up rounding step to the nearest integral PYG
 * (e.g. `10.01 × 7350 = 73573.50` → `73574`). Rejects, with a stable domain error, a result
 * that would overflow the `decimal(18,0)` column instead of truncating/wrapping it.
 *
 * Callers must run `assertAmountCurrencyConsistency` on the same input first — this function
 * assumes that invariant already holds (fxRateToBase present for USD, absent for PYG) and
 * throws a generic error if it does not, since that indicates a caller bug rather than bad
 * client input.
 */
export function computeBaseAmountPyg(input: ComputeBaseAmountPygInput): Decimal {
  if (input.currency === 'PYG') {
    return toOverflowCheckedDecimal(new MoneyDecimal(input.amount).toFixed(0));
  }

  if (input.fxRateToBase === null) {
    throw new Error('USD transactions require fxRateToBase to compute baseAmountPyg');
  }

  const converted = new MoneyDecimal(input.amount)
    .times(new MoneyDecimal(input.fxRateToBase))
    .toDecimalPlaces(0, MoneyDecimal.ROUND_HALF_UP);
  return toOverflowCheckedDecimal(converted.toFixed(0));
}

function toOverflowCheckedDecimal(baseAmountPygText: string): Decimal {
  if (!BaseAmountPygSchema.safeParse(baseAmountPygText).success) {
    throw new BaseAmountPygOverflowError('Computed baseAmountPyg exceeds the decimal(18,0) range');
  }
  // Re-parsed with the standard (non-cloned) `Decimal` so callers outside this module only
  // ever see the one `Decimal` type used by the rest of the transactions module and Prisma.
  return new Prisma.Decimal(baseAmountPygText);
}
