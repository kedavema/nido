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
