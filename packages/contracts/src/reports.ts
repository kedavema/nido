import { z } from 'zod';

import { UuidSchema } from './identity.js';
import { PaymentSourceNameSchema } from './payment-sources.js';
import {
  BaseAmountPygSchema,
  CategoryBreakdownPercentageSchema,
  MonthSchema,
  MonthlyBalanceSchema,
} from './transactions.js';

export const ReportMonthQuerySchema = z.strictObject({ month: MonthSchema });

export const ReportSubcategorySchema = z.strictObject({
  categoryId: UuidSchema,
  categoryName: z.string().trim().min(1).max(100),
  amountPyg: BaseAmountPygSchema,
  percentageOfTotal: CategoryBreakdownPercentageSchema,
});

export const ReportRootCategorySchema = z.strictObject({
  categoryId: UuidSchema,
  categoryName: z.string().trim().min(1).max(100),
  amountPyg: BaseAmountPygSchema,
  directAmountPyg: BaseAmountPygSchema,
  percentageOfTotal: CategoryBreakdownPercentageSchema,
  subcategories: z.array(ReportSubcategorySchema),
});

export const CategoryBreakdownReportResponseSchema = z.strictObject({
  month: MonthSchema,
  totalExpensePyg: BaseAmountPygSchema,
  categories: z.array(ReportRootCategorySchema),
});

export const ReportTrendPointSchema = z.strictObject({
  month: MonthSchema,
  incomePyg: BaseAmountPygSchema,
  expensePyg: BaseAmountPygSchema,
  balancePyg: MonthlyBalanceSchema,
});

export const ReportPaymentSourceScopeSchema = z.enum(['SHARED', 'PERSONAL', 'UNASSIGNED']);

export const ReportPaymentSourceSchema = z
  .strictObject({
    paymentSourceId: UuidSchema.nullable(),
    paymentSourceName: PaymentSourceNameSchema,
    ownerUserId: UuidSchema.nullable(),
    scope: ReportPaymentSourceScopeSchema,
    amountPyg: BaseAmountPygSchema,
    percentageOfExpense: CategoryBreakdownPercentageSchema,
  })
  .superRefine((source, ctx) => {
    const valid =
      (source.scope === 'UNASSIGNED' &&
        source.paymentSourceId === null &&
        source.ownerUserId === null) ||
      (source.scope === 'SHARED' &&
        source.paymentSourceId !== null &&
        source.ownerUserId === null) ||
      (source.scope === 'PERSONAL' &&
        source.paymentSourceId !== null &&
        source.ownerUserId !== null);
    if (!valid) ctx.addIssue({ code: 'custom', message: 'payment source scope is inconsistent' });
  });

export const TrendsReportResponseSchema = z.strictObject({
  month: MonthSchema,
  points: z.array(ReportTrendPointSchema).length(3),
  totalExpensePyg: BaseAmountPygSchema,
  paymentSources: z.array(ReportPaymentSourceSchema),
});

export type ReportMonthQuery = z.infer<typeof ReportMonthQuerySchema>;
export type ReportSubcategory = z.infer<typeof ReportSubcategorySchema>;
export type ReportRootCategory = z.infer<typeof ReportRootCategorySchema>;
export type CategoryBreakdownReportResponse = z.infer<typeof CategoryBreakdownReportResponseSchema>;
export type ReportTrendPoint = z.infer<typeof ReportTrendPointSchema>;
export type ReportPaymentSourceScope = z.infer<typeof ReportPaymentSourceScopeSchema>;
export type ReportPaymentSource = z.infer<typeof ReportPaymentSourceSchema>;
export type TrendsReportResponse = z.infer<typeof TrendsReportResponseSchema>;
