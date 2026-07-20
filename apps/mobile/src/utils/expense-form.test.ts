import { describe, expect, it } from 'vitest';

import {
  amountToWireDecimal,
  favoritePaymentSourceIds,
  formatAmountDisplay,
  isValidLocalDateString,
  localDateToOccurredAt,
  mostRecentUsdRate,
  previewUsdToBasePyg,
  recentRootCategoryIds,
  sanitizeAmountInput,
  sanitizePygAmountInput,
  sanitizeUsdAmountInput,
  shiftLocalDate,
} from './expense-form';

function category(overrides: {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind?: 'EXPENSE' | 'INCOME';
  readonly isActive?: boolean;
}) {
  return {
    id: overrides.id,
    householdId: 'h1',
    kind: overrides.kind ?? 'EXPENSE',
    parentId: overrides.parentId,
    name: overrides.id,
    icon: 'tag',
    color: '#111111',
    sortOrder: 0,
    isActive: overrides.isActive ?? true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as const;
}

describe('shiftLocalDate', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftLocalDate('2026-07-15', -90)).toBe('2026-04-16');
    expect(shiftLocalDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftLocalDate('2026-01-01', 31)).toBe('2026-02-01');
  });
});

describe('localDateToOccurredAt', () => {
  it('uses the real current instant when the picked date is today', () => {
    const now = () => new Date('2026-07-15T21:04:00.000Z');
    expect(localDateToOccurredAt('2026-07-15', '2026-07-15', now)).toBe('2026-07-15T21:04:00.000Z');
  });

  it('pins backdated entries to midday UTC so the server resolves the same calendar date', () => {
    expect(localDateToOccurredAt('2026-07-11', '2026-07-15')).toBe('2026-07-11T15:00:00.000Z');
  });
});

describe('sanitizePygAmountInput / sanitizeUsdAmountInput', () => {
  it('keeps digits only for PYG and strips leading zeros', () => {
    expect(sanitizePygAmountInput('386.500')).toBe('386500');
    expect(sanitizePygAmountInput('0042')).toBe('42');
    expect(sanitizePygAmountInput('')).toBe('');
  });

  it('allows a single comma and caps USD fraction digits at 2', () => {
    expect(sanitizeUsdAmountInput('45,905')).toBe('45,90');
    expect(sanitizeUsdAmountInput('4,5,9')).toBe('4,59');
    expect(sanitizeUsdAmountInput('45')).toBe('45');
    expect(sanitizeUsdAmountInput(',9')).toBe('0,9');
  });

  it('dispatches by currency', () => {
    expect(sanitizeAmountInput('45,90', 'PYG')).toBe('4590');
    expect(sanitizeAmountInput('45,90', 'USD')).toBe('45,90');
  });
});

describe('formatAmountDisplay / amountToWireDecimal', () => {
  it('groups thousands for PYG and keeps the comma for USD', () => {
    expect(formatAmountDisplay('386500', 'PYG')).toBe('386.500');
    expect(formatAmountDisplay('4590', 'USD')).toBe('4.590'); // note: sanitized value only, no comma present
    expect(formatAmountDisplay('45,9', 'USD')).toBe('45,9');
  });

  it('converts the sanitized display value to the contract decimal-string wire format', () => {
    expect(amountToWireDecimal('386500', 'PYG')).toBe('386500');
    expect(amountToWireDecimal('45,90', 'USD')).toBe('45.90');
    expect(amountToWireDecimal('45', 'USD')).toBe('45');
  });
});

describe('previewUsdToBasePyg', () => {
  it('matches the GAS-02 worked example exactly', () => {
    expect(previewUsdToBasePyg('45.90', '7350')).toBe('337365');
  });

  it('rounds half-up, matching ADR 0001', () => {
    // 45.91 * 7350 = 337438.5 -> rounds up to 337439
    expect(previewUsdToBasePyg('45.91', '7350')).toBe('337439');
    // 45.90 * 7350.0004 = 337365.01836 -> rounds down to 337365
    expect(previewUsdToBasePyg('45.90', '7350.0004')).toBe('337365');
  });

  it('handles zero amounts', () => {
    expect(previewUsdToBasePyg('0', '7350')).toBe('0');
  });
});

