import { describe, expect, it, vi } from 'vitest';

import type { CategoriesRepository } from '../src/categories/categories.repository.js';
import type { CategoryRecord } from '../src/categories/category.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { HouseholdAccess } from '../src/households/household.js';
import { MonthlySummaryService } from '../src/transactions/monthly-summary.service.js';
import type { CategoryExpenseTotal, TransactionRecord } from '../src/transactions/transaction.js';
import type { TransactionsRepository } from '../src/transactions/transactions.repository.js';

const Decimal = Prisma.Decimal;

const now = new Date('2026-07-19T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};

const rootAId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const childOfAId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const rootCId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const transactionId = '1a2b3c4d-5e6f-4708-9a0b-1c2d3e4f5061';

function categoryRecord(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: rootAId,
    householdId: access.householdId,
    kind: 'EXPENSE',
    parentId: null,
    name: 'Alimentacion',
    icon: 'cart',
    color: '#AABBCC',
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function transactionRecord(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: transactionId,
    householdId: access.householdId,
    type: 'EXPENSE',
    amount: new Decimal('150000'),
    currency: 'PYG',
    fxRateToBase: null,
    baseAmountPyg: new Decimal('150000'),
    occurredAt: now,
    localDate: new Date('2026-07-19T00:00:00.000Z'),
    categoryId: rootAId,
    paymentSourceId: null,
    description: 'Supermercado',
    notes: null,
    origin: 'MANUAL',
    createdBy: access.actorId,
    updatedBy: access.actorId,
    createdAt: now,
    updatedAt: now,
    clientMutationId: null,
    clientMutationHash: null,
    ...overrides,
  };
}

function createTransactionsRepository(
  overrides: Partial<TransactionsRepository> = {},
): TransactionsRepository {
  return {
    list: () => Promise.reject(new Error('not used')),
    findInHousehold: () => Promise.reject(new Error('not used')),
    findByClientMutationId: () => Promise.reject(new Error('not used')),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    deleteById: () => Promise.reject(new Error('not used')),
    getMonthlyTotals: () => Promise.resolve({ income: new Decimal(0), expense: new Decimal(0) }),
    getExpenseTotalsByCategory: () => Promise.resolve([]),
    findRecent: () => Promise.resolve([]),
    ...overrides,
  };
}

function createCategoriesRepository(
  overrides: Partial<Pick<CategoriesRepository, 'listForHousehold'>> = {},
): Pick<CategoriesRepository, 'listForHousehold'> {
  return {
    listForHousehold: () => Promise.resolve([]),
    ...overrides,
  };
}

function createService(
  overrides: {
    readonly transactionsRepository?: Partial<TransactionsRepository>;
    readonly categoriesRepository?: Partial<Pick<CategoriesRepository, 'listForHousehold'>>;
  } = {},
): MonthlySummaryService {
  return new MonthlySummaryService(
    createTransactionsRepository(overrides.transactionsRepository),
    createCategoriesRepository(overrides.categoriesRepository),
  );
}

describe('MonthlySummaryService — empty month', () => {
  it('returns zeroed totals and empty lists when there are no movements', async () => {
    const service = createService();

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response).toEqual({
      balance: '0',
      incomeTotal: '0',
      expenseTotal: '0',
      categoryBreakdown: [],
      recentTransactions: [],
    });
  });
});

