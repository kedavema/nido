import type {
  BudgetMonthRecord,
  CopyBudgetMonthRecordInput,
  UpsertBudgetMonthRecordInput,
} from './budget.js';

export const BUDGETS_REPOSITORY = Symbol('BUDGETS_REPOSITORY');

/** The requested category is not a root expense category of the household. */
export class BudgetCategoryInvalidError extends Error {}

/** A copy cannot replace a budget that already exists for the target month. */
export class BudgetMonthAlreadyExistsError extends Error {}

/** The source month requested for a copy does not have a budget. */
export class BudgetMonthNotFoundError extends Error {}

export interface BudgetsRepository {
  findByMonth(householdId: string, month: Date): Promise<BudgetMonthRecord | null>;
  findValidRootExpenseCategoryIds(
    householdId: string,
    categoryIds: readonly string[],
  ): Promise<readonly string[]>;
  upsert(input: UpsertBudgetMonthRecordInput): Promise<BudgetMonthRecord>;
  copy(input: CopyBudgetMonthRecordInput): Promise<BudgetMonthRecord>;
}
