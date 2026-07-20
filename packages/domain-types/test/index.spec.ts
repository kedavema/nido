import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CATEGORY_KINDS,
  HOUSEHOLD_MEMBER_STATUSES,
  HOUSEHOLD_ROLES,
  NIDO_TIME_ZONE,
  PAYMENT_SOURCE_TYPES,
  SUPPORTED_CURRENCY_CODES,
  TRANSACTION_ORIGINS,
  TRANSACTION_TYPES,
  type CategoryKind,
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
});
