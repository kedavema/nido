import { Prisma } from '../src/generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';

import type { CategoriesRepository } from '../src/categories/categories.repository.js';
import type { CategoryRecord } from '../src/categories/category.js';
import type { HouseholdAccess } from '../src/households/household.js';
import { CategoryBreakdownReportService } from '../src/transactions/category-breakdown-report.service.js';
import type { TransactionsRepository } from '../src/transactions/transactions.repository.js';

const Decimal = Prisma.Decimal;
const householdId = 'd8785b17-6523-43d6-b079-b8a79ce4dca1';
const rootA = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const childA = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const rootB = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const now = new Date('2026-07-31T12:00:00.000Z');
const access: HouseholdAccess = {
  householdId,
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  role: 'OWNER',
  joinedAt: now,
};

function category(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: rootA,
    householdId,
    kind: 'EXPENSE',
    parentId: null,
    name: 'Alimentación',
    icon: 'cart',
    color: '#123456',
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(input: {
  readonly income?: string;
  readonly expense?: string;
  readonly grouped?: readonly { readonly categoryId: string; readonly amount: string }[];
  readonly categories?: readonly CategoryRecord[];
}) {
  const getMonthlyTotals = vi.fn(() =>
    Promise.resolve({
      income: new Decimal(input.income ?? '0'),
      expense: new Decimal(input.expense ?? '0'),
    }),
  );
  const getExpenseTotalsByCategory = vi.fn(() =>
    Promise.resolve(
      (input.grouped ?? []).map((item) => ({
        categoryId: item.categoryId,
        amount: new Decimal(item.amount),
      })),
    ),
  );
  const listForHousehold = vi.fn(() => Promise.resolve(input.categories ?? []));
  const service = new CategoryBreakdownReportService(
    { getMonthlyTotals, getExpenseTotalsByCategory } satisfies Pick<
      TransactionsRepository,
      'getMonthlyTotals' | 'getExpenseTotalsByCategory'
    >,
    { listForHousehold } satisfies Pick<CategoriesRepository, 'listForHousehold'>,
  );
  return { service, getMonthlyTotals, getExpenseTotalsByCategory, listForHousehold };
}

describe('CategoryBreakdownReportService', () => {
  it('returns an empty report and scopes every read to the requested household/month', async () => {
    const harness = createService({});

    await expect(harness.service.getReport(access, { month: '2026-02' })).resolves.toEqual({
      month: '2026-02',
      totalExpensePyg: '0',
      categories: [],
    });
    expect(harness.getMonthlyTotals).toHaveBeenCalledWith(householdId, '2026-02-01', '2026-02-28');
    expect(harness.getExpenseTotalsByCategory).toHaveBeenCalledWith(
      householdId,
      '2026-02-01',
      '2026-02-28',
    );
    expect(harness.listForHousehold).toHaveBeenCalledWith(householdId);
  });

  it('separates direct root spend, folds children, preserves archived names, and sorts by amount', async () => {
    const harness = createService({
      expense: '3500',
      grouped: [
        { categoryId: rootA, amount: '1000' },
        { categoryId: childA, amount: '500' },
        { categoryId: rootB, amount: '2000' },
      ],
      categories: [
        category({ isActive: false }),
        category({ id: childA, parentId: rootA, name: 'Supermercado' }),
        category({ id: rootB, name: 'Transporte' }),
      ],
    });

    const report = await harness.service.getReport(access, { month: '2026-07' });

    expect(report.categories).toEqual([
      {
        categoryId: rootB,
        categoryName: 'Transporte',
        amountPyg: '2000',
        directAmountPyg: '2000',
        percentageOfTotal: 57.14,
        subcategories: [],
      },
      {
        categoryId: rootA,
        categoryName: 'Alimentación',
        amountPyg: '1500',
        directAmountPyg: '1000',
        percentageOfTotal: 42.86,
        subcategories: [
          {
            categoryId: childA,
            categoryName: 'Supermercado',
            amountPyg: '500',
            percentageOfTotal: 14.29,
          },
        ],
      },
    ]);
  });

  it('skips an aggregate whose category no longer resolves', async () => {
    const harness = createService({
      expense: '1000',
      grouped: [{ categoryId: rootA, amount: '1000' }],
      categories: [],
    });

    const report = await harness.service.getReport(access, { month: '2026-07' });
    expect(report.totalExpensePyg).toBe('1000');
    expect(report.categories).toEqual([]);
  });
});
