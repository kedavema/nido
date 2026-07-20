import { describe, expect, it } from 'vitest';

import {
  categoryLabel,
  formatDayHeading,
  formatDecimalEs,
  formatFullLocalDate,
  formatMonthLabel,
  formatMonthQueryParam,
  formatMovementTimestamp,
  formatOccurredAtTime,
  formatPygMagnitude,
  formatRecentMovementDateLabel,
  formatSignedPygAmount,
  formatTransactionAmount,
  groupTransactionsByDay,
  monthFromLocalDate,
  monthLocalDateRange,
  previousLocalDate,
  shiftMonth,
  sumDailyNetBaseAmountPyg,
  todayLocalDate,
} from './movement-format';

const CATEGORY_ROOT = {
  id: 'root-1',
  householdId: 'h1',
  kind: 'EXPENSE',
  parentId: null,
  name: 'Alimentación',
  icon: 'restaurant',
  color: '#3E6B34',
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const CATEGORY_CHILD = {
  ...CATEGORY_ROOT,
  id: 'child-1',
  parentId: CATEGORY_ROOT.id,
  name: 'Supermercado',
} as const;

function transaction(overrides: {
  readonly localDate: string;
  readonly occurredAt: string;
  readonly type: 'EXPENSE' | 'INCOME';
  readonly baseAmountPyg: string;
}) {
  return overrides;
}

describe('formatPygMagnitude', () => {
  it('inserts thousand separators', () => {
    expect(formatPygMagnitude('386500')).toBe('386.500');
    expect(formatPygMagnitude('87500')).toBe('87.500');
    expect(formatPygMagnitude('9500000')).toBe('9.500.000');
    expect(formatPygMagnitude('500')).toBe('500');
    expect(formatPygMagnitude('0')).toBe('0');
  });
});

describe('formatTransactionAmount', () => {
  it('formats an expense with a minus sign', () => {
    expect(formatTransactionAmount({ type: 'EXPENSE', baseAmountPyg: '386500' })).toEqual({
      text: '−Gs. 386.500',
      isPositive: false,
    });
  });

  it('formats income with a plus sign', () => {
    expect(formatTransactionAmount({ type: 'INCOME', baseAmountPyg: '9500000' })).toEqual({
      text: '+Gs. 9.500.000',
      isPositive: true,
    });
  });
});

describe('sumDailyNetBaseAmountPyg', () => {
  it('sums expenses as negative and income as positive', () => {
    const total = sumDailyNetBaseAmountPyg([
      { type: 'EXPENSE', baseAmountPyg: '386500' },
      { type: 'EXPENSE', baseAmountPyg: '300000' },
      { type: 'EXPENSE', baseAmountPyg: '337365' },
      { type: 'EXPENSE', baseAmountPyg: '87500' },
    ]);
    expect(total).toBe(-1_111_365n);
  });

  it('stays precise beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = '999999999999999999'; // 18 nines: decimal(18,0) max
    const total = sumDailyNetBaseAmountPyg([{ type: 'INCOME', baseAmountPyg: huge }]);
    expect(total).toBe(BigInt(huge));
    expect(total.toString()).toBe(huge);
  });
});

describe('formatSignedPygAmount', () => {
  it('formats a negative net as a minus-signed amount', () => {
    expect(formatSignedPygAmount(-1_111_365n)).toEqual({
      text: '−Gs. 1.111.365',
      isPositive: false,
    });
  });

  it('formats a positive net as a plus-signed amount', () => {
    expect(formatSignedPygAmount(17_700_000n)).toEqual({
      text: '+Gs. 17.700.000',
      isPositive: true,
    });
  });

  it('treats zero as positive', () => {
    expect(formatSignedPygAmount(0n)).toEqual({ text: '+Gs. 0', isPositive: true });
  });
});

describe('formatDecimalEs', () => {
  it('formats with a Spanish decimal comma and no rounding', () => {
    expect(formatDecimalEs('45.90', 2)).toBe('45,90');
  });

  it('drops the fractional part when fractionDigits is 0', () => {
    expect(formatDecimalEs('7350.0000', 0)).toBe('7.350');
  });

  it('pads a missing fractional part with zeros', () => {
    expect(formatDecimalEs('45', 2)).toBe('45,00');
  });
});

describe('formatDayHeading', () => {
  it('labels the current day as HOY', () => {
    expect(formatDayHeading('2026-07-15', '2026-07-15')).toBe('HOY · MIÉ 15');
  });

  it('labels the previous day as AYER', () => {
    expect(formatDayHeading('2026-07-14', '2026-07-15')).toBe('AYER · MAR 14');
  });

  it('falls back to weekday, day, and month for older days', () => {
    expect(formatDayHeading('2026-07-01', '2026-07-15')).toBe('MIÉ 1 JUL');
  });

  it('handles the year boundary when computing "yesterday"', () => {
    expect(formatDayHeading('2025-12-31', '2026-01-01')).toBe('AYER · MIÉ 31');
  });
});