describe('mostRecentUsdRate', () => {
  it('returns the fx rate of the transaction with the latest occurredAt', () => {
    const result = mostRecentUsdRate([
      {
        currency: 'PYG',
        fxRateToBase: null,
        occurredAt: '2026-07-14T10:00:00.000Z',
        localDate: '2026-07-14',
      },
      {
        currency: 'USD',
        fxRateToBase: '7200',
        occurredAt: '2026-07-10T10:00:00.000Z',
        localDate: '2026-07-10',
      },
      {
        currency: 'USD',
        fxRateToBase: '7350',
        occurredAt: '2026-07-11T10:00:00.000Z',
        localDate: '2026-07-11',
      },
    ]);
    expect(result).toEqual({ fxRateToBase: '7350', localDate: '2026-07-11' });
  });

  it('returns undefined when there are no USD transactions', () => {
    expect(
      mostRecentUsdRate([
        {
          currency: 'PYG',
          fxRateToBase: null,
          occurredAt: '2026-07-14T10:00:00.000Z',
          localDate: '2026-07-14',
        },
      ]),
    ).toBeUndefined();
  });
});

describe('recentRootCategoryIds', () => {
  const categories = [
    category({ id: 'alimentacion', parentId: null }),
    category({ id: 'supermercado', parentId: 'alimentacion' }),
    category({ id: 'transporte', parentId: null }),
    category({ id: 'salud', parentId: null }),
    category({ id: 'archivada', parentId: null, isActive: false }),
    category({ id: 'ingreso-root', parentId: null, kind: 'INCOME' }),
  ];

  it('ranks root categories by frequency within the recency window, attributing subcategory usage to the root', () => {
    const today = '2026-07-15';
    const transactions = [
      { categoryId: 'supermercado', localDate: '2026-07-14' },
      { categoryId: 'alimentacion', localDate: '2026-07-01' },
      { categoryId: 'transporte', localDate: '2026-07-10' },
      { categoryId: 'transporte', localDate: '2026-07-09' },
      { categoryId: 'transporte', localDate: '2026-07-08' },
      { categoryId: 'salud', localDate: '2025-01-01' }, // outside the 90-day window
    ];
    expect(recentRootCategoryIds(transactions, categories, 'EXPENSE', today)).toEqual([
      'transporte',
      'alimentacion',
    ]);
  });

  it('excludes archived categories and categories of the wrong kind', () => {
    const today = '2026-07-15';
    const transactions = [
      { categoryId: 'archivada', localDate: '2026-07-14' },
      { categoryId: 'ingreso-root', localDate: '2026-07-14' },
    ];
    expect(recentRootCategoryIds(transactions, categories, 'EXPENSE', today)).toEqual([]);
  });

  it('caps results to 3 chips', () => {
    const today = '2026-07-15';
    const extraCategories = [
      ...categories,
      category({ id: 'ocio', parentId: null }),
      category({ id: 'servicios', parentId: null }),
    ];
    const transactions = [
      { categoryId: 'alimentacion', localDate: '2026-07-14' },
      { categoryId: 'transporte', localDate: '2026-07-14' },
      { categoryId: 'salud', localDate: '2026-07-14' },
      { categoryId: 'ocio', localDate: '2026-07-14' },
      { categoryId: 'servicios', localDate: '2026-07-14' },
    ];
    expect(recentRootCategoryIds(transactions, extraCategories, 'EXPENSE', today)).toHaveLength(3);
  });
});

describe('isValidLocalDateString', () => {
  it('accepts real calendar dates', () => {
    expect(isValidLocalDateString('2026-07-15')).toBe(true);
    expect(isValidLocalDateString('2024-02-29')).toBe(true); // leap year
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidLocalDateString('2026-13-01')).toBe(false);
    expect(isValidLocalDateString('2026-02-30')).toBe(false);
    expect(isValidLocalDateString('2025-02-29')).toBe(false); // not a leap year
    expect(isValidLocalDateString('15-07-2026')).toBe(false);
    expect(isValidLocalDateString('2026-7-15')).toBe(false);
    expect(isValidLocalDateString('')).toBe(false);
  });
});

describe('favoritePaymentSourceIds', () => {
  it('ranks by all-time frequency, ignoring archived sources and unset payment sources', () => {
    const active = new Set(['cash', 'itau']);
    const transactions = [
      { paymentSourceId: 'cash' },
      { paymentSourceId: 'cash' },
      { paymentSourceId: 'itau' },
      { paymentSourceId: null },
      { paymentSourceId: 'archived-source' },
    ];
    expect(favoritePaymentSourceIds(transactions, active)).toEqual(['cash', 'itau']);
  });
});
