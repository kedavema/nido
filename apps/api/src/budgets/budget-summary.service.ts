import { Injectable } from '@nestjs/common';
import type { BudgetSummary } from '@nido/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { deriveMonthLocalDateRange, parseLocalDate } from '../transactions/local-date.js';

const PERCENTAGE_DECIMAL_PLACES = 2;

@Injectable()
export class BudgetSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getBudgetSummary(householdId: string, month: string): Promise<BudgetSummary | null> {
    const budgetMonth = await this.prisma.budgetMonth.findUnique({
      where: {
        householdId_month: {
          householdId,
          month: parseLocalDate(`${month}-01`),
        },
      },
      include: { allocations: { select: { amountPyg: true } } },
    });
    if (budgetMonth === null) {
      return null;
    }

    const { from, to } = deriveMonthLocalDateRange(month);
    const [expenseRows, pendingRows] = await Promise.all([
      this.prisma.$queryRaw<readonly { total: string | null }[]>`
        SELECT COALESCE(SUM("base_amount_pyg"), 0)::text AS "total"
        FROM "transactions"
        WHERE "household_id" = ${householdId}::uuid
          AND "type" = 'EXPENSE'
          AND "local_date" >= ${from}::date
          AND "local_date" <= ${to}::date
      `,
      this.prisma.$queryRaw<readonly { total: string | null }[]>`
        SELECT COALESCE(SUM(
          CASE
            WHEN occurrence."currency" = 'PYG' THEN occurrence."amount"
            ELSE ROUND(occurrence."amount" * occurrence."fx_rate_to_base")
          END
        ), 0)::text AS "total"
        FROM "occurrences" AS occurrence
        INNER JOIN "recurring_items" AS recurring_item
          ON recurring_item."id" = occurrence."recurring_item_id"
        WHERE occurrence."household_id" = ${householdId}::uuid
          AND occurrence."due_date" >= ${from}::date
          AND occurrence."due_date" <= ${to}::date
          AND occurrence."status" IN ('PENDING', 'OVERDUE')
          AND recurring_item."kind" = 'EXPENSE'
      `,
    ]);

    const totalLimit = budgetMonth.totalLimitPyg;
    const allocated = budgetMonth.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.amountPyg),
      new Prisma.Decimal(0),
    );
    const spent = new Prisma.Decimal(expenseRows[0]?.total ?? '0');
    const pendingCommitments = new Prisma.Decimal(pendingRows[0]?.total ?? '0');
    const available = totalLimit.minus(spent);
    const projectedAvailable = available.minus(pendingCommitments);

    return {
      totalLimitPyg: totalLimit.toFixed(0),
      allocatedPyg: allocated.toFixed(0),
      unallocatedPyg: totalLimit.minus(allocated).toFixed(0),
      spentPyg: spent.toFixed(0),
      availablePyg: available.toFixed(0),
      pendingCommitmentsPyg: pendingCommitments.toFixed(0),
      projectedAvailablePyg: projectedAvailable.toFixed(0),
      spentPercentage: computePercentage(spent, totalLimit),
      projectedPercentage: computePercentage(spent.plus(pendingCommitments), totalLimit),
    };
  }
}

function computePercentage(numerator: Prisma.Decimal, denominator: Prisma.Decimal): number {
  if (denominator.isZero()) {
    return 0;
  }
  return numerator
    .dividedBy(denominator)
    .times(100)
    .toDecimalPlaces(PERCENTAGE_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}
