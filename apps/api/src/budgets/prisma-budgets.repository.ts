import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  BudgetMonthRecord,
  CopyBudgetMonthRecordInput,
  UpsertBudgetMonthRecordInput,
} from './budget.js';
import {
  BudgetCategoryInvalidError,
  BudgetMonthAlreadyExistsError,
  BudgetMonthNotFoundError,
  type BudgetsRepository,
} from './budgets.repository.js';

const CATEGORY_FOREIGN_KEY = 'budget_allocations_category_id_fkey';
const CATEGORY_TRIGGER_MESSAGES = [
  'budget allocation category must belong to the same household',
  'budget allocation category must be an expense category',
  'budget allocation category must be a root category',
] as const;

@Injectable()
export class PrismaBudgetsRepository implements BudgetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByMonth(householdId: string, month: Date): Promise<BudgetMonthRecord | null> {
    const budgetMonth = await this.prisma.budgetMonth.findUnique({
      where: { householdId_month: { householdId, month } },
      include: { allocations: { orderBy: { categoryId: 'asc' } } },
    });
    return budgetMonth === null ? null : toBudgetMonthRecord(budgetMonth);
  }

  async findValidRootExpenseCategoryIds(
    householdId: string,
    categoryIds: readonly string[],
  ): Promise<readonly string[]> {
    if (categoryIds.length === 0) {
      return [];
    }

    const categories = await this.prisma.category.findMany({
      where: {
        householdId,
        id: { in: [...categoryIds] },
        kind: 'EXPENSE',
        parentId: null,
      },
      select: { id: true },
    });
    return categories.map((category) => category.id);
  }

  async upsert(input: UpsertBudgetMonthRecordInput): Promise<BudgetMonthRecord> {
    try {
      const budgetMonth = await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.budgetMonth.findUnique({
          where: {
            householdId_month: {
              householdId: input.householdId,
              month: input.month,
            },
          },
          select: { id: true },
        });

        const budgetMonth =
          existing === null
            ? await transaction.budgetMonth.create({
                data: {
                  householdId: input.householdId,
                  month: input.month,
                  totalLimitPyg: input.totalLimitPyg,
                },
              })
            : await transaction.budgetMonth.update({
                where: { id: existing.id },
                data: { totalLimitPyg: input.totalLimitPyg },
              });

        await transaction.budgetAllocation.deleteMany({
          where: { budgetMonthId: budgetMonth.id },
        });
        if (input.allocations.length > 0) {
          await transaction.budgetAllocation.createMany({
            data: input.allocations.map((allocation) => ({
              budgetMonthId: budgetMonth.id,
              categoryId: allocation.categoryId,
              amountPyg: allocation.amountPyg,
            })),
          });
        }

        return transaction.budgetMonth.findUniqueOrThrow({
          where: { id: budgetMonth.id },
          include: { allocations: { orderBy: { categoryId: 'asc' } } },
        });
      });

      return toBudgetMonthRecord(budgetMonth);
    } catch (error) {
      throw translateWriteError(error);
    }
  }

  async copy(input: CopyBudgetMonthRecordInput): Promise<BudgetMonthRecord> {
    try {
      const budgetMonth = await this.prisma.$transaction(async (transaction) => {
        const source = await transaction.budgetMonth.findUnique({
          where: {
            householdId_month: {
              householdId: input.householdId,
              month: input.sourceMonth,
            },
          },
          include: { allocations: true },
        });
        if (source === null) {
          throw new BudgetMonthNotFoundError('Budget source month is unavailable');
        }

        const target = await transaction.budgetMonth.findUnique({
          where: {
            householdId_month: {
              householdId: input.householdId,
              month: input.targetMonth,
            },
          },
          select: { id: true },
        });
        if (target !== null) {
          throw new BudgetMonthAlreadyExistsError('Budget target month already exists');
        }

        const created = await transaction.budgetMonth.create({
          data: {
            householdId: input.householdId,
            month: input.targetMonth,
            totalLimitPyg: source.totalLimitPyg,
            copiedFromId: source.id,
          },
        });

        if (source.allocations.length > 0) {
          await transaction.budgetAllocation.createMany({
            data: source.allocations.map((allocation) => ({
              budgetMonthId: created.id,
              categoryId: allocation.categoryId,
              amountPyg: allocation.amountPyg,
            })),
          });
        }

        return transaction.budgetMonth.findUniqueOrThrow({
          where: { id: created.id },
          include: { allocations: { orderBy: { categoryId: 'asc' } } },
        });
      });

      return toBudgetMonthRecord(budgetMonth);
    } catch (error) {
      if (
        error instanceof BudgetMonthNotFoundError ||
        error instanceof BudgetMonthAlreadyExistsError
      ) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new BudgetMonthAlreadyExistsError('Budget target month already exists');
      }
      throw translateWriteError(error);
    }
  }
}

function toBudgetMonthRecord(budgetMonth: {
  readonly id: string;
  readonly householdId: string;
  readonly month: Date;
  readonly totalLimitPyg: Prisma.Decimal;
  readonly copiedFromId: string | null;
  readonly allocations: readonly {
    readonly categoryId: string;
    readonly amountPyg: Prisma.Decimal;
  }[];
}): BudgetMonthRecord {
  return {
    id: budgetMonth.id,
    householdId: budgetMonth.householdId,
    month: budgetMonth.month,
    totalLimitPyg: budgetMonth.totalLimitPyg,
    copiedFromId: budgetMonth.copiedFromId,
    allocations: budgetMonth.allocations.map((allocation) => ({
      categoryId: allocation.categoryId,
      amountPyg: allocation.amountPyg,
    })),
  };
}

function translateWriteError(error: unknown): unknown {
  const text = collectErrorText(error);
  if (
    isForeignKeyError(error) &&
    (text.includes(CATEGORY_FOREIGN_KEY) || text.includes('budget_allocations'))
  ) {
    return new BudgetCategoryInvalidError('Budget allocation category is invalid');
  }
  if (CATEGORY_TRIGGER_MESSAGES.some((message) => text.includes(message))) {
    return new BudgetCategoryInvalidError('Budget allocation category is invalid');
  }
  return error;
}

function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === 'P2002' || hasPostgresCode(error, '23505');
}

function isForeignKeyError(error: unknown): boolean {
  return errorCode(error) === 'P2003' || hasPostgresCode(error, '23503');
}

function hasPostgresCode(error: unknown, sqlState: string, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && error.code === sqlState) {
    return true;
  }
  if ('originalCode' in error && error.originalCode === sqlState) {
    return true;
  }
  return 'cause' in error && hasPostgresCode(error.cause, sqlState, depth + 1);
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : null;
  }
  return null;
}

function collectErrorText(error: unknown, depth = 0): string {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return '';
  }

  const parts: string[] = [];
  if ('message' in error && typeof error.message === 'string') {
    parts.push(error.message);
  }
  if ('originalMessage' in error && typeof error.originalMessage === 'string') {
    parts.push(error.originalMessage);
  }
  if ('meta' in error) {
    try {
      parts.push(JSON.stringify(error.meta));
    } catch {
      // Ignore non-serializable metadata.
    }
  }
  if ('cause' in error) {
    parts.push(collectErrorText(error.cause, depth + 1));
  }
  return parts.join(' ');
}
