import type { SupportedCurrencyCode } from '@nido/domain-types';

import type { Prisma } from '../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

// apps/api/prisma/schema.prisma's `OccurrenceStatus` enum. `@nido/domain-types` does not export
// this set (same rationale as packages/contracts/src/occurrences.ts's identical comment), so it
// is declared here directly, mirroring recurring-item.ts's `RecurringItemKind` pattern.
export const OCCURRENCE_STATUSES = ['PENDING', 'SETTLED', 'OVERDUE', 'SKIPPED'] as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export interface OccurrenceRecord {
  readonly id: string;
  readonly recurringItemId: string;
  readonly householdId: string;
  readonly dueDate: Date;
  readonly amount: Decimal;
  readonly currency: SupportedCurrencyCode;
  readonly fxRateToBase: Decimal | null;
  readonly responsibleUserId: string | null;
  readonly status: OccurrenceStatus;
  readonly settledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** `GET .../occurrences` filters: one-or-more statuses and an inclusive due-date range. */
export interface OccurrenceListFilters {
  readonly statuses?: readonly OccurrenceStatus[];
  readonly from?: Date;
  readonly to?: Date;
}
