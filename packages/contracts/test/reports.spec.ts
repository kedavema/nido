import { describe, expect, it } from 'vitest';

import {
  CategoryBreakdownReportResponseSchema,
  ReportPaymentSourceSchema,
  TrendsReportResponseSchema,
} from '../src/reports.js';

const rootId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const childId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const sourceId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const ownerId = '4ddf0a0a-63de-4aaa-b6b2-4934320baade';

describe('M6 report contracts', () => {
  it('accepts root spend split between direct and subcategory amounts', () => {
    expect(
      CategoryBreakdownReportResponseSchema.parse({
        month: '2026-07',
        totalExpensePyg: '150000',
        categories: [
          {
            categoryId: rootId,
            categoryName: 'Alimentación',
            amountPyg: '150000',
            directAmountPyg: '50000',
            percentageOfTotal: 100,
            subcategories: [
              {
                categoryId: childId,
                categoryName: 'Supermercado',
                amountPyg: '100000',
                percentageOfTotal: 66.67,
              },
            ],
          },
        ],
      }).categories[0]?.directAmountPyg,
    ).toBe('50000');
  });

  it('requires exactly three trend points and PYG decimal strings', () => {
    const base = {
      month: '2026-07',
      points: ['2026-05', '2026-06', '2026-07'].map((month) => ({
        month,
        incomePyg: '100',
        expensePyg: '80',
        balancePyg: '20',
      })),
      totalExpensePyg: '80',
      paymentSources: [],
    };
    expect(TrendsReportResponseSchema.safeParse(base).success).toBe(true);
    expect(
      TrendsReportResponseSchema.safeParse({ ...base, points: base.points.slice(1) }).success,
    ).toBe(false);
    expect(
      TrendsReportResponseSchema.safeParse({
        ...base,
        points: [{ ...base.points[0], expensePyg: '-1' }, ...base.points.slice(1)],
      }).success,
    ).toBe(false);
  });

  it('rejects payment-source scope/id/owner contradictions', () => {
    const personal = {
      paymentSourceId: sourceId,
      paymentSourceName: 'Tarjeta',
      ownerUserId: ownerId,
      scope: 'PERSONAL',
      amountPyg: '80',
      percentageOfExpense: 100,
    } as const;
    expect(ReportPaymentSourceSchema.safeParse(personal).success).toBe(true);
    expect(ReportPaymentSourceSchema.safeParse({ ...personal, scope: 'SHARED' }).success).toBe(
      false,
    );
    expect(
      ReportPaymentSourceSchema.safeParse({
        ...personal,
        paymentSourceId: null,
        ownerUserId: null,
        scope: 'UNASSIGNED',
      }).success,
    ).toBe(true);
  });
});
