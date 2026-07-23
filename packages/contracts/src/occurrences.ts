import { z } from 'zod';

import { IsoDateTimeSchema, LocalDateSchema, UuidSchema } from './identity.js';
import {
  AmountSchema,
  checkAmountCurrencyAndFxRate,
  FxRateToBaseSchema,
  TransactionCurrencySchema,
  TransactionSchema,
} from './transactions.js';

// apps/api/prisma/schema.prisma's `OccurrenceStatus` enum. `@nido/domain-types` does not export
// this set (unlike FREQUENCY_KINDS/TRANSACTION_TYPES), so it is declared here directly from the
// Prisma enum values (docs/system-design.md §"occurrences": `status PENDING | SETTLED | OVERDUE |
// SKIPPED`).
const OCCURRENCE_STATUSES = ['PENDING', 'SETTLED', 'OVERDUE', 'SKIPPED'] as const;

export const OccurrenceStatusSchema = z.enum(OCCURRENCE_STATUSES);

// Occurrence.amount/currency/fxRateToBase is copied from RecurringItem at generation time and
// uses the exact same field names and decimal(18,2)/(18,4) precisions as Transaction, so the
// PYG-integral / USD-2-decimal + USD-requires-fx-rate cross-field rule is reused as-is (no path
// mismatch, since the field names line up exactly).
export const OccurrenceSchema = z
  .strictObject({
    id: UuidSchema,
    recurringItemId: UuidSchema,
    householdId: UuidSchema,
    dueDate: LocalDateSchema,
    amount: AmountSchema,
    currency: TransactionCurrencySchema,
    fxRateToBase: FxRateToBaseSchema.nullable(),
    responsibleUserId: UuidSchema.nullable(),
    status: OccurrenceStatusSchema,
    settledAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine(checkAmountCurrencyAndFxRate);

export const ListOccurrencesResponseSchema = z.strictObject({
  occurrences: z.array(OccurrenceSchema),
});

// Filters mirrored minimally from ListTransactionsQuerySchema: status (one or more) and a
// due-date range. `status` accepts either a single value (`?status=PENDING`) or several — Express
// parses repeated query keys (`?status=PENDING&status=OVERDUE`) into an array on its own — and is
// always normalized to a non-empty array so callers never branch on the query shape.
export const ListOccurrencesQuerySchema = z.strictObject({
  status: z
    .union([OccurrenceStatusSchema, z.array(OccurrenceStatusSchema).min(1)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional(),
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
});

// Settling an occurrence turns it into a real Transaction (docs/system-design.md §"Recurrentes":
// `POST .../occurrences/:id/settle`); every field is an optional override of the value copied
// onto the occurrence, so an empty body settles it as-planned. Field names mirror
// CreateTransactionRequestSchema's amount/currency/fxRateToBase exactly so the same cross-field
// rule can be reused.
export const SettleOccurrenceRequestSchema = z
  .strictObject({
    amount: AmountSchema.optional(),
    currency: TransactionCurrencySchema.optional(),
    fxRateToBase: FxRateToBaseSchema.nullable().optional(),
    paymentSourceId: UuidSchema.nullable().optional(),
    settledAt: IsoDateTimeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Same rationale as UpdateTransactionRequestSchema: only re-check the rule when both currency
    // and amount are present in this same payload.
    if (data.currency !== undefined && data.amount !== undefined) {
      checkAmountCurrencyAndFxRate(
        { currency: data.currency, amount: data.amount, fxRateToBase: data.fxRateToBase },
        ctx,
      );
    }
  });

// Reuses transactions.ts's Transaction schema rather than duplicating any transaction fields —
// settling produces a real Transaction linked back to the (now SETTLED) occurrence.
export const SettleOccurrenceResponseSchema = z.strictObject({
  transaction: TransactionSchema,
  occurrence: OccurrenceSchema,
});

// Skipping takes no request body; it just transitions the occurrence to SKIPPED.
export const SkipOccurrenceResponseSchema = z.strictObject({
  occurrence: OccurrenceSchema,
});

export type OccurrenceStatus = z.infer<typeof OccurrenceStatusSchema>;
export type Occurrence = z.infer<typeof OccurrenceSchema>;
export type ListOccurrencesResponse = z.infer<typeof ListOccurrencesResponseSchema>;
export type ListOccurrencesQuery = z.infer<typeof ListOccurrencesQuerySchema>;
export type SettleOccurrenceRequest = z.infer<typeof SettleOccurrenceRequestSchema>;
export type SettleOccurrenceResponse = z.infer<typeof SettleOccurrenceResponseSchema>;
export type SkipOccurrenceResponse = z.infer<typeof SkipOccurrenceResponseSchema>;
