import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  BudgetAllocationSchema,
  BudgetMonthSchema,
  BudgetSummarySchema,
  CopyBudgetMonthRequestSchema,
  GetBudgetMonthResponseSchema,
  UpsertBudgetMonthRequestSchema,
  type BudgetMonth,
} from '../src/index.js';

const householdId = '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11';
const budgetId = '4ddf0a0a-63de-4aaa-b6b2-4934320baade';
const foodCategoryId = '2b9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a22';
const housingCategoryId = '3c9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a33';

const validBudget: BudgetMonth = {
  id: budgetId,
  householdId,
  month: '2026-07',
  totalLimitPyg: '15000000',
  allocations: [
    { categoryId: foodCategoryId, amountPyg: '3410000' },
    { categoryId: housingCategoryId, amountPyg: '2800000' },
  ],
  unallocatedPyg: '8790000',
  copiedFromId: null,
};

describe('M6 budget contracts', () => {
  it('parses a budget month with decimal-string PYG values', () => {
    expect(BudgetMonthSchema.parse(validBudget)).toEqual(validBudget);
    expectTypeOf<BudgetMonth['month']>().toEqualTypeOf<string>();
  });

  it('keeps allocations strict and non-negative', () => {
    expect(
      BudgetAllocationSchema.safeParse({
        categoryId: foodCategoryId,
        amountPyg: '0',
      }).success,
    ).toBe(true);
    expect(
      BudgetAllocationSchema.safeParse({
        categoryId: foodCategoryId,
        amountPyg: '-1',
      }).success,
    ).toBe(false);
    expect(
      BudgetAllocationSchema.safeParse({
        categoryId: foodCategoryId,
        amountPyg: '1000',
        label: 'Alimentación',
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate category allocations in a PUT payload', () => {
    const result = UpsertBudgetMonthRequestSchema.safeParse({
      totalLimitPyg: '1000000',
      allocations: [
        { categoryId: foodCategoryId, amountPyg: '500000' },
        { categoryId: foodCategoryId, amountPyg: '500000' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([1, 'categoryId']);
    }
  });

  it('accepts an empty allocation set and leaves sum validation to the API transaction', () => {
    expect(
      UpsertBudgetMonthRequestSchema.parse({
        totalLimitPyg: '0',
        allocations: [],
      }),
    ).toEqual({ totalLimitPyg: '0', allocations: [] });
  });

  it('represents an absent month explicitly and validates copy source months', () => {
    expect(GetBudgetMonthResponseSchema.parse({ budgetMonth: null })).toEqual({
      budgetMonth: null,
    });
    expect(CopyBudgetMonthRequestSchema.parse({ sourceMonth: '2026-06' })).toEqual({
      sourceMonth: '2026-06',
    });
    expect(CopyBudgetMonthRequestSchema.safeParse({ sourceMonth: '2026-6' }).success).toBe(false);
    expect(
      CopyBudgetMonthRequestSchema.safeParse({ sourceMonth: '2026-07', extra: true }).success,
    ).toBe(false);
  });

  it('allows negative available values and projected percentages above 100%', () => {
    expect(
      BudgetSummarySchema.parse({
        totalLimitPyg: '15000000',
        allocatedPyg: '15000000',
        unallocatedPyg: '0',
        spentPyg: '14320000',
        availablePyg: '680000',
        pendingCommitmentsPyg: '3505000',
        projectedAvailablePyg: '-2825000',
        spentPercentage: 95.47,
        projectedPercentage: 118.84,
      }),
    ).toMatchObject({ projectedAvailablePyg: '-2825000', projectedPercentage: 118.84 });
  });
});
