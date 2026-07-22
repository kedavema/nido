import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  calculateOccurrenceDueDate,
  CATEGORY_KINDS,
  FREQUENCY_KINDS,
  HOUSEHOLD_MEMBER_STATUSES,
  HOUSEHOLD_ROLES,
  NIDO_TIME_ZONE,
  PAYMENT_SOURCE_TYPES,
  SUPPORTED_CURRENCY_CODES,
  TRANSACTION_ORIGINS,
  TRANSACTION_TYPES,
  type CategoryKind,
  type FrequencyKind,
  type HouseholdMemberStatus,
  type HouseholdRole,
  type NidoTimeZone,
  type PaymentSourceType,
  type SupportedCurrencyCode,
  type TransactionOrigin,
  type TransactionType,
} from '../src/index.js';

describe('domain constants', () => {
  it('defines only the currencies supported by the MVP', () => {
    expect(SUPPORTED_CURRENCY_CODES).toEqual(['PYG', 'USD']);
    expectTypeOf<SupportedCurrencyCode>().toEqualTypeOf<'PYG' | 'USD'>();
  });

  it('defines the canonical Nido time zone', () => {
    expect(NIDO_TIME_ZONE).toBe('America/Asuncion');
    expectTypeOf<NidoTimeZone>().toEqualTypeOf<'America/Asuncion'>();
  });

  it('defines only the M1 household roles and membership states', () => {
    expect(HOUSEHOLD_ROLES).toEqual(['OWNER', 'MEMBER']);
    expect(HOUSEHOLD_MEMBER_STATUSES).toEqual(['ACTIVE', 'REMOVED']);
    expectTypeOf<HouseholdRole>().toEqualTypeOf<'OWNER' | 'MEMBER'>();
    expectTypeOf<HouseholdMemberStatus>().toEqualTypeOf<'ACTIVE' | 'REMOVED'>();
  });

  it('defines the M2 category kinds', () => {
    expect(CATEGORY_KINDS).toEqual(['EXPENSE', 'INCOME']);
    expectTypeOf<CategoryKind>().toEqualTypeOf<'EXPENSE' | 'INCOME'>();
  });

  it('defines the M2 payment source types', () => {
    expect(PAYMENT_SOURCE_TYPES).toEqual([
      'BANK_ACCOUNT',
      'CASH',
      'CREDIT_CARD',
      'DIGITAL_WALLET',
      'OTHER',
    ]);
    expectTypeOf<PaymentSourceType>().toEqualTypeOf<
      'BANK_ACCOUNT' | 'CASH' | 'CREDIT_CARD' | 'DIGITAL_WALLET' | 'OTHER'
    >();
  });

  it('defines the M3 transaction types and origins', () => {
    expect(TRANSACTION_TYPES).toEqual(['EXPENSE', 'INCOME']);
    expect(TRANSACTION_ORIGINS).toEqual(['MANUAL', 'IMPORT', 'RECURRING']);
    expectTypeOf<TransactionType>().toEqualTypeOf<'EXPENSE' | 'INCOME'>();
    expectTypeOf<TransactionOrigin>().toEqualTypeOf<'MANUAL' | 'IMPORT' | 'RECURRING'>();
  });

  it('defines the M5 recurrence frequency kinds', () => {
    expect(FREQUENCY_KINDS).toEqual(['ONE_TIME', 'MONTHLY', 'YEARLY', 'EVERY_N_MONTHS']);
    expectTypeOf<FrequencyKind>().toEqualTypeOf<
      'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'EVERY_N_MONTHS'
    >();
  });
});

