import { describe, expect, it } from 'vitest';

import {
  AmountCurrencyScaleError,
  assertAmountCurrencyConsistency,
  BaseAmountPygOverflowError,
  computeBaseAmountPyg,
  FxRateRequirementError,
} from '../src/transactions/money.js';

describe('assertAmountCurrencyConsistency', () => {
  it('accepts an integral PYG amount without an fxRateToBase', () => {
    expect(() => {
      assertAmountCurrencyConsistency({ currency: 'PYG', amount: '150000', fxRateToBase: null });
    }).not.toThrow();
  });

  it('accepts a USD amount with up to two decimals and an fxRateToBase', () => {
    expect(() => {
      assertAmountCurrencyConsistency({ currency: 'USD', amount: '10.01', fxRateToBase: '7350' });
    }).not.toThrow();
  });

  it('rejects a PYG amount with decimals', () => {
    expect(() => {
      assertAmountCurrencyConsistency({ currency: 'PYG', amount: '150000.50', fxRateToBase: null });
    }).toThrow(AmountCurrencyScaleError);
  });

  it('rejects a USD amount with more than two decimals', () => {
    expect(() => {
      assertAmountCurrencyConsistency({ currency: 'USD', amount: '10.019', fxRateToBase: '7350' });
    }).toThrow(AmountCurrencyScaleError);
  });

  it('rejects a USD amount missing fxRateToBase', () => {
    expect(() => {
      assertAmountCurrencyConsistency({ currency: 'USD', amount: '10.01', fxRateToBase: null });
    }).toThrow(FxRateRequirementError);
  });

  it('rejects a PYG amount carrying an fxRateToBase', () => {
    expect(() => {
      assertAmountCurrencyConsistency({ currency: 'PYG', amount: '150000', fxRateToBase: '7350' });
    }).toThrow(FxRateRequirementError);
  });
});

describe('computeBaseAmountPyg', () => {
  it('passes an integral PYG amount through unchanged', () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'PYG',
      amount: '150000',
      fxRateToBase: null,
    });
    expect(baseAmountPyg.toFixed(0)).toBe('150000');
  });

  it("converts USD with ADR 0001's worked example (10.01 x 7350 = 73573.50 -> 73574)", () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'USD',
      amount: '10.01',
      fxRateToBase: '7350',
    });
    expect(baseAmountPyg.toFixed(0)).toBe('73574');
  });

  it('rounds a lower half-up boundary down (73573.49)', () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'USD',
      amount: '10.0099',
      fxRateToBase: '7350',
    });
    // 10.0099 * 7350 = 73572.765 -> rounds to 73573, not the .50 boundary; this exercises a
    // plain non-boundary fractional result rather than exact half-up.
    expect(baseAmountPyg.toFixed(0)).toBe('73573');
  });

  it('rounds exactly .5 half-up, not to even (banker rounding would keep this at 2)', () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'USD',
      amount: '0.25',
      fxRateToBase: '10',
    });
    // 0.25 * 10 = 2.5 -> half-up rounds to 3; ROUND_HALF_EVEN would round to 2.
    expect(baseAmountPyg.toFixed(0)).toBe('3');
  });

  it('rounds down when strictly below the half boundary', () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'USD',
      amount: '0.24',
      fxRateToBase: '10',
    });
    // 0.24 * 10 = 2.4 -> rounds down to 2.
    expect(baseAmountPyg.toFixed(0)).toBe('2');
  });

  it('rounds up when strictly above the half boundary', () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'USD',
      amount: '0.26',
      fxRateToBase: '10',
    });
    // 0.26 * 10 = 2.6 -> rounds up to 3.
    expect(baseAmountPyg.toFixed(0)).toBe('3');
  });

  it('accepts the largest baseAmountPyg the decimal(18,0) column allows', () => {
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'PYG',
      amount: '999999999999999999',
      fxRateToBase: null,
    });
    expect(baseAmountPyg.toFixed(0)).toBe('999999999999999999');
  });

  it('rejects a converted amount that would overflow the decimal(18,0) column', () => {
    expect(() =>
      computeBaseAmountPyg({
        currency: 'USD',
        amount: '9999999999999999.99',
        fxRateToBase: '99999999999999.9999',
      }),
    ).toThrow(BaseAmountPygOverflowError);
  });

  it('does not silently double-round a large product (regression: shared-precision Decimal gives 99500000999999901, not 900)', () => {
    // amount x fxRate here has a 17-digit integer part, so decimal.js-light's default global
    // `Decimal` (20 significant digits of precision) rounds the intermediate product *inside*
    // `times()` before our half-up rounding to an integer PYG runs. That silently produces
    // "...901" instead of the exact "...900" (verified independently via BigInt on the
    // decimal-shifted integer operands: 999999999999999 * 99500001 / 10_000, half-up). This
    // pins the correct value so a regression back to the unclosed default `Decimal` (e.g.
    // computing with `new Decimal(...)` instead of the module's precision-50 clone) is caught.
    const baseAmountPyg = computeBaseAmountPyg({
      currency: 'USD',
      amount: '9999999999999.99',
      fxRateToBase: '9950.0001',
    });
    expect(baseAmountPyg.toFixed(0)).toBe('99500000999999900');
  });
});
