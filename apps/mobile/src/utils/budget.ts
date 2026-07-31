import type { BudgetMonth, Category, UpsertBudgetMonthRequest } from '@nido/contracts';

const MAX_PYG_DIGITS = 18;
const PYG_INPUT_PATTERN = /^\d+$/u;

export interface BudgetAllocationDraft {
  readonly categoryId: string;
  /** Sanitized integer PYG digits. Empty means “Sin límite”. */
  readonly amountPyg: string;
}

export interface BudgetDraftSummary {
  readonly totalLimitPyg: bigint | null;
  readonly allocatedPyg: bigint;
  readonly remainingPyg: bigint | null;
  readonly hasInvalidAmount: boolean;
  readonly exceedsTotal: boolean;
}

function parsePygInput(value: string, emptyIsValid: boolean): bigint | null {
  if (value === '') {
    return emptyIsValid ? 0n : null;
  }
  if (!PYG_INPUT_PATTERN.test(value) || value.length > MAX_PYG_DIGITS) {
    return null;
  }
  return BigInt(value);
}

/**
 * Computes editor totals without converting decimal(18,0) values to JavaScript numbers.
 * Empty category values are valid and represent an allocation that should not be persisted.
 */
export function summarizeBudgetDraft(
  totalLimitInput: string,
  allocations: readonly BudgetAllocationDraft[],
): BudgetDraftSummary {
  const totalLimitPyg = parsePygInput(totalLimitInput, false);
  let allocatedPyg = 0n;
  let hasInvalidAmount = totalLimitPyg === null;

  for (const allocation of allocations) {
    const amount = parsePygInput(allocation.amountPyg, true);
    if (amount === null) {
      hasInvalidAmount = true;
    } else {
      allocatedPyg += amount;
    }
  }

  const remainingPyg = totalLimitPyg === null ? null : totalLimitPyg - allocatedPyg;
  return {
    totalLimitPyg,
    allocatedPyg,
    remainingPyg,
    hasInvalidAmount,
    exceedsTotal: remainingPyg !== null && remainingPyg < 0n,
  };
}

/** Builds the PUT payload, omitting empty/zero rows so they remain “Sin límite”. */
export function buildBudgetUpsertInput(
  totalLimitInput: string,
  allocations: readonly BudgetAllocationDraft[],
): UpsertBudgetMonthRequest | undefined {
  const summary = summarizeBudgetDraft(totalLimitInput, allocations);
  if (summary.hasInvalidAmount || summary.exceedsTotal || summary.totalLimitPyg === null) {
    return undefined;
  }

  return {
    totalLimitPyg: summary.totalLimitPyg.toString(),
    allocations: allocations.flatMap((allocation) => {
      const amount = parsePygInput(allocation.amountPyg, true);
      return amount === null || amount === 0n
        ? []
        : [{ categoryId: allocation.categoryId, amountPyg: amount.toString() }];
    }),
  };
}

/** Hydrates active root-category rows while preserving their catalog order. */
export function budgetAllocationDrafts(
  categoryIds: readonly string[],
  budgetMonth: BudgetMonth | null,
): readonly BudgetAllocationDraft[] {
  const amountsByCategory = new Map(
    budgetMonth?.allocations.map((allocation) => [allocation.categoryId, allocation.amountPyg]),
  );
  return categoryIds.map((categoryId) => ({
    categoryId,
    amountPyg: amountsByCategory.get(categoryId) ?? '',
  }));
}

/** Active root expense categories plus archived roots already referenced by this budget. */
export function editableBudgetRootCategoryIds(
  categories: readonly Category[],
  budgetMonth: BudgetMonth | null,
): readonly string[] {
  const allocatedIds = new Set(budgetMonth?.allocations.map((item) => item.categoryId));
  return categories
    .filter(
      (category) =>
        category.kind === 'EXPENSE' &&
        category.parentId === null &&
        (category.isActive || allocatedIds.has(category.id)),
    )
    .map((category) => category.id);
}
