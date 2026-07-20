import {
  SUPPORTED_CURRENCY_CODES,
  TRANSACTION_ORIGINS,
  TRANSACTION_TYPES,
} from '@nido/domain-types';
import { z } from 'zod';

import { IsoDateTimeSchema, LocalDateSchema, UuidSchema } from './identity.js';

export const TransactionTypeSchema = z.enum(TRANSACTION_TYPES);

export const TransactionCurrencySchema = z.enum(SUPPORTED_CURRENCY_CODES);

export const TransactionOriginSchema = z.enum(TRANSACTION_ORIGINS);

// ADR 0001: amounts and exchange rates cross the API as decimal strings, never as `number`.
// Canonical syntax only: digits and at most one decimal point, no sign, no exponential
// notation, no thousands separators, no `NaN`/`Infinity`.
export const DecimalAmountSchema = z.string().regex(/^\d+(\.\d+)?$/u);

const PYG_SCALE_REGEX = /^\d+$/u;
const USD_SCALE_REGEX = /^\d+(\.\d{1,2})?$/u;

// decimal(18,0) column bound for base_amount_pyg (ADR 0001).
const MAX_BASE_AMOUNT_PYG = '999999999999999999';

function matchesCurrencyScale(
  currency: z.infer<typeof TransactionCurrencySchema>,
  amount: string,
): boolean {
  return currency === 'PYG' ? PYG_SCALE_REGEX.test(amount) : USD_SCALE_REGEX.test(amount);
}

function exceedsMaxBaseAmountPyg(amount: string): boolean {
  const digits = amount.replace(/^0+(?=\d)/u, '');
  if (digits.length !== MAX_BASE_AMOUNT_PYG.length) {
    return digits.length > MAX_BASE_AMOUNT_PYG.length;
  }
  return digits > MAX_BASE_AMOUNT_PYG;
}

// base_amount_pyg is always PYG-scale (integral), regardless of the movement's own currency,
// and is bounded by the decimal(18,0) column it is persisted in.
export const BaseAmountPygSchema = DecimalAmountSchema.regex(PYG_SCALE_REGEX).refine(
  (value) => !exceedsMaxBaseAmountPyg(value),
  { message: `baseAmountPyg must not exceed the decimal(18,0) range (max ${MAX_BASE_AMOUNT_PYG})` },
);

export const FxRateToBaseSchema = DecimalAmountSchema;

// Currency-scale (PYG0 vs USD2) and the USD-only fxRateToBase requirement are cross-field
// rules — they depend on which currency was chosen — so they are enforced together via
// superRefine rather than on the individual field schemas.
function checkAmountCurrencyAndFxRate(
  data: {
    currency: z.infer<typeof TransactionCurrencySchema>;
    amount: string;
    fxRateToBase?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (!matchesCurrencyScale(data.currency, data.amount)) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount'],
      message:
        data.currency === 'PYG'
          ? 'PYG amounts must be integral (scale 0)'
          : 'USD amounts must have at most 2 decimals (scale 2)',
    });
  }

  const hasFxRate = data.fxRateToBase !== undefined && data.fxRateToBase !== null;
  if (data.currency === 'USD' && !hasFxRate) {
    ctx.addIssue({
      code: 'custom',
      path: ['fxRateToBase'],
      message: 'fxRateToBase is required for USD transactions',
    });
  }
  if (data.currency === 'PYG' && hasFxRate) {
    ctx.addIssue({
      code: 'custom',
      path: ['fxRateToBase'],
      message: 'fxRateToBase must be absent for PYG transactions',
    });
  }
}

export const TransactionDescriptionSchema = z.string().trim().min(1).max(200);

export const TransactionNotesSchema = z.string().trim().min(1).max(2000);

export const TransactionSchema = z
  .strictObject({
    id: UuidSchema,
    householdId: UuidSchema,
    type: TransactionTypeSchema,
    amount: DecimalAmountSchema,
    currency: TransactionCurrencySchema,
    fxRateToBase: FxRateToBaseSchema.nullable(),
    baseAmountPyg: BaseAmountPygSchema,
    occurredAt: IsoDateTimeSchema,
    localDate: LocalDateSchema,
    categoryId: UuidSchema,
    paymentSourceId: UuidSchema.nullable(),
    description: TransactionDescriptionSchema,
    notes: TransactionNotesSchema.nullable(),
    origin: TransactionOriginSchema,
    createdBy: UuidSchema,
    updatedBy: UuidSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine(checkAmountCurrencyAndFxRate);

// localDate is server-derived from occurredAt + the household timezone, and baseAmountPyg is
// server-computed (half-up rounding, per ADR 0001) — neither is accepted from the client.
export const CreateTransactionRequestSchema = z
  .strictObject({
    type: TransactionTypeSchema,
    amount: DecimalAmountSchema,
    currency: TransactionCurrencySchema,
    fxRateToBase: FxRateToBaseSchema.optional(),
    occurredAt: IsoDateTimeSchema,
    categoryId: UuidSchema,
    paymentSourceId: UuidSchema.optional(),
    description: TransactionDescriptionSchema,
    notes: TransactionNotesSchema.optional(),
  })
  .superRefine(checkAmountCurrencyAndFxRate);

export const UpdateTransactionRequestSchema = z
  .strictObject({
    type: TransactionTypeSchema.optional(),
    amount: DecimalAmountSchema.optional(),
    currency: TransactionCurrencySchema.optional(),
    fxRateToBase: FxRateToBaseSchema.nullable().optional(),
    occurredAt: IsoDateTimeSchema.optional(),
    categoryId: UuidSchema.optional(),
    paymentSourceId: UuidSchema.nullable().optional(),
    description: TransactionDescriptionSchema.optional(),
    notes: TransactionNotesSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // A partial update only carries enough context to re-check the currency/amount/fxRateToBase
    // rule when both currency and amount are present in the same payload; otherwise the current
    // persisted currency is unknown here and the domain layer re-validates against it.
    if (data.currency !== undefined && data.amount !== undefined) {
      checkAmountCurrencyAndFxRate(
        { currency: data.currency, amount: data.amount, fxRateToBase: data.fxRateToBase },
        ctx,
      );
    }
  });

export const CreateTransactionResponseSchema = z.strictObject({
  transaction: TransactionSchema,
});

export const UpdateTransactionResponseSchema = CreateTransactionResponseSchema;

export const ListTransactionsResponseSchema = z.strictObject({
  transactions: z.array(TransactionSchema),
});

// Filters per docs/system-design.md §12: date range, type, category, payment source, user,
// currency, and free-text search.
export const ListTransactionsQuerySchema = z.strictObject({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  type: TransactionTypeSchema.optional(),
  categoryId: UuidSchema.optional(),
  paymentSourceId: UuidSchema.optional(),
  createdBy: UuidSchema.optional(),
  currency: TransactionCurrencySchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type TransactionCurrency = z.infer<typeof TransactionCurrencySchema>;
export type TransactionOrigin = z.infer<typeof TransactionOriginSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;
export type UpdateTransactionRequest = z.infer<typeof UpdateTransactionRequestSchema>;
export type CreateTransactionResponse = z.infer<typeof CreateTransactionResponseSchema>;
export type UpdateTransactionResponse = z.infer<typeof UpdateTransactionResponseSchema>;
export type ListTransactionsResponse = z.infer<typeof ListTransactionsResponseSchema>;
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
