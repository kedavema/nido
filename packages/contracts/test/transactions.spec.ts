import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CreateTransactionRequestSchema,
  DecimalAmountSchema,
  ListTransactionsQuerySchema,
  ListTransactionsResponseSchema,
  TransactionSchema,
  UpdateTransactionRequestSchema,
  type CreateTransactionRequest,
  type UpdateTransactionRequest,
} from '../src/index.js';

const validPygTransaction = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
  type: 'EXPENSE',
  amount: '150000',
  currency: 'PYG',
  fxRateToBase: null,
  baseAmountPyg: '150000',
  occurredAt: '2026-07-16T12:00:00.000Z',
  localDate: '2026-07-16',
  categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
  paymentSourceId: null,
  description: 'Supermercado',
  notes: null,
  origin: 'MANUAL',
  createdBy: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  updatedBy: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

const validUsdTransaction = {
  ...validPygTransaction,
  amount: '10.01',
  currency: 'USD',
  fxRateToBase: '7350',
  baseAmountPyg: '73574',
};

describe('M3 decimal amount syntax', () => {
  it('accepts canonical decimal strings', () => {
    expect(DecimalAmountSchema.safeParse('0').success).toBe(true);
    expect(DecimalAmountSchema.safeParse('150000').success).toBe(true);
    expect(DecimalAmountSchema.safeParse('45.99').success).toBe(true);
  });

  it('rejects exponents, thousands separators, non-numeric and empty values', () => {
    expect(DecimalAmountSchema.safeParse('1e5').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('1,000').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('NaN').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('Infinity').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('abc').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('-100').success).toBe(false);
    expect(DecimalAmountSchema.safeParse('+100').success).toBe(false);
  });
});

describe('M3 transaction contracts', () => {
  it('rejects non-integral PYG amounts', () => {
    expect(
      CreateTransactionRequestSchema.safeParse({
        type: 'EXPENSE',
        amount: '100.5',
        currency: 'PYG',
        occurredAt: '2026-07-16T12:00:00.000Z',
        categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
        description: 'Almuerzo',
      }).success,
    ).toBe(false);
  });

  it('rejects USD amounts with more than 2 decimals', () => {
    expect(
      CreateTransactionRequestSchema.safeParse({
        type: 'EXPENSE',
        amount: '45.999',
        currency: 'USD',
        fxRateToBase: '7350',
        occurredAt: '2026-07-16T12:00:00.000Z',
        categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
        description: 'Compra',
      }).success,
    ).toBe(false);
  });

  it('requires fxRateToBase for USD and rejects it for PYG', () => {
    const base = {
      type: 'EXPENSE',
      occurredAt: '2026-07-16T12:00:00.000Z',
      categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
      description: 'Compra',
    };

    expect(
      CreateTransactionRequestSchema.safeParse({
        ...base,
        amount: '45.90',
        currency: 'USD',
      }).success,
    ).toBe(false);
    expect(
      CreateTransactionRequestSchema.safeParse({
        ...base,
        amount: '45.90',
        currency: 'USD',
        fxRateToBase: '7350',
      }).success,
    ).toBe(true);
    expect(
      CreateTransactionRequestSchema.safeParse({
        ...base,
        amount: '150000',
        currency: 'PYG',
        fxRateToBase: '7350',
      }).success,
    ).toBe(false);
    expect(
      CreateTransactionRequestSchema.safeParse({
        ...base,
        amount: '150000',
        currency: 'PYG',
      }).success,
    ).toBe(true);
  });

  it('parses a full create request round-trip and rejects extra fields', () => {
    const payload = {
      type: 'EXPENSE',
      amount: '10.01',
      currency: 'USD',
      fxRateToBase: '7350',
      occurredAt: '2026-07-16T12:00:00.000Z',
      categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
      paymentSourceId: '3c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a44',
      description: 'Compra online',
      notes: 'Reembolsable',
    };

    expect(CreateTransactionRequestSchema.parse(payload)).toEqual(payload);
    expect(
      CreateTransactionRequestSchema.safeParse({ ...payload, baseAmountPyg: '73574' }).success,
    ).toBe(false);
    expect(
      CreateTransactionRequestSchema.safeParse({ ...payload, localDate: '2026-07-16' }).success,
    ).toBe(false);
    expectTypeOf<CreateTransactionRequest['currency']>().toEqualTypeOf<'PYG' | 'USD'>();
  });

  it('allows partial updates and skips the cross-field check when currency is unchanged', () => {
    expect(UpdateTransactionRequestSchema.parse({ description: '  Almuerzo  ' })).toEqual({
      description: 'Almuerzo',
    });
    expect(UpdateTransactionRequestSchema.parse({ notes: null })).toEqual({ notes: null });
    expect(UpdateTransactionRequestSchema.parse({ paymentSourceId: null })).toEqual({
      paymentSourceId: null,
    });
    expect(UpdateTransactionRequestSchema.safeParse({ amount: '45.999' }).success).toBe(true);
    expect(
      UpdateTransactionRequestSchema.safeParse({ amount: '45.999', currency: 'USD' }).success,
    ).toBe(false);
    expectTypeOf<UpdateTransactionRequest['amount']>().toEqualTypeOf<string | undefined>();
  });

  it('keeps transaction entities strict and validates currency-scale round-trips', () => {
    expect(TransactionSchema.parse(validPygTransaction)).toEqual(validPygTransaction);
    expect(TransactionSchema.parse(validUsdTransaction)).toEqual(validUsdTransaction);
    expect(
      TransactionSchema.safeParse({ ...validPygTransaction, sourceOccurrenceId: null }).success,
    ).toBe(false);
    expect(
      TransactionSchema.safeParse({ ...validPygTransaction, baseAmountPyg: '150000.5' }).success,
    ).toBe(false);
    expect(
      TransactionSchema.safeParse({ ...validPygTransaction, baseAmountPyg: '9'.repeat(19) })
        .success,
    ).toBe(false);
  });

  it('lists transactions under a transactions key', () => {
    expect(ListTransactionsResponseSchema.parse({ transactions: [validPygTransaction] })).toEqual({
      transactions: [validPygTransaction],
    });
    expect(
      ListTransactionsResponseSchema.safeParse({ transactions: [validPygTransaction], total: 1 })
        .success,
    ).toBe(false);
  });

  it('accepts the documented filters and rejects unknown ones', () => {
    expect(
      ListTransactionsQuerySchema.parse({
        from: '2026-07-01',
        to: '2026-07-31',
        type: 'EXPENSE',
        categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
        paymentSourceId: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
        createdBy: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
        currency: 'PYG',
        search: 'super',
      }),
    ).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      type: 'EXPENSE',
      categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
      paymentSourceId: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
      createdBy: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
      currency: 'PYG',
      search: 'super',
    });
    expect(ListTransactionsQuerySchema.parse({})).toEqual({});
    expect(ListTransactionsQuerySchema.safeParse({ from: '07/01/2026' }).success).toBe(false);
    expect(ListTransactionsQuerySchema.safeParse({ userId: 'anything' }).success).toBe(false);
  });
});