describe('calculateOccurrenceDueDate', () => {
  it('returns firstDueDate itself for occurrence index 0, regardless of frequency', () => {
    const firstDueDate = new Date(Date.UTC(2026, 0, 10));
    expect(calculateOccurrenceDueDate(firstDueDate, 'ONE_TIME', 0)).toEqual(firstDueDate);
    expect(calculateOccurrenceDueDate(firstDueDate, 'MONTHLY', 0)).toEqual(firstDueDate);
    expect(calculateOccurrenceDueDate(firstDueDate, 'YEARLY', 0)).toEqual(firstDueDate);
    expect(calculateOccurrenceDueDate(firstDueDate, 'EVERY_N_MONTHS', 0, 3)).toEqual(firstDueDate);
  });

  it('rejects ONE_TIME frequency for any occurrence past index 0', () => {
    const firstDueDate = new Date(Date.UTC(2026, 0, 10));
    expect(() => calculateOccurrenceDueDate(firstDueDate, 'ONE_TIME', 1)).toThrow(RangeError);
  });

  it('advances MONTHLY occurrences by one calendar month per index', () => {
    // "Internet, mensual, vence el día 10" — docs/system-design.md §6.4 example.
    const firstDueDate = new Date(Date.UTC(2026, 0, 10)); // 2026-01-10
    expect(calculateOccurrenceDueDate(firstDueDate, 'MONTHLY', 1)).toEqual(
      new Date(Date.UTC(2026, 1, 10)), // 2026-02-10
    );
    expect(calculateOccurrenceDueDate(firstDueDate, 'MONTHLY', 6)).toEqual(
      new Date(Date.UTC(2026, 6, 10)), // 2026-07-10
    );
  });

  it('advances YEARLY occurrences by one calendar year per index', () => {
    const firstDueDate = new Date(Date.UTC(2026, 4, 15)); // 2026-05-15
    expect(calculateOccurrenceDueDate(firstDueDate, 'YEARLY', 1)).toEqual(
      new Date(Date.UTC(2027, 4, 15)),
    );
    expect(calculateOccurrenceDueDate(firstDueDate, 'YEARLY', 3)).toEqual(
      new Date(Date.UTC(2029, 4, 15)),
    );
  });

  it('advances EVERY_N_MONTHS occurrences by intervalMonths per index', () => {
    const firstDueDate = new Date(Date.UTC(2026, 0, 31)); // 2026-01-31
    expect(calculateOccurrenceDueDate(firstDueDate, 'EVERY_N_MONTHS', 1, 3)).toEqual(
      new Date(Date.UTC(2026, 3, 30)), // 2026-04-30 (April has 30 days)
    );
    expect(calculateOccurrenceDueDate(firstDueDate, 'EVERY_N_MONTHS', 2, 3)).toEqual(
      new Date(Date.UTC(2026, 6, 31)), // 2026-07-31
    );
  });

  it('requires a positive integer intervalMonths for EVERY_N_MONTHS', () => {
    const firstDueDate = new Date(Date.UTC(2026, 0, 31));
    expect(() => calculateOccurrenceDueDate(firstDueDate, 'EVERY_N_MONTHS', 1)).toThrow(RangeError);
    expect(() => calculateOccurrenceDueDate(firstDueDate, 'EVERY_N_MONTHS', 1, 0)).toThrow(
      RangeError,
    );
  });

  it('clamps day 31 to the last calendar day of a shorter destination month', () => {
    const firstDueDate = new Date(Date.UTC(2026, 0, 31)); // 2026-01-31
    expect(calculateOccurrenceDueDate(firstDueDate, 'MONTHLY', 1)).toEqual(
      new Date(Date.UTC(2026, 1, 28)), // 2026-02-28 (2026 is not a leap year)
    );
  });

  it('clamps to Feb 29 in a leap year and Feb 28 otherwise (the explicit day-31 edge case)', () => {
    const firstDueDate = new Date(Date.UTC(2024, 0, 31)); // 2024-01-31, 2024 is a leap year
    expect(calculateOccurrenceDueDate(firstDueDate, 'MONTHLY', 1)).toEqual(
      new Date(Date.UTC(2024, 1, 29)), // 2024-02-29
    );

    const nonLeapFirstDueDate = new Date(Date.UTC(2026, 0, 31)); // 2026-01-31, not a leap year
    expect(calculateOccurrenceDueDate(nonLeapFirstDueDate, 'MONTHLY', 1)).toEqual(
      new Date(Date.UTC(2026, 1, 28)), // 2026-02-28
    );
  });

  it('clamps a Feb 29 first due date to Feb 28 on YEARLY occurrences in non-leap years', () => {
    const firstDueDate = new Date(Date.UTC(2024, 1, 29)); // 2024-02-29
    expect(calculateOccurrenceDueDate(firstDueDate, 'YEARLY', 1)).toEqual(
      new Date(Date.UTC(2025, 1, 28)), // 2025-02-28 (not a leap year)
    );
    expect(calculateOccurrenceDueDate(firstDueDate, 'YEARLY', 4)).toEqual(
      new Date(Date.UTC(2028, 1, 29)), // 2028-02-29 (leap year again)
    );
  });
});
