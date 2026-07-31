import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BudgetMonth,
  CopyBudgetMonthRequest,
  CopyBudgetMonthResponse,
  GetBudgetMonthResponse,
  UpsertBudgetMonthRequest,
  UpsertBudgetMonthResponse,
} from '@nido/contracts';

import { Prisma } from '../generated/prisma/client.js';
import type { HouseholdAccess } from '../households/household.js';
import { parseLocalDate } from '../transactions/local-date.js';
import type { BudgetAllocationRecord, BudgetMonthRecord } from './budget.js';
import {
  BUDGETS_REPOSITORY,
  BudgetCategoryInvalidError,
  BudgetMonthAlreadyExistsError,
  BudgetMonthNotFoundError,
  type BudgetsRepository,
} from './budgets.repository.js';

const BUDGET_MONTH_UNAVAILABLE = 'Budget month is unavailable';
const BUDGET_CATEGORY_INVALID = 'Budget allocation category must be a root expense category';
const BUDGET_ALLOCATION_LIMIT_EXCEEDED = 'Budget allocations cannot exceed the total limit';

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(BUDGETS_REPOSITORY)
    private readonly budgetsRepository: BudgetsRepository,
  ) {}

  async getBudgetMonth(access: HouseholdAccess, month: string): Promise<GetBudgetMonthResponse> {
    const record = await this.budgetsRepository.findByMonth(access.householdId, parseMonth(month));
    return { budgetMonth: record === null ? null : toBudgetMonth(record) };
  }

  async upsertBudgetMonth(
    access: HouseholdAccess,
    month: string,
    input: UpsertBudgetMonthRequest,
  ): Promise<UpsertBudgetMonthResponse> {
    const allocations = input.allocations.map(toAllocationRecord);
    assertAllocationsFitLimit(input.totalLimitPyg, allocations);
    await this.assertValidCategories(access.householdId, allocations);

    try {
      const record = await this.budgetsRepository.upsert({
        householdId: access.householdId,
        month: parseMonth(month),
        totalLimitPyg: new Prisma.Decimal(input.totalLimitPyg),
        allocations,
      });
      return { budgetMonth: toBudgetMonth(record) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async copyBudgetMonth(
    access: HouseholdAccess,
    month: string,
    input: CopyBudgetMonthRequest,
  ): Promise<CopyBudgetMonthResponse> {
    try {
      const record = await this.budgetsRepository.copy({
        householdId: access.householdId,
        targetMonth: parseMonth(month),
        sourceMonth: parseMonth(input.sourceMonth),
      });
      return { budgetMonth: toBudgetMonth(record) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  private async assertValidCategories(
    householdId: string,
    allocations: readonly BudgetAllocationRecord[],
  ): Promise<void> {
    const categoryIds = allocations.map((allocation) => allocation.categoryId);
    const validCategoryIds = await this.budgetsRepository.findValidRootExpenseCategoryIds(
      householdId,
      categoryIds,
    );
    const validIds = new Set(validCategoryIds);
    if (categoryIds.some((categoryId) => !validIds.has(categoryId))) {
      throw new BadRequestException(BUDGET_CATEGORY_INVALID);
    }
  }
}

function parseMonth(month: string): Date {
  return parseLocalDate(`${month}-01`);
}

function toAllocationRecord(
  allocation: UpsertBudgetMonthRequest['allocations'][number],
): BudgetAllocationRecord {
  return {
    categoryId: allocation.categoryId,
    amountPyg: new Prisma.Decimal(allocation.amountPyg),
  };
}

function assertAllocationsFitLimit(
  totalLimitPyg: string,
  allocations: readonly BudgetAllocationRecord[],
): void {
  const total = allocations.reduce(
    (sum, allocation) => sum.plus(allocation.amountPyg),
    new Prisma.Decimal(0),
  );
  if (total.greaterThan(new Prisma.Decimal(totalLimitPyg))) {
    throw new BadRequestException(BUDGET_ALLOCATION_LIMIT_EXCEEDED);
  }
}

function toBudgetMonth(record: BudgetMonthRecord): BudgetMonth {
  const allocated = record.allocations.reduce(
    (sum, allocation) => sum.plus(allocation.amountPyg),
    new Prisma.Decimal(0),
  );
  return {
    id: record.id,
    householdId: record.householdId,
    month: formatMonth(record.month),
    totalLimitPyg: record.totalLimitPyg.toFixed(0),
    allocations: record.allocations.map((allocation) => ({
      categoryId: allocation.categoryId,
      amountPyg: allocation.amountPyg.toFixed(0),
    })),
    unallocatedPyg: record.totalLimitPyg.minus(allocated).toFixed(0),
    copiedFromId: record.copiedFromId,
  };
}

function formatMonth(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mapPersistenceError(error: unknown): unknown {
  if (error instanceof BudgetCategoryInvalidError) {
    return new BadRequestException(BUDGET_CATEGORY_INVALID);
  }
  if (error instanceof BudgetMonthAlreadyExistsError) {
    return new ConflictException('Budget target month already exists');
  }
  if (error instanceof BudgetMonthNotFoundError) {
    return new NotFoundException(BUDGET_MONTH_UNAVAILABLE);
  }
  return error;
}
