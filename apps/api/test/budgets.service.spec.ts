import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';

import type { BudgetMonthRecord } from '../src/budgets/budget.js';
import {
  BudgetMonthAlreadyExistsError,
  BudgetMonthNotFoundError,
  type BudgetsRepository,
} from '../src/budgets/budgets.repository.js';
import { BudgetsService } from '../src/budgets/budgets.service.js';
import type { HouseholdAccess } from '../src/households/household.js';

const now = new Date('2026-07-31T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};
const budgetId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const categoryId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const copiedFromId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

function budgetRecord(overrides: Partial<BudgetMonthRecord> = {}): BudgetMonthRecord {
  return {
    id: budgetId,
    householdId: access.householdId,
    month: new Date('2026-07-01T00:00:00.000Z'),
    totalLimitPyg: new Prisma.Decimal('1000000'),
    allocations: [{ categoryId, amountPyg: new Prisma.Decimal('300000') }],
    copiedFromId: null,
    ...overrides,
  };
}

function createRepository(overrides: Partial<BudgetsRepository> = {}): BudgetsRepository {
  return {
    findByMonth: () => Promise.resolve(null),
    findValidRootExpenseCategoryIds: (_householdId, categoryIds) => Promise.resolve(categoryIds),
    upsert: () => Promise.resolve(budgetRecord()),
    copy: () => Promise.resolve(budgetRecord({ copiedFromId })),
    ...overrides,
  };
}

describe('BudgetsService get', () => {
  it('returns null when the selected month has no budget', async () => {
    const findByMonth = vi.fn(() => Promise.resolve(null));
    const service = new BudgetsService(createRepository({ findByMonth }));

    await expect(service.getBudgetMonth(access, '2026-08')).resolves.toEqual({ budgetMonth: null });
    expect(findByMonth).toHaveBeenCalledWith(
      access.householdId,
      new Date('2026-08-01T00:00:00.000Z'),
    );
  });

  it('serializes Decimal values and derives the unallocated amount', async () => {
    const service = new BudgetsService(
      createRepository({
        findByMonth: () =>
          Promise.resolve(
            budgetRecord({
              allocations: [
                { categoryId, amountPyg: new Prisma.Decimal('300000') },
                {
                  categoryId: copiedFromId,
                  amountPyg: new Prisma.Decimal('125000'),
                },
              ],
              copiedFromId,
            }),
          ),
      }),
    );

    await expect(service.getBudgetMonth(access, '2026-07')).resolves.toEqual({
      budgetMonth: {
        id: budgetId,
        householdId: access.householdId,
        month: '2026-07',
        totalLimitPyg: '1000000',
        allocations: [
          { categoryId, amountPyg: '300000' },
          { categoryId: copiedFromId, amountPyg: '125000' },
        ],
        unallocatedPyg: '575000',
        copiedFromId,
      },
    });
  });
});

describe('BudgetsService upsert', () => {
  it('replaces the allocation set using Decimal values', async () => {
    const upsert = vi.fn(() => Promise.resolve(budgetRecord()));
    const findValidRootExpenseCategoryIds = vi.fn((_householdId: string, ids: readonly string[]) =>
      Promise.resolve(ids),
    );
    const service = new BudgetsService(
      createRepository({ upsert, findValidRootExpenseCategoryIds }),
    );

    await service.upsertBudgetMonth(access, '2026-07', {
      totalLimitPyg: '1000000',
      allocations: [{ categoryId, amountPyg: '300000' }],
    });

    expect(findValidRootExpenseCategoryIds).toHaveBeenCalledWith(access.householdId, [categoryId]);
    expect(upsert).toHaveBeenCalledWith({
      householdId: access.householdId,
      month: new Date('2026-07-01T00:00:00.000Z'),
      totalLimitPyg: new Prisma.Decimal('1000000'),
      allocations: [{ categoryId, amountPyg: new Prisma.Decimal('300000') }],
    });
  });

  it('rejects allocations over the total before querying categories or writing', async () => {
    const findValidRootExpenseCategoryIds = vi.fn();
    const upsert = vi.fn();
    const service = new BudgetsService(
      createRepository({ findValidRootExpenseCategoryIds, upsert }),
    );

    await expect(
      service.upsertBudgetMonth(access, '2026-07', {
        totalLimitPyg: '1000000',
        allocations: [{ categoryId, amountPyg: '1000001' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findValidRootExpenseCategoryIds).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a category that is not a valid root expense category', async () => {
    const upsert = vi.fn();
    const service = new BudgetsService(
      createRepository({
        findValidRootExpenseCategoryIds: () => Promise.resolve([]),
        upsert,
      }),
    );

    await expect(
      service.upsertBudgetMonth(access, '2026-07', {
        totalLimitPyg: '1000000',
        allocations: [{ categoryId, amountPyg: '300000' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('BudgetsService copy', () => {
  it('copies from the explicit source month and returns provenance', async () => {
    const copy = vi.fn(() => Promise.resolve(budgetRecord({ copiedFromId })));
    const service = new BudgetsService(createRepository({ copy }));

    await service.copyBudgetMonth(access, '2026-08', { sourceMonth: '2026-07' });

    expect(copy).toHaveBeenCalledWith({
      householdId: access.householdId,
      targetMonth: new Date('2026-08-01T00:00:00.000Z'),
      sourceMonth: new Date('2026-07-01T00:00:00.000Z'),
    });
  });

  it('maps a missing source to 404 and an existing target to 409', async () => {
    const missingSource = new BudgetsService(
      createRepository({ copy: () => Promise.reject(new BudgetMonthNotFoundError()) }),
    );
    const existingTarget = new BudgetsService(
      createRepository({ copy: () => Promise.reject(new BudgetMonthAlreadyExistsError()) }),
    );

    await expect(
      missingSource.copyBudgetMonth(access, '2026-08', { sourceMonth: '2026-07' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      existingTarget.copyBudgetMonth(access, '2026-08', { sourceMonth: '2026-07' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
