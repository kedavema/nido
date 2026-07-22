import type { SupportedCurrencyCode, TransactionOrigin, TransactionType } from '@nido/domain-types';

import type { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

export interface TransactionRecord {
  readonly id: string;
  readonly householdId: string;
  readonly type: TransactionType;
  readonly amount: Decimal;
  readonly currency: SupportedCurrencyCode;
  readonly fxRateToBase: Decimal | null;
  readonly baseAmountPyg: Decimal;
  readonly occurredAt: Date;
  readonly localDate: Date;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly description: string;
  readonly notes: string | null;
  readonly origin: TransactionOrigin;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** ADR 0003: the offline mutation UUID the client sent, when it did; null otherwise. */
  readonly clientMutationId: string | null;
  /** ADR 0003: SHA-256 hex digest of the semantic request payload, when idempotent; null otherwise. */
  readonly clientMutationHash: string | null;
}

export interface CreateTransactionRecordInput {
  readonly householdId: string;
  readonly type: TransactionType;
  readonly amount: Decimal;
  readonly currency: SupportedCurrencyCode;
  readonly fxRateToBase: Decimal | null;
  readonly baseAmountPyg: Decimal;
  readonly occurredAt: Date;
  readonly localDate: Date;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly description: string;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly updatedBy: string;
  /** ADR 0003: present together, or both null when the client did not opt into idempotency. */
  readonly clientMutationId: string | null;
  readonly clientMutationHash: string | null;
}

/**
 * `baseAmountPyg` and `localDate` are always included even when the fields they derive from
 * did not change: the service recomputes both from the merged effective state on every update
 * so the derived columns can never drift from `amount`/`currency`/`fxRateToBase`/`occurredAt`.
 * `updatedBy` is likewise always set from the authenticated actor, never the client.
 */
export interface UpdateTransactionRecordChanges {
  readonly type?: TransactionType;
  readonly amount?: Decimal;
  readonly currency?: SupportedCurrencyCode;
  readonly fxRateToBase: Decimal | null;
  readonly baseAmountPyg: Decimal;
  readonly occurredAt?: Date;
  readonly localDate: Date;
  readonly categoryId?: string;
  readonly paymentSourceId?: string | null;
  readonly description?: string;
  readonly notes?: string | null;
  readonly updatedBy: string;
}

export interface ListTransactionsFilter {
  readonly from?: string;
  readonly to?: string;
  readonly type?: TransactionType;
  readonly categoryId?: string;
  readonly paymentSourceId?: string;
  readonly createdBy?: string;
  readonly currency?: SupportedCurrencyCode;
  readonly search?: string;
}

/** Income and expense sums (`base_amount_pyg`) over a `local_date` range, per ADR 0007. */
export interface MonthlyTotals {
  readonly income: Decimal;
  readonly expense: Decimal;
}

/**
 * One category's expense total (`base_amount_pyg`) over a `local_date` range, grouped by the
 * transaction's own `category_id` (leaf or root). Root-category attribution of subcategory
 * spend — folding a leaf's total into its parent's — is done by `MonthlySummaryService` using
 * `CategoriesRepository`, not here: the category hierarchy is category-module business logic,
 * this repository only owns the money aggregation (ADR 0007).
 */
export interface CategoryExpenseTotal {
  readonly categoryId: string;
  readonly amount: Decimal;
}
