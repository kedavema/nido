import { describe, expect, it } from 'vitest';

import { receivedPercentage, sumExpectedPyg, sumSettledPyg } from './ingresos-format';

describe('sumSettledPyg', () => {
  it('sums SETTLED PYG occurrences only', () => {
    const total = sumSettledPyg([
      { status: 'SETTLED', currency: 'PYG', amount: '9500000' },
      { status: 'SETTLED', currency: 'PYG', amount: '8200000' },
      { status: 'PENDING', currency: 'PYG', amount: '2200000' },
      { status: 'SKIPPED', currency: 'PYG', amount: '100000' },
      { status: 'SETTLED', currency: 'USD', amount: '100.00' },
    ]);
    expect(total).toBe('17700000');
  });

  it('is 0 when nothing is settled', () => {
    expect(sumSettledPyg([{ status: 'PENDING', currency: 'PYG', amount: '2200000' }])).toBe('0');
  });
});

describe('sumExpectedPyg', () => {
  it('sums every non-SKIPPED PYG occurrence (received plus pending)', () => {
    const total = sumExpectedPyg([
      { status: 'SETTLED', currency: 'PYG', amount: '9500000' },
      { status: 'SETTLED', currency: 'PYG', amount: '8200000' },
      { status: 'PENDING', currency: 'PYG', amount: '2200000' },
      { status: 'SKIPPED', currency: 'PYG', amount: '100000' },
      { status: 'PENDING', currency: 'USD', amount: '100.00' },
    ]);
    expect(total).toBe('19900000');
  });
});

describe('receivedPercentage', () => {
  it('reads whole-percent received over expected, rounded to nearest', () => {
    expect(receivedPercentage('17700000', '19900000')).toBe(89);
    expect(receivedPercentage('19900000', '19900000')).toBe(100);
  });

  it('clamps to 0..100 and avoids divide-by-zero', () => {
    expect(receivedPercentage('0', '0')).toBe(0);
    expect(receivedPercentage('5000000', '0')).toBe(0);
    expect(receivedPercentage('25000000', '19900000')).toBe(100);
  });
});