describe('previousLocalDate', () => {
  it('rolls back across a month boundary', () => {
    expect(previousLocalDate('2026-08-01')).toBe('2026-07-31');
  });

  it('rolls back across a year boundary', () => {
    expect(previousLocalDate('2026-01-01')).toBe('2025-12-31');
  });
});

describe('todayLocalDate', () => {
  it('returns a yyyy-MM-dd string', () => {
    expect(todayLocalDate(new Date('2026-07-15T12:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

describe('groupTransactionsByDay', () => {
  it('groups by localDate, newest day first, newest movement first within a day', () => {
    const groups = groupTransactionsByDay([
      transaction({
        localDate: '2026-07-14',
        occurredAt: '2026-07-14T12:00:00.000Z',
        type: 'EXPENSE',
        baseAmountPyg: '128000',
      }),
      transaction({
        localDate: '2026-07-15',
        occurredAt: '2026-07-15T09:00:00.000Z',
        type: 'EXPENSE',
        baseAmountPyg: '386500',
      }),
      transaction({
        localDate: '2026-07-15',
        occurredAt: '2026-07-15T18:00:00.000Z',
        type: 'EXPENSE',
        baseAmountPyg: '300000',
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.localDate).toBe('2026-07-15');
    expect(groups[0]?.transactions.map((t) => t.baseAmountPyg)).toEqual(['300000', '386500']);
    expect(groups[0]?.netBaseAmountPyg).toBe(-686_500n);
    expect(groups[1]?.localDate).toBe('2026-07-14');
  });
});

describe('categoryLabel', () => {
  const categories = [CATEGORY_ROOT, CATEGORY_CHILD];

  it('returns the plain name for a root category', () => {
    expect(categoryLabel(CATEGORY_ROOT.id, categories)).toBe('Alimentación');
  });

  it('joins parent and child names for a subcategory', () => {
    expect(categoryLabel(CATEGORY_CHILD.id, categories)).toBe('Alimentación · Supermercado');
  });

  it('returns undefined for an unknown category id', () => {
    expect(categoryLabel('missing', categories)).toBeUndefined();
  });
});

describe('formatFullLocalDate', () => {
  it('formats a lowercase weekday, day, month, and year', () => {
    expect(formatFullLocalDate('2026-07-15')).toBe('mié 15 jul 2026');
  });
});

describe('formatOccurredAtTime', () => {
  it('formats a 24h time in the given timezone', () => {
    expect(formatOccurredAtTime('2026-07-15T12:12:00.000Z', 'America/Asuncion')).toBe('9:12');
  });
});

describe('formatMovementTimestamp', () => {
  it('uses "hoy" for the current day', () => {
    expect(
      formatMovementTimestamp(
        { localDate: '2026-07-15', occurredAt: '2026-07-15T12:12:00.000Z' },
        '2026-07-15',
      ),
    ).toMatch(/^hoy, \d{1,2}:\d{2}$/u);
  });

  it('uses "ayer" for the previous day', () => {
    expect(
      formatMovementTimestamp(
        { localDate: '2026-07-14', occurredAt: '2026-07-14T12:12:00.000Z' },
        '2026-07-15',
      ),
    ).toMatch(/^ayer, \d{1,2}:\d{2}$/u);
  });

  it('uses the full date for older days', () => {
    expect(
      formatMovementTimestamp(
        { localDate: '2026-07-01', occurredAt: '2026-07-01T12:12:00.000Z' },
        '2026-07-15',
      ),
    ).toMatch(/^mié 1 jul 2026, \d{1,2}:\d{2}$/u);
  });
});

describe('month helpers', () => {
  it('derives a month value from a local date', () => {
    expect(monthFromLocalDate('2026-07-15')).toEqual({ year: 2026, month: 7 });
  });

  it('computes the inclusive local-date range for a month', () => {
    expect(monthLocalDateRange({ year: 2026, month: 7 })).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('handles a leap-year February', () => {
    expect(monthLocalDateRange({ year: 2028, month: 2 })).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('shifts forward across a year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('shifts backward across a year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('formats a month label in Spanish', () => {
    expect(formatMonthLabel({ year: 2026, month: 7 })).toBe('Julio 2026');
  });

  it('formats the yyyy-MM query param for reports/monthly-summary', () => {
    expect(formatMonthQueryParam({ year: 2026, month: 7 })).toBe('2026-07');
    expect(formatMonthQueryParam({ year: 2026, month: 1 })).toBe('2026-01');
  });
});

describe('formatRecentMovementDateLabel', () => {
  it('labels the current day as "hoy"', () => {
    expect(formatRecentMovementDateLabel('2026-07-15', '2026-07-15')).toBe('hoy');
  });

  it('labels the previous day as "ayer"', () => {
    expect(formatRecentMovementDateLabel('2026-07-14', '2026-07-15')).toBe('ayer');
  });

  it('falls back to a lowercase "d mmm" label for older days', () => {
    expect(formatRecentMovementDateLabel('2026-07-01', '2026-07-15')).toBe('1 jul');
  });
});
