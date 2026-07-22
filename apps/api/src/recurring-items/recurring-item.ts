import type { FrequencyKind, SupportedCurrencyCode, TransactionType } from '@nido/domain-types';

import type { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

// `RecurringItemKind` is Prisma's own DB enum (`recurring_item_kind`) but shares the exact same
// EXPENSE|INCOME domain as `TransactionType` (see packages/contracts/src/recurring-items.ts's
// comment on `RecurringItemKindSchema`), so `TransactionType` is reused here rather than adding
// an identical type.
export type RecurringItemKind = TransactionType;

export interface RecurringItemRecord {
  readonly id: string;
  readonly householdId: string;
  readonly kind: RecurringItemKind;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly responsibleUserId: string | null;
  readonly estimatedAmount: Decimal;
  readonly currency: SupportedCurrencyCode;
  readonly plannedFxRateToBase: Decimal | null;
  readonly frequency: FrequencyKind;
  readonly intervalMonths: number | null;
  readonly firstDueDate: Date;
  readonly endDate: Date | null;
  readonly notificationOffsets: readonly number[];
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One generated occurrence due date plus the money/responsibility fields copied from the rule at
 * generation time (docs/system-design.md §6.4, Prisma schema comment on `Occurrence`) — editing
 * the rule later must never rewrite an occurrence that already exists.
 */
export interface GeneratedOccurrenceInput {
  readonly dueDate: Date;
  readonly amount: Decimal;
  readonly currency: SupportedCurrencyCode;
  readonly fxRateToBase: Decimal | null;
  readonly responsibleUserId: string | null;
}

export interface CreateRecurringItemRecordInput {
  readonly householdId: string;
  readonly kind: RecurringItemKind;
  readonly name: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly responsibleUserId: string | null;
  readonly estimatedAmount: Decimal;
  readonly currency: SupportedCurrencyCode;
  readonly plannedFxRateToBase: Decimal | null;
  readonly frequency: FrequencyKind;
  readonly intervalMonths: number | null;
  readonly firstDueDate: Date;
  readonly endDate: Date | null;
  readonly notificationOffsets: readonly number[];
}

export interface UpdateRecurringItemRecordChanges {
  readonly kind?: RecurringItemKind;
  readonly name?: string;
  readonly description?: string | null;
  readonly categoryId?: string;
  readonly paymentSourceId?: string | null;
  readonly responsibleUserId?: string | null;
  readonly estimatedAmount?: Decimal;
  readonly currency?: SupportedCurrencyCode;
  readonly plannedFxRateToBase?: Decimal | null;
  readonly frequency?: FrequencyKind;
  readonly intervalMonths?: number | null;
  readonly firstDueDate?: Date;
  readonly endDate?: Date | null;
  readonly notificationOffsets?: readonly number[];
  readonly isActive?: boolean;
}
