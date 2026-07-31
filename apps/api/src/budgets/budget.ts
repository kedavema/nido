import type { Prisma } from '../generated/prisma/client.js';

export interface BudgetAllocationRecord {
  readonly categoryId: string;
  readonly amountPyg: Prisma.Decimal;
}

export interface BudgetMonthRecord {
  readonly id: string;
  readonly householdId: string;
  readonly month: Date;
  readonly totalLimitPyg: Prisma.Decimal;
  readonly allocations: readonly BudgetAllocationRecord[];
  readonly copiedFromId: string | null;
}

export interface UpsertBudgetMonthRecordInput {
  readonly householdId: string;
  readonly month: Date;
  readonly totalLimitPyg: Prisma.Decimal;
  readonly allocations: readonly BudgetAllocationRecord[];
}

export interface CopyBudgetMonthRecordInput {
  readonly householdId: string;
  readonly targetMonth: Date;
  readonly sourceMonth: Date;
}
