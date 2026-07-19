import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CreatePaymentSourceRequestSchema,
  ListPaymentSourcesResponseSchema,
  PaymentSourceSchema,
  UpdatePaymentSourceRequestSchema,
  type CreatePaymentSourceRequest,
  type UpdatePaymentSourceRequest,
} from '../src/index.js';

const validPaymentSource = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
  name: 'Itau Debit',
  type: 'BANK_ACCOUNT',
  ownerUserId: null,
  isActive: true,
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

describe('M2 payment source contracts', () => {
  it('trims payment source names and rejects extra fields on create', () => {
    expect(CreatePaymentSourceRequestSchema.parse({ name: '  Cash ', type: 'CASH' })).toEqual({
      name: 'Cash',
      type: 'CASH',
    });
    expect(
      CreatePaymentSourceRequestSchema.safeParse({
        name: 'Cash',
        type: 'CASH',
        isActive: true,
      }).success,
    ).toBe(false);
    expectTypeOf<CreatePaymentSourceRequest['type']>().toEqualTypeOf<
      'BANK_ACCOUNT' | 'CASH' | 'CREDIT_CARD' | 'DIGITAL_WALLET' | 'OTHER'
    >();
  });

  it('accepts an optional owner user id on create', () => {
    expect(
      CreatePaymentSourceRequestSchema.parse({
        name: 'Personal Card',
        type: 'CREDIT_CARD',
        ownerUserId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
      }),
    ).toEqual({
      name: 'Personal Card',
      type: 'CREDIT_CARD',
      ownerUserId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
    });
  });

  it('rejects invalid create payloads', () => {
    expect(
      CreatePaymentSourceRequestSchema.safeParse({ name: 'Cash', type: 'CHECK' }).success,
    ).toBe(false);
    expect(CreatePaymentSourceRequestSchema.safeParse({ name: '   ', type: 'CASH' }).success).toBe(
      false,
    );
    expect(
      CreatePaymentSourceRequestSchema.safeParse({ name: 'a'.repeat(101), type: 'CASH' }).success,
    ).toBe(false);
    expect(
      CreatePaymentSourceRequestSchema.safeParse({ name: 'a'.repeat(100), type: 'CASH' }).success,
    ).toBe(true);
    expect(
      CreatePaymentSourceRequestSchema.safeParse({
        name: 'Cash',
        type: 'CASH',
        ownerUserId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('allows partial updates including archiving and owner release', () => {
    expect(UpdatePaymentSourceRequestSchema.parse({ isActive: false })).toEqual({
      isActive: false,
    });
    expect(
      UpdatePaymentSourceRequestSchema.parse({ name: '  Wallet ', ownerUserId: null }),
    ).toEqual({
      name: 'Wallet',
      ownerUserId: null,
    });
    expect(UpdatePaymentSourceRequestSchema.safeParse({ name: '' }).success).toBe(false);
    expect(UpdatePaymentSourceRequestSchema.safeParse({ householdId: 'x' }).success).toBe(false);
    expectTypeOf<UpdatePaymentSourceRequest['isActive']>().toEqualTypeOf<boolean | undefined>();
  });

  it('keeps payment source entities strict', () => {
    expect(PaymentSourceSchema.parse(validPaymentSource)).toEqual(validPaymentSource);
    expect(PaymentSourceSchema.safeParse({ ...validPaymentSource, balance: 1000 }).success).toBe(
      false,
    );
    expect(
      PaymentSourceSchema.safeParse({ ...validPaymentSource, updatedAt: 'later' }).success,
    ).toBe(false);
  });

  it('lists payment sources under a paymentSources key', () => {
    expect(
      ListPaymentSourcesResponseSchema.parse({ paymentSources: [validPaymentSource] }),
    ).toEqual({
      paymentSources: [validPaymentSource],
    });
    expect(
      ListPaymentSourcesResponseSchema.safeParse({ paymentSources: [validPaymentSource], total: 1 })
        .success,
    ).toBe(false);
  });
});
