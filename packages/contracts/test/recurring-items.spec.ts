import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CreateRecurringItemRequestSchema,
  ListRecurringItemsResponseSchema,
  RecurringItemSchema,
  UpdateRecurringItemRequestSchema,
  type CreateRecurringItemRequest,
  type UpdateRecurringItemRequest,
} from '../src/index.js';

const validRecurringItem = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
  kind: 'EXPENSE',
  name: 'Alquiler',
  description: 'Alquiler mensual del departamento',
  categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
  paymentSourceId: '3c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a44',
  responsibleUserId: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
  estimatedAmount: '1500000',
  currency: 'PYG',
  plannedFxRateToBase: null,
  frequency: 'MONTHLY',
  intervalMonths: null,
  firstDueDate: '2026-08-01',
  endDate: null,
  notificationOffsets: [1, 3],
  isActive: true,
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

describe('M5 recurring item contracts', () => {
  it('parses a full recurring item response round-trip', () => {
    expect(RecurringItemSchema.parse(validRecurringItem)).toEqual(validRecurringItem);
  });

  it('requires intervalMonths for EVERY_N_MONTHS frequency', () => {
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        frequency: 'EVERY_N_MONTHS',
        intervalMonths: null,
      }).success,
    ).toBe(false);
  });

  it('rejects intervalMonths present when frequency is not EVERY_N_MONTHS', () => {
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        frequency: 'MONTHLY',
        intervalMonths: 3,
      }).success,
    ).toBe(false);
  });

  it('accepts EVERY_N_MONTHS frequency with a valid positive intervalMonths', () => {
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        frequency: 'EVERY_N_MONTHS',
        intervalMonths: 2,
      }).success,
    ).toBe(true);
  });

  it('accepts MONTHLY, ONE_TIME and YEARLY frequencies with no intervalMonths', () => {
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        frequency: 'MONTHLY',
        intervalMonths: null,
      }).success,
    ).toBe(true);
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        frequency: 'ONE_TIME',
        intervalMonths: null,
      }).success,
    ).toBe(true);
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        frequency: 'YEARLY',
        intervalMonths: null,
      }).success,
    ).toBe(true);
  });

  it('rejects non-integral PYG estimatedAmount', () => {
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        estimatedAmount: '1500000.5',
      }).success,
    ).toBe(false);
  });

  it('rejects USD estimatedAmount with more than 2 decimals', () => {
    expect(
      RecurringItemSchema.safeParse({
        ...validRecurringItem,
        currency: 'USD',
        estimatedAmount: '10.019',
        plannedFxRateToBase: '7350',
      }).success,
    ).toBe(false);
  });

  it('requires plannedFxRateToBase for USD and rejects it for PYG, attributing issues to the recurring-item field names', () => {
    const usdItem = {
      ...validRecurringItem,
      currency: 'USD',
      estimatedAmount: '10.01',
      plannedFxRateToBase: '7350',
    };

    const missingFxRateResult = RecurringItemSchema.safeParse({
      ...usdItem,
      plannedFxRateToBase: null,
    });
    expect(missingFxRateResult.success).toBe(false);
    if (!missingFxRateResult.success) {
      expect(missingFxRateResult.error.issues[0]?.path).toEqual(['plannedFxRateToBase']);
    }
    expect(RecurringItemSchema.safeParse(usdItem).success).toBe(true);

    const forbiddenFxRateResult = RecurringItemSchema.safeParse({
      ...validRecurringItem,
      plannedFxRateToBase: '7350',
    });
    expect(forbiddenFxRateResult.success).toBe(false);
    if (!forbiddenFxRateResult.success) {
      expect(forbiddenFxRateResult.error.issues[0]?.path).toEqual(['plannedFxRateToBase']);
    }
    expect(
      RecurringItemSchema.safeParse({ ...validRecurringItem, plannedFxRateToBase: null }).success,
    ).toBe(true);
  });

  it('parses a full create request round-trip and rejects extra fields', () => {
    const payload = {
      kind: 'EXPENSE',
      name: 'Alquiler',
      description: 'Alquiler mensual del departamento',
      categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
      paymentSourceId: '3c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a44',
      responsibleUserId: '9c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33',
      estimatedAmount: '1500000',
      currency: 'PYG',
      frequency: 'MONTHLY',
      firstDueDate: '2026-08-01',
    };

    expect(CreateRecurringItemRequestSchema.parse(payload)).toEqual(payload);
    expect(
      CreateRecurringItemRequestSchema.safeParse({ ...payload, id: validRecurringItem.id }).success,
    ).toBe(false);
    expectTypeOf<CreateRecurringItemRequest['currency']>().toEqualTypeOf<'PYG' | 'USD'>();
  });

  it('rejects a create request missing required fields', () => {
    expect(
      CreateRecurringItemRequestSchema.safeParse({
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
        currency: 'PYG',
        frequency: 'MONTHLY',
        firstDueDate: '2026-08-01',
      }).success,
    ).toBe(false);
  });

  it('applies the EVERY_N_MONTHS cross-field rule to create requests', () => {
    const base = {
      kind: 'EXPENSE',
      name: 'Seguro del auto',
      categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
      estimatedAmount: '500000',
      currency: 'PYG',
      firstDueDate: '2026-08-01',
    };

    expect(
      CreateRecurringItemRequestSchema.safeParse({ ...base, frequency: 'EVERY_N_MONTHS' }).success,
    ).toBe(false);
    expect(
      CreateRecurringItemRequestSchema.safeParse({
        ...base,
        frequency: 'EVERY_N_MONTHS',
        intervalMonths: 6,
      }).success,
    ).toBe(true);
    expect(
      CreateRecurringItemRequestSchema.safeParse({
        ...base,
        frequency: 'MONTHLY',
        intervalMonths: 6,
      }).success,
    ).toBe(false);
  });

  it('applies the estimatedAmount/currency/plannedFxRateToBase cross-field rule to create requests', () => {
    const base = {
      kind: 'EXPENSE',
      name: 'Suscripcion streaming',
      categoryId: '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22',
      frequency: 'MONTHLY',
      firstDueDate: '2026-08-01',
    };

    expect(
      CreateRecurringItemRequestSchema.safeParse({
        ...base,
        estimatedAmount: '100.5',
        currency: 'PYG',
      }).success,
    ).toBe(false);
    expect(
      CreateRecurringItemRequestSchema.safeParse({
        ...base,
        estimatedAmount: '9.99',
        currency: 'USD',
      }).success,
    ).toBe(false);
    expect(
      CreateRecurringItemRequestSchema.safeParse({
        ...base,
        estimatedAmount: '9.99',
        currency: 'USD',
        plannedFxRateToBase: '7350',
      }).success,
    ).toBe(true);
    expect(
      CreateRecurringItemRequestSchema.safeParse({
        ...base,
        estimatedAmount: '150000',
        currency: 'PYG',
        plannedFxRateToBase: '7350',
      }).success,
    ).toBe(false);
  });

  it('allows partial updates and only re-checks the frequency rule when frequency is present', () => {
    expect(UpdateRecurringItemRequestSchema.parse({ name: '  Alquiler  ' })).toEqual({
      name: 'Alquiler',
    });
    expect(UpdateRecurringItemRequestSchema.parse({ isActive: false })).toEqual({
      isActive: false,
    });
    expect(UpdateRecurringItemRequestSchema.safeParse({ intervalMonths: 4 }).success).toBe(true);
    expect(
      UpdateRecurringItemRequestSchema.safeParse({
        frequency: 'EVERY_N_MONTHS',
      }).success,
    ).toBe(false);
    expect(
      UpdateRecurringItemRequestSchema.safeParse({
        frequency: 'EVERY_N_MONTHS',
        intervalMonths: 2,
      }).success,
    ).toBe(true);
    expect(
      UpdateRecurringItemRequestSchema.safeParse({
        frequency: 'MONTHLY',
        intervalMonths: 2,
      }).success,
    ).toBe(false);
    expectTypeOf<UpdateRecurringItemRequest['name']>().toEqualTypeOf<string | undefined>();
  });

  it('re-checks the estimatedAmount/currency rule only when both are present together', () => {
    expect(
      UpdateRecurringItemRequestSchema.safeParse({
        currency: 'USD',
        estimatedAmount: '9.99',
        plannedFxRateToBase: '7350',
      }).success,
    ).toBe(true);
    expect(
      UpdateRecurringItemRequestSchema.safeParse({
        currency: 'USD',
        estimatedAmount: '9.999',
      }).success,
    ).toBe(false);
    expect(
      UpdateRecurringItemRequestSchema.safeParse({
        currency: 'USD',
        estimatedAmount: '9.99',
      }).success,
    ).toBe(false);
    // Only currency provided (no estimatedAmount): the cross-field rule is not re-checked.
    expect(UpdateRecurringItemRequestSchema.safeParse({ currency: 'USD' }).success).toBe(true);
    // Only estimatedAmount provided (no currency): the cross-field rule is not re-checked.
    expect(UpdateRecurringItemRequestSchema.safeParse({ estimatedAmount: '9.999' }).success).toBe(
      true,
    );
  });

  it('lists recurring items under a recurringItems key', () => {
    expect(
      ListRecurringItemsResponseSchema.parse({ recurringItems: [validRecurringItem] }),
    ).toEqual({
      recurringItems: [validRecurringItem],
    });
    expect(
      ListRecurringItemsResponseSchema.safeParse({
        recurringItems: [validRecurringItem],
        total: 1,
      }).success,
    ).toBe(false);
  });
});
