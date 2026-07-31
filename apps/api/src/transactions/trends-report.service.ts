import { Inject, Injectable } from '@nestjs/common';
import type {
  ReportMonthQuery,
  ReportPaymentSource,
  ReportTrendPoint,
  TrendsReportResponse,
} from '@nido/contracts';

import type { HouseholdAccess } from '../households/household.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PaymentSourceRecord } from '../payment-sources/payment-source.js';
import {
  PAYMENT_SOURCES_REPOSITORY,
  type PaymentSourcesRepository,
} from '../payment-sources/payment-sources.repository.js';
import { deriveMonthLocalDateRange, deriveTrailingMonths } from './local-date.js';
import { reportPercentage } from './report-math.js';
import type { PaymentSourceExpenseTotal } from './transaction.js';
import { TRANSACTIONS_REPOSITORY, type TransactionsRepository } from './transactions.repository.js';

@Injectable()
export class TrendsReportService {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY)
    private readonly transactions: Pick<
      TransactionsRepository,
      'getMonthlyTotals' | 'getExpenseTotalsByPaymentSource'
    >,
    @Inject(PAYMENT_SOURCES_REPOSITORY)
    private readonly paymentSources: Pick<PaymentSourcesRepository, 'listForHousehold'>,
  ) {}

  async getReport(access: HouseholdAccess, query: ReportMonthQuery): Promise<TrendsReportResponse> {
    const months = deriveTrailingMonths(query.month, 3);
    const selectedRange = deriveMonthLocalDateRange(query.month);
    const [points, sourceTotals, sources] = await Promise.all([
      Promise.all(
        months.map(async (month): Promise<ReportTrendPoint> => {
          const { from, to } = deriveMonthLocalDateRange(month);
          const totals = await this.transactions.getMonthlyTotals(access.householdId, from, to);
          return {
            month,
            incomePyg: totals.income.toFixed(0),
            expensePyg: totals.expense.toFixed(0),
            balancePyg: totals.income.minus(totals.expense).toFixed(0),
          };
        }),
      ),
      this.transactions.getExpenseTotalsByPaymentSource(
        access.householdId,
        selectedRange.from,
        selectedRange.to,
      ),
      this.paymentSources.listForHousehold(access.householdId),
    ]);
    const selectedExpense = points[2]?.expensePyg ?? '0';

    return {
      month: query.month,
      points,
      totalExpensePyg: selectedExpense,
      paymentSources: buildPaymentSourceRows(sourceTotals, sources, selectedExpense),
    };
  }
}

function buildPaymentSourceRows(
  totals: readonly PaymentSourceExpenseTotal[],
  sources: readonly PaymentSourceRecord[],
  totalExpensePyg: string,
): ReportPaymentSource[] {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const totalExpense = new Prisma.Decimal(totalExpensePyg);

  return totals
    .flatMap(
      (total): { readonly row: ReportPaymentSource; readonly amount: typeof total.amount }[] => {
        if (total.paymentSourceId === null) {
          return [
            {
              amount: total.amount,
              row: {
                paymentSourceId: null,
                paymentSourceName: 'Sin medio de pago',
                ownerUserId: null,
                scope: 'UNASSIGNED',
                amountPyg: total.amount.toFixed(0),
                percentageOfExpense: reportPercentage(total.amount, totalExpense),
              },
            },
          ];
        }
        const source = sourceById.get(total.paymentSourceId);
        if (source === undefined) return [];
        return [
          {
            amount: total.amount,
            row: {
              paymentSourceId: source.id,
              paymentSourceName: source.name,
              ownerUserId: source.ownerUserId,
              scope: source.ownerUserId === null ? 'SHARED' : 'PERSONAL',
              amountPyg: total.amount.toFixed(0),
              percentageOfExpense: reportPercentage(total.amount, totalExpense),
            },
          },
        ];
      },
    )
    .sort((left, right) =>
      right.amount.equals(left.amount)
        ? left.row.paymentSourceName.localeCompare(right.row.paymentSourceName)
        : right.amount.comparedTo(left.amount),
    )
    .map(({ row }) => row);
}
