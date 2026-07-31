import type { HouseholdMember, Occurrence, RecurringItem } from '@nido/contracts';

import { previewUsdToBasePyg } from './expense-form';
import { deriveOccurrenceDisplayStatus } from './fijos-format';
import { formatPygMagnitude } from './movement-format';

export interface BudgetCommitmentRow {
  readonly id: string;
  readonly title: string;
  readonly dueDate: string;
  readonly status: 'OVERDUE' | 'UPCOMING' | 'PENDING';
  readonly responsibleName: string | undefined;
  readonly baseAmountPyg: string;
  readonly isEstimate: boolean;
}

export function formatBudgetPyg(value: string): string {
  const amount = BigInt(value);
  const magnitude = (amount < 0n ? -amount : amount).toString();
  return `${amount < 0n ? '−' : ''}Gs. ${formatPygMagnitude(magnitude)}`;
}

/** Percentage as hundredths of one percent, rounded half-up without floating point. */
export function budgetCategoryBasisPoints(spent: bigint, limit: bigint): bigint {
  if (limit === 0n) {
    return spent === 0n ? 0n : 10_001n;
  }
  return (spent * 10_000n + limit / 2n) / limit;
}

export function formatBudgetBasisPoints(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0').replace(/0+$/u, '');
  return fraction === '' ? whole.toString() : `${whole.toString()},${fraction}`;
}

/** Keeps zero-limit budgets honest: any nonzero use is an explicit exceeded state. */
export function effectiveBudgetPercentage(value: number, used: bigint, total: bigint): number {
  return total === 0n && used > 0n ? 100.01 : value;
}

/** Joins and ranks the three fixed-expense occurrences PRE-03 can act on. */
export function budgetCommitmentRows(
  occurrences: readonly Pick<
    Occurrence,
    | 'id'
    | 'recurringItemId'
    | 'dueDate'
    | 'amount'
    | 'currency'
    | 'fxRateToBase'
    | 'responsibleUserId'
    | 'status'
  >[],
  recurringItems: readonly Pick<RecurringItem, 'id' | 'kind' | 'name' | 'responsibleUserId'>[],
  members: readonly Pick<HouseholdMember, 'userId' | 'displayName'>[],
  todayLocal: string,
): readonly BudgetCommitmentRow[] {
  const itemsById = new Map(recurringItems.map((item) => [item.id, item]));
  const membersById = new Map(members.map((member) => [member.userId, member.displayName]));

  return occurrences
    .flatMap((occurrence): BudgetCommitmentRow[] => {
      const item = itemsById.get(occurrence.recurringItemId);
      if (
        item?.kind !== 'EXPENSE' ||
        (occurrence.status !== 'PENDING' && occurrence.status !== 'OVERDUE')
      ) {
        return [];
      }
      const status = deriveOccurrenceDisplayStatus(occurrence, todayLocal);
      if (status !== 'OVERDUE' && status !== 'UPCOMING' && status !== 'PENDING') return [];
      const responsibleUserId = occurrence.responsibleUserId ?? item.responsibleUserId;
      return [
        {
          id: occurrence.id,
          title: item.name,
          dueDate: occurrence.dueDate,
          status,
          responsibleName:
            responsibleUserId === null ? undefined : membersById.get(responsibleUserId),
          baseAmountPyg:
            occurrence.currency === 'PYG'
              ? occurrence.amount
              : previewUsdToBasePyg(occurrence.amount, occurrence.fxRateToBase ?? '0'),
          isEstimate: occurrence.currency === 'USD',
        },
      ];
    })
    .sort(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title),
    )
    .slice(0, 3);
}
