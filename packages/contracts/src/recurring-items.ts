import { FREQUENCY_KINDS, TRANSACTION_TYPES } from '@nido/domain-types';
import { z } from 'zod';

import { IsoDateTimeSchema, LocalDateSchema, UuidSchema } from './identity.js';
import {
  AmountSchema,
  checkAmountCurrencyAndFxRate,
  FxRateToBaseSchema,
  TransactionCurrencySchema,
} from './transactions.js';

// Prisma's `RecurringItemKind` enum is its own DB enum (`recurring_item_kind`), distinct from
// `TransactionType`, but shares the exact same EXPENSE|INCOME domain. `@nido/domain-types` does
// not export a dedicated array for it, so `TRANSACTION_TYPES` is reused here rather than
// introducing another identical ['EXPENSE', 'INCOME'] literal.
export const RecurringItemKindSchema = z.enum(TRANSACTION_TYPES);

export const FrequencyKindSchema = z.enum(FREQUENCY_KINDS);

export const RecurringItemNameSchema = z.string().trim().min(1).max(100);

export const RecurringItemDescriptionSchema = z.string().trim().min(1).max(2000);

// interval_months is only meaningful for EVERY_N_MONTHS (per apps/api/prisma/schema.prisma
// comment on RecurringItem); when present it must be a positive integer.
export const IntervalMonthsSchema = z.int().min(1);

export const NotificationOffsetSchema = z.int().min(0);

