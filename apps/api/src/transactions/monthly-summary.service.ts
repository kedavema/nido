import { Inject, Injectable } from '@nestjs/common';
import type {
  CategoryBreakdownItem,
  MonthlySummaryQuery,
  MonthlySummaryResponse,
} from '@nido/contracts';

import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import type { CategoryRecord } from '../categories/category.js';
import { Prisma } from '../generated/prisma/client.js';
import type { HouseholdAccess } from '../households/household.js';
import { deriveMonthLocalDateRange } from './local-date.js';
import type { CategoryExpenseTotal } from './transaction.js';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from './transactions.repository.js';
import { toTransaction } from './transactions.service.js';

const RECENT_TRANSACTIONS_LIMIT = 4;
const PERCENTAGE_DECIMAL_PLACES = 2;

/**
 * M3 cut of the dashboard's monthly summary (docs/system-design.md §6.8, ADR 0007): balance,
 * income/expense totals, expense breakdown by root category, and up to 4 recent movements.
 * Budget/Fijos-dependent items (§6.8 points 2 and 3) are out of scope until M5/M6.
 */
@Injectable()
export class MonthlySummaryService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY)
    private readonly transactionsRepository: TransactionsRepository,
    @Inject(CATEGORIES_REPOSITORY)
    private readonly categoriesRepository: Pick<CategoriesRepository, 'listForHousehold'>,
  ) {}

  async getMonthlySummary(
    access: HouseholdAccess,
    query: MonthlySummaryQuery,
  ): Promise<MonthlySummaryResponse> {
    const { from, to } = deriveMonthLocalDateRange(query.month);

    const [totals, expenseByCategory, categories, recentTransactions] = await Promise.all([
      this.transactionsRepository.getMonthlyTotals(access.householdId, from, to),
      this.transactionsRepository.getExpenseTotalsByCategory(access.householdId, from, to),
      this.categoriesRepository.listForHousehold(access.householdId),
      this.transactionsRepository.findRecent(
        access.householdId,
        from,
        to,
        RECENT_TRANSACTIONS_LIMIT,
      ),
    ]);

    const balance = totals.income.minus(totals.expense);
    const categoryBreakdown = attributeToRootCategories(expenseByCategory, categories).map(
      (root): CategoryBreakdownItem => ({
        categoryId: root.categoryId,
        categoryName: root.categoryName,
        amount: root.amount.toFixed(0),
        percentage: computePercentage(root.amount, totals.expense),
      }),
    );

    return {
      balance: balance.toFixed(0),
      incomeTotal: totals.income.toFixed(0),
      expenseTotal: totals.expense.toFixed(0),
      categoryBreakdown,
      recentTransactions: recentTransactions.map(toTransaction),
    };
  }
}

interface RootCategoryTotal {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amount: Prisma.Decimal;
}

/**
 * Folds each `CategoryExpenseTotal` (grouped by the transaction's own, possibly-subcategory
 * `category_id`) into its root category's total — categories are at most two levels deep (see
 * the trigger comment on the `Category` Prisma model), so a category's `parentId`, when present,
 * always points at a root. Sorted descending by amount, matching the design's "top categorías"
 * ordering (INI-02).
 *
 * A category absent from `categories` (a race with a concurrent hard delete — categories are
 * normally archived, not deleted, once referenced) is skipped defensively rather than crashing
 * the whole summary.
 */
function attributeToRootCategories(
  expenseByCategory: readonly CategoryExpenseTotal[],
  categories: readonly CategoryRecord[],
): readonly RootCategoryTotal[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rootTotals = new Map<string, RootCategoryTotal>();

  for (const { categoryId, amount } of expenseByCategory) {
    const category = categoryById.get(categoryId);
    if (category === undefined) {
      continue;
    }
    const root = category.parentId === null ? category : categoryById.get(category.parentId);
    if (root === undefined) {
      continue;
    }

    const existing = rootTotals.get(root.id);
    rootTotals.set(root.id, {
      categoryId: root.id,
      categoryName: root.name,
      amount: (existing?.amount ?? new Prisma.Decimal(0)).plus(amount),
    });
  }

  return [...rootTotals.values()].sort((a, b) => b.amount.comparedTo(a.amount));
}

/**
 * `amount` as a percentage of `expenseTotal`, rounded half-up to 2 decimal places. `expenseTotal`
 * is only zero when `amount` is too (no expense rows exist without a total to belong to), so that
 * case returns `0` rather than dividing by zero.
 */
function computePercentage(amount: Prisma.Decimal, expenseTotal: Prisma.Decimal): number {
  if (expenseTotal.isZero()) {
    return 0;
  }
  return amount
    .dividedBy(expenseTotal)
    .times(100)
    .toDecimalPlaces(PERCENTAGE_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}
