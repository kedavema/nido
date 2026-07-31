import { z } from 'zod';

import { UuidSchema } from './identity.js';
import { BaseAmountPygSchema, MonthSchema } from './transactions.js';

/** A persisted allocation targets one root expense category for one budget month. */
export const BudgetAllocationSchema = z.strictObject({
  categoryId: UuidSchema,
  amountPyg: BaseAmountPygSchema,
});

export const BudgetAllocationInputSchema = BudgetAllocationSchema;

function rejectDuplicateAllocationCategories(
  allocations: readonly z.infer<typeof BudgetAllocationInputSchema>[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  allocations.forEach((allocation, index) => {
    if (seen.has(allocation.categoryId)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'categoryId'],
        message: 'categoryId must appear only once in a budget month',
      });
      return;
    }
    seen.add(allocation.categoryId);
  });
}

/**
 * API representation of a monthly budget. `unallocatedPyg` is derived from the limit and
 * allocations; it is returned here so every client uses the same arithmetic result.
 */
export const BudgetMonthSchema = z.strictObject({
  id: UuidSchema,
  householdId: UuidSchema,
  month: MonthSchema,
  totalLimitPyg: BaseAmountPygSchema,
  allocations: z.array(BudgetAllocationSchema),
  unallocatedPyg: BaseAmountPygSchema,
  copiedFromId: UuidSchema.nullable(),
});

/**
 * PUT replaces the allocation set for the requested month atomically. The API also enforces that
 * the sum of allocations does not exceed totalLimitPyg using Prisma Decimal arithmetic.
 */
export const UpsertBudgetMonthRequestSchema = z
  .strictObject({
    totalLimitPyg: BaseAmountPygSchema,
    allocations: z.array(BudgetAllocationInputSchema),
  })
  .superRefine((data, ctx) => {
    rejectDuplicateAllocationCategories(data.allocations, ctx);
  });

export const GetBudgetMonthResponseSchema = z.strictObject({
  budgetMonth: BudgetMonthSchema.nullable(),
});

export const UpsertBudgetMonthResponseSchema = z.strictObject({
  budgetMonth: BudgetMonthSchema,
});

/** `sourceMonth` is explicit so copying is deterministic and never silently chains months. */
export const CopyBudgetMonthRequestSchema = z.strictObject({
  sourceMonth: MonthSchema,
});

export const CopyBudgetMonthResponseSchema = z.strictObject({
  budgetMonth: BudgetMonthSchema,
});

export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;
export type BudgetAllocationInput = z.infer<typeof BudgetAllocationInputSchema>;
export type BudgetMonth = z.infer<typeof BudgetMonthSchema>;
export type UpsertBudgetMonthRequest = z.infer<typeof UpsertBudgetMonthRequestSchema>;
export type GetBudgetMonthResponse = z.infer<typeof GetBudgetMonthResponseSchema>;
export type UpsertBudgetMonthResponse = z.infer<typeof UpsertBudgetMonthResponseSchema>;
export type CopyBudgetMonthRequest = z.infer<typeof CopyBudgetMonthRequestSchema>;
export type CopyBudgetMonthResponse = z.infer<typeof CopyBudgetMonthResponseSchema>;
