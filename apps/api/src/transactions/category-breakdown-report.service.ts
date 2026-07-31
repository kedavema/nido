import { Inject, Injectable } from '@nestjs/common';
import type {
  CategoryBreakdownReportResponse,
  ReportMonthQuery,
  ReportRootCategory,
} from '@nido/contracts';

import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import type { CategoryRecord } from '../categories/category.js';
import { Prisma } from '../generated/prisma/client.js';
import type { HouseholdAccess } from '../households/household.js';
import { deriveMonthLocalDateRange } from './local-date.js';
import { reportPercentage } from './report-math.js';
import type { CategoryExpenseTotal } from './transaction.js';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from './transactions.repository.js';

interface CategoryBucket {
  readonly root: CategoryRecord;
  direct: Prisma.Decimal;
  readonly children: Map<string, { readonly category: CategoryRecord; amount: Prisma.Decimal }>;
}

@Injectable()
export class CategoryBreakdownReportService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY)
    private readonly transactions: Pick<
      TransactionsRepository,
      'getMonthlyTotals' | 'getExpenseTotalsByCategory'
    >,
    @Inject(CATEGORIES_REPOSITORY)
    private readonly categories: Pick<CategoriesRepository, 'listForHousehold'>,
  ) {}

  async getReport(
    access: HouseholdAccess,
    query: ReportMonthQuery,
  ): Promise<CategoryBreakdownReportResponse> {
    const { from, to } = deriveMonthLocalDateRange(query.month);
    const [totals, expenseTotals, categories] = await Promise.all([
      this.transactions.getMonthlyTotals(access.householdId, from, to),
      this.transactions.getExpenseTotalsByCategory(access.householdId, from, to),
      this.categories.listForHousehold(access.householdId),
    ]);

    return {
      month: query.month,
      totalExpensePyg: totals.expense.toFixed(0),
      categories: buildCategoryRows(expenseTotals, categories, totals.expense),
    };
  }
}

function buildCategoryRows(
  totals: readonly CategoryExpenseTotal[],
  categories: readonly CategoryRecord[],
  totalExpense: Prisma.Decimal,
): ReportRootCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const buckets = new Map<string, CategoryBucket>();

  for (const total of totals) {
    const category = byId.get(total.categoryId);
    if (category?.kind !== 'EXPENSE') continue;
    const root = category.parentId === null ? category : byId.get(category.parentId);
    if (root?.kind !== 'EXPENSE') continue;
    const bucket: CategoryBucket = buckets.get(root.id) ?? {
      root,
      direct: new Prisma.Decimal(0),
      children: new Map<string, { readonly category: CategoryRecord; amount: Prisma.Decimal }>(),
    };
    if (category.parentId === null) {
      bucket.direct = bucket.direct.plus(total.amount);
    } else {
      const child = bucket.children.get(category.id);
      bucket.children.set(category.id, {
        category,
        amount: (child?.amount ?? new Prisma.Decimal(0)).plus(total.amount),
      });
    }
    buckets.set(root.id, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      bucket,
      amount: [...bucket.children.values()].reduce(
        (sum, child) => sum.plus(child.amount),
        bucket.direct,
      ),
    }))
    .sort((left, right) =>
      right.amount.equals(left.amount)
        ? left.bucket.root.name.localeCompare(right.bucket.root.name)
        : right.amount.comparedTo(left.amount),
    )
    .map(({ bucket, amount }) => ({
      categoryId: bucket.root.id,
      categoryName: bucket.root.name,
      amountPyg: amount.toFixed(0),
      directAmountPyg: bucket.direct.toFixed(0),
      percentageOfTotal: reportPercentage(amount, totalExpense),
      subcategories: [...bucket.children.values()]
        .sort((left, right) =>
          right.amount.equals(left.amount)
            ? left.category.name.localeCompare(right.category.name)
            : right.amount.comparedTo(left.amount),
        )
        .map((child) => ({
          categoryId: child.category.id,
          categoryName: child.category.name,
          amountPyg: child.amount.toFixed(0),
          percentageOfTotal: reportPercentage(child.amount, totalExpense),
        })),
    }));
}
