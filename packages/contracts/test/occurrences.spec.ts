import { describe, expect, it } from 'vitest';

import {
  ListOccurrencesQuerySchema,
  ListOccurrencesResponseSchema,
  OccurrenceSchema,
  SettleOccurrenceRequestSchema,
  SettleOccurrenceResponseSchema,
  SkipOccurrenceResponseSchema,
} from '../src/index.js';

const validPygOccurrence = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  recurringItemId: '1a9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a55',
  householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
  dueDate: '2026-08-01',
  amount: '150000',
  currency: 'PYG',
  fxRateToBase: null,
  responsibleUserId: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  status: 'PENDING',
  settledAt: null,
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

const validUsdOccurrence = {
  ...validPygOccurrence,
  amount: '10.01',
  currency: 'USD',
  fxRateToBase: '7350',
};

const validTransaction = {
  id: '5e9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a66',
  householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
  type: 'EXPENSE',
  amount: '150000',
  currency: 'PYG',
  fxRateToBase: null,
  baseAmountPyg: '150000',
  occurredAt: '2026-08-01T12:00:00.000Z',
  localDate: '2026-08-01',
  categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
  paymentSourceId: null,
  description: 'Alquiler',
  notes: null,
  origin: 'MANUAL',
  createdBy: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  updatedBy: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
};

describe('M5 occurrence contracts', () => {
  it('parses a full occurrence response round-trip for PYG and USD', () => {
    expect(OccurrenceSchema.parse(validPygOccurrence)).toEqual(validPygOccurrence);
    expect(OccurrenceSchema.parse(validUsdOccurrence)).toEqual(validUsdOccurrence);
  });

  it('rejects non-integral PYG amounts', () => {
    expect(OccurrenceSchema.safeParse({ ...validPygOccurrence, amount: '150000.5' }).success).toBe(
      false,
    );
  });

  it('rejects USD amounts with more than 2 decimals', () => {
    expect(OccurrenceSchema.safeParse({ ...validUsdOccurrence, amount: '10.019' }).success).toBe(
      false,
    );
  });

  it('requires fxRateToBase for USD and rejects it for PYG', () => {
    expect(OccurrenceSchema.safeParse({ ...validUsdOccurrence, fxRateToBase: null }).success).toBe(
      false,
    );
    expect(
      OccurrenceSchema.safeParse({ ...validUsdOccurrence, fxRateToBase: '7350' }).success,
    ).toBe(true);
    expect(
      OccurrenceSchema.safeParse({ ...validPygOccurrence, fxRateToBase: '7350' }).success,
    ).toBe(false);
    expect(OccurrenceSchema.safeParse({ ...validPygOccurrence, fxRateToBase: null }).success).toBe(
      true,
    );
  });

  it('lists occurrences under an occurrences key', () => {
    expect(ListOccurrencesResponseSchema.parse({ occurrences: [validPygOccurrence] })).toEqual({
      occurrences: [validPygOccurrence],
    });
    expect(
      ListOccurrencesResponseSchema.safeParse({ occurrences: [validPygOccurrence], total: 1 })
        .success,
    ).toBe(false);
  });

  it('accepts the documented filters and rejects an unknown status', () => {
    expect(
      ListOccurrencesQuerySchema.parse({
        status: 'PENDING',
        from: '2026-08-01',
        to: '2026-08-31',
      }),
    ).toEqual({
      status: ['PENDING'],
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(ListOccurrencesQuerySchema.parse({})).toEqual({});
    expect(ListOccurrencesQuerySchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
  });

  it('normalizes one-or-more statuses (repeated query keys arrive as an array) to an array', () => {
    expect(ListOccurrencesQuerySchema.parse({ status: ['PENDING', 'OVERDUE'] })).toEqual({
      status: ['PENDING', 'OVERDUE'],
    });
    expect(ListOccurrencesQuerySchema.safeParse({ status: [] }).success).toBe(false);
    expect(ListOccurrencesQuerySchema.safeParse({ status: ['PENDING', 'CANCELLED'] }).success).toBe(
      false,
    );
  });

  it('settles as-planned with an empty body', () => {
    expect(SettleOccurrenceRequestSchema.parse({})).toEqual({});
  });

  it('re-checks the currency/amount rule only when both are present together', () => {
    expect(
      SettleOccurrenceRequestSchema.safeParse({
        currency: 'USD',
        amount: '10.01',
        fxRateToBase: '7350',
      }).success,
    ).toBe(true);
    expect(
      SettleOccurrenceRequestSchema.safeParse({
        currency: 'USD',
        amount: '10.019',
      }).success,
    ).toBe(false);
    expect(
      SettleOccurrenceRequestSchema.safeParse({
        currency: 'USD',
        amount: '10.01',
      }).success,
    ).toBe(false);
    // Only currency provided (no amount): the cross-field rule is not re-checked.
    expect(SettleOccurrenceRequestSchema.safeParse({ currency: 'USD' }).success).toBe(true);
    // Only amount provided (no currency): the cross-field rule is not re-checked.
    expect(SettleOccurrenceRequestSchema.safeParse({ amount: '10.019' }).success).toBe(true);
  });

  it('wraps the settled transaction and occurrence together', () => {
    const response = { transaction: validTransaction, occurrence: validPygOccurrence };
    expect(SettleOccurrenceResponseSchema.parse(response)).toEqual(response);
    expect(
      SettleOccurrenceResponseSchema.safeParse({
        transaction: { ...validTransaction, amount: '150000.5' },
        occurrence: validPygOccurrence,
      }).success,
    ).toBe(false);
  });

  it('wraps the skipped occurrence', () => {
    expect(SkipOccurrenceResponseSchema.parse({ occurrence: validPygOccurrence })).toEqual({
      occurrence: validPygOccurrence,
    });
    expect(
      SkipOccurrenceResponseSchema.safeParse({
        occurrence: { ...validPygOccurrence, status: 'SKIPPED' },
      }).success,
    ).toBe(true);
  });
});