// frequency vs. intervalMonths is a cross-field rule (interval_months is required and positive
// only for EVERY_N_MONTHS, and must be absent otherwise) — enforced via superRefine, mirroring
// transactions.ts's checkAmountCurrencyAndFxRate pattern.
function checkIntervalMonthsForFrequency(
  data: {
    frequency: z.infer<typeof FrequencyKindSchema>;
    intervalMonths?: number | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const hasIntervalMonths = data.intervalMonths !== undefined && data.intervalMonths !== null;

  if (data.frequency === 'EVERY_N_MONTHS' && !hasIntervalMonths) {
    ctx.addIssue({
      code: 'custom',
      path: ['intervalMonths'],
      message: 'intervalMonths is required for EVERY_N_MONTHS frequency',
    });
  }
  if (data.frequency !== 'EVERY_N_MONTHS' && hasIntervalMonths) {
    ctx.addIssue({
      code: 'custom',
      path: ['intervalMonths'],
      message: 'intervalMonths must be absent unless frequency is EVERY_N_MONTHS',
    });
  }
}

// estimatedAmount/currency/plannedFxRateToBase is the same money triple as Transaction's
// amount/currency/fxRateToBase (same decimal(18,2)/(18,4) precisions and PYG-integral /
// USD-2-decimal + USD-requires-fx-rate rule), but RecurringItem uses different field names, so
// checkAmountCurrencyAndFxRate's fieldNames parameter is used to attribute issues to
// estimatedAmount/plannedFxRateToBase instead of the non-existent amount/fxRateToBase paths.
const RECURRING_ITEM_MONEY_FIELD_NAMES = {
  amount: 'estimatedAmount',
  fxRateToBase: 'plannedFxRateToBase',
};

function checkRecurringItemMoney(
  data: {
    currency: z.infer<typeof TransactionCurrencySchema>;
    estimatedAmount: string;
    plannedFxRateToBase?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  checkAmountCurrencyAndFxRate(
    {
      currency: data.currency,
      amount: data.estimatedAmount,
      fxRateToBase: data.plannedFxRateToBase,
    },
    ctx,
    RECURRING_ITEM_MONEY_FIELD_NAMES,
  );
}

export const RecurringItemSchema = z
  .strictObject({
    id: UuidSchema,
    householdId: UuidSchema,
    kind: RecurringItemKindSchema,
    name: RecurringItemNameSchema,
    description: RecurringItemDescriptionSchema.nullable(),
    categoryId: UuidSchema,
    paymentSourceId: UuidSchema.nullable(),
    responsibleUserId: UuidSchema.nullable(),
    estimatedAmount: AmountSchema,
    currency: TransactionCurrencySchema,
    plannedFxRateToBase: FxRateToBaseSchema.nullable(),
    frequency: FrequencyKindSchema,
    intervalMonths: IntervalMonthsSchema.nullable(),
    firstDueDate: LocalDateSchema,
    endDate: LocalDateSchema.nullable(),
    notificationOffsets: z.array(NotificationOffsetSchema),
    isActive: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine(checkIntervalMonthsForFrequency)
  .superRefine(checkRecurringItemMoney);

// householdId comes from the URL path, and id/createdAt/updatedAt are server-generated — none of
// them are accepted from the client, mirroring CreateTransactionRequestSchema.
export const CreateRecurringItemRequestSchema = z
  .strictObject({
    kind: RecurringItemKindSchema,
    name: RecurringItemNameSchema,
    description: RecurringItemDescriptionSchema.optional(),
    categoryId: UuidSchema,
    paymentSourceId: UuidSchema.optional(),
    responsibleUserId: UuidSchema.optional(),
    estimatedAmount: AmountSchema,
    currency: TransactionCurrencySchema,
    plannedFxRateToBase: FxRateToBaseSchema.optional(),
    frequency: FrequencyKindSchema,
    intervalMonths: IntervalMonthsSchema.optional(),
    firstDueDate: LocalDateSchema,
    endDate: LocalDateSchema.optional(),
    notificationOffsets: z.array(NotificationOffsetSchema).optional(),
  })
  .superRefine(checkIntervalMonthsForFrequency)
  .superRefine(checkRecurringItemMoney);

export const UpdateRecurringItemRequestSchema = z
  .strictObject({
    kind: RecurringItemKindSchema.optional(),
    name: RecurringItemNameSchema.optional(),
    description: RecurringItemDescriptionSchema.nullable().optional(),
    categoryId: UuidSchema.optional(),
    paymentSourceId: UuidSchema.nullable().optional(),
    responsibleUserId: UuidSchema.nullable().optional(),
    estimatedAmount: AmountSchema.optional(),
    currency: TransactionCurrencySchema.optional(),
    plannedFxRateToBase: FxRateToBaseSchema.nullable().optional(),
    frequency: FrequencyKindSchema.optional(),
    intervalMonths: IntervalMonthsSchema.nullable().optional(),
    firstDueDate: LocalDateSchema.optional(),
    endDate: LocalDateSchema.nullable().optional(),
    notificationOffsets: z.array(NotificationOffsetSchema).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // A partial update only carries enough context to re-check the frequency/intervalMonths rule
    // when frequency is present in the same payload; otherwise the current persisted frequency is
    // unknown here and the domain layer re-validates against it (mirrors
    // UpdateTransactionRequestSchema's currency/amount re-check).
    if (data.frequency !== undefined) {
      checkIntervalMonthsForFrequency(
        { frequency: data.frequency, intervalMonths: data.intervalMonths },
        ctx,
      );
    }
    // Same rationale, applied to the estimatedAmount/currency/plannedFxRateToBase money triple:
    // only re-check when both currency and estimatedAmount are present in the same payload.
    if (data.currency !== undefined && data.estimatedAmount !== undefined) {
      checkRecurringItemMoney(
        {
          currency: data.currency,
          estimatedAmount: data.estimatedAmount,
          plannedFxRateToBase: data.plannedFxRateToBase,
        },
        ctx,
      );
    }
  });

export const CreateRecurringItemResponseSchema = z.strictObject({
  recurringItem: RecurringItemSchema,
});

export const UpdateRecurringItemResponseSchema = CreateRecurringItemResponseSchema;

export const ListRecurringItemsResponseSchema = z.strictObject({
  recurringItems: z.array(RecurringItemSchema),
});

export type RecurringItemKind = z.infer<typeof RecurringItemKindSchema>;
export type FrequencyKind = z.infer<typeof FrequencyKindSchema>;
export type RecurringItem = z.infer<typeof RecurringItemSchema>;
export type CreateRecurringItemRequest = z.infer<typeof CreateRecurringItemRequestSchema>;
export type UpdateRecurringItemRequest = z.infer<typeof UpdateRecurringItemRequestSchema>;
export type CreateRecurringItemResponse = z.infer<typeof CreateRecurringItemResponseSchema>;
export type UpdateRecurringItemResponse = z.infer<typeof UpdateRecurringItemResponseSchema>;
export type ListRecurringItemsResponse = z.infer<typeof ListRecurringItemsResponseSchema>;