describe('MonthlySummaryService — balance', () => {
  it('computes a positive balance from income and expense totals', async () => {
    const service = createService({
      transactionsRepository: {
        getMonthlyTotals: () =>
          Promise.resolve({ income: new Decimal('200000'), expense: new Decimal('150000') }),
      },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response.balance).toBe('50000');
    expect(response.incomeTotal).toBe('200000');
    expect(response.expenseTotal).toBe('150000');
  });

  it('computes a negative balance when expenses exceed income', async () => {
    const service = createService({
      transactionsRepository: {
        getMonthlyTotals: () =>
          Promise.resolve({ income: new Decimal('100000'), expense: new Decimal('150000') }),
      },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response.balance).toBe('-50000');
  });
});

describe('MonthlySummaryService — category breakdown', () => {
  it('attributes subcategory spend to its root category and sorts descending by amount', async () => {
    const expenseByCategory: readonly CategoryExpenseTotal[] = [
      { categoryId: rootAId, amount: new Decimal('1000') },
      { categoryId: childOfAId, amount: new Decimal('500') },
      { categoryId: rootCId, amount: new Decimal('2000') },
    ];
    const categories: readonly CategoryRecord[] = [
      categoryRecord({ id: rootAId, name: 'Alimentacion', parentId: null }),
      categoryRecord({ id: childOfAId, name: 'Supermercado', parentId: rootAId }),
      categoryRecord({ id: rootCId, name: 'Transporte', parentId: null }),
    ];
    const service = createService({
      transactionsRepository: {
        getMonthlyTotals: () =>
          Promise.resolve({ income: new Decimal(0), expense: new Decimal('3500') }),
        getExpenseTotalsByCategory: () => Promise.resolve(expenseByCategory),
      },
      categoriesRepository: { listForHousehold: () => Promise.resolve(categories) },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    // Transporte (2000) has no subcategory spend and outranks Alimentacion (1000 + 500 = 1500,
    // once the child's spend is folded into its parent).
    expect(response.categoryBreakdown).toEqual([
      { categoryId: rootCId, categoryName: 'Transporte', amount: '2000', percentage: 57.14 },
      { categoryId: rootAId, categoryName: 'Alimentacion', amount: '1500', percentage: 42.86 },
    ]);
  });

  it('skips a category total whose category no longer exists rather than throwing', async () => {
    const missingCategoryId = 'ffffffff-ffff-4fff-9fff-ffffffffffff';
    const service = createService({
      transactionsRepository: {
        getMonthlyTotals: () =>
          Promise.resolve({ income: new Decimal(0), expense: new Decimal('1000') }),
        getExpenseTotalsByCategory: () =>
          Promise.resolve([{ categoryId: missingCategoryId, amount: new Decimal('1000') }]),
      },
      categoriesRepository: { listForHousehold: () => Promise.resolve([]) },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response.categoryBreakdown).toEqual([]);
  });
});

describe('MonthlySummaryService — percentage rounding', () => {
  it('rounds half-up rather than half-to-even at the second decimal', async () => {
    // 1 / 800 * 100 = 0.125 exactly. Half-up rounds to 0.13; half-to-even would give 0.12.
    const service = createService({
      transactionsRepository: {
        getMonthlyTotals: () =>
          Promise.resolve({ income: new Decimal(0), expense: new Decimal('800') }),
        getExpenseTotalsByCategory: () =>
          Promise.resolve([{ categoryId: rootAId, amount: new Decimal('1') }]),
      },
      categoriesRepository: { listForHousehold: () => Promise.resolve([categoryRecord()]) },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response.categoryBreakdown[0]?.percentage).toBe(0.13);
  });

  it('reports 0% for every category when the expense total is zero', async () => {
    // Defensive only: getExpenseTotalsByCategory would not return rows without a total to
    // belong to, but the division-by-zero guard is still exercised directly here.
    const service = createService({
      transactionsRepository: {
        getMonthlyTotals: () =>
          Promise.resolve({ income: new Decimal(0), expense: new Decimal(0) }),
        getExpenseTotalsByCategory: () =>
          Promise.resolve([{ categoryId: rootAId, amount: new Decimal(0) }]),
      },
      categoriesRepository: { listForHousehold: () => Promise.resolve([categoryRecord()]) },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response.categoryBreakdown[0]?.percentage).toBe(0);
  });
});

describe('MonthlySummaryService — month boundaries', () => {
  it('resolves the query month to the household-local first/last day and forwards it to the repository', async () => {
    const getMonthlyTotals = vi.fn(() =>
      Promise.resolve({ income: new Decimal(0), expense: new Decimal(0) }),
    );
    const getExpenseTotalsByCategory = vi.fn(() => Promise.resolve([]));
    const findRecent = vi.fn(() => Promise.resolve([]));
    const service = createService({
      transactionsRepository: { getMonthlyTotals, getExpenseTotalsByCategory, findRecent },
    });

    await service.getMonthlySummary(access, { month: '2026-02' });

    // 2026 is not a leap year: February's last local day is the 28th.
    expect(getMonthlyTotals).toHaveBeenCalledWith(access.householdId, '2026-02-01', '2026-02-28');
    expect(getExpenseTotalsByCategory).toHaveBeenCalledWith(
      access.householdId,
      '2026-02-01',
      '2026-02-28',
    );
    expect(findRecent).toHaveBeenCalledWith(access.householdId, '2026-02-01', '2026-02-28', 4);
  });

  it('does not roll a December query into the next year', async () => {
    const getMonthlyTotals = vi.fn(() =>
      Promise.resolve({ income: new Decimal(0), expense: new Decimal(0) }),
    );
    const service = createService({ transactionsRepository: { getMonthlyTotals } });

    await service.getMonthlySummary(access, { month: '2026-12' });

    expect(getMonthlyTotals).toHaveBeenCalledWith(access.householdId, '2026-12-01', '2026-12-31');
  });
});

describe('MonthlySummaryService — recent transactions', () => {
  it('shapes recent transactions the same way the transactions endpoints do', async () => {
    const service = createService({
      transactionsRepository: {
        findRecent: () => Promise.resolve([transactionRecord()]),
      },
    });

    const response = await service.getMonthlySummary(access, { month: '2026-07' });

    expect(response.recentTransactions).toEqual([
      {
        id: transactionId,
        householdId: access.householdId,
        type: 'EXPENSE',
        amount: '150000',
        currency: 'PYG',
        fxRateToBase: null,
        baseAmountPyg: '150000',
        occurredAt: now.toISOString(),
        localDate: '2026-07-19',
        categoryId: rootAId,
        paymentSourceId: null,
        description: 'Supermercado',
        notes: null,
        origin: 'MANUAL',
        createdBy: access.actorId,
        updatedBy: access.actorId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it('passes the recent-transactions limit of 4 through to the repository', async () => {
    const findRecent = vi.fn(() => Promise.resolve([]));
    const service = createService({ transactionsRepository: { findRecent } });

    await service.getMonthlySummary(access, { month: '2026-07' });

    expect(findRecent).toHaveBeenCalledWith(access.householdId, '2026-07-01', '2026-07-31', 4);
  });
});
