import { describe, expect, it } from 'vitest';

import {
  budgetCommitmentRows,
  budgetCategoryBasisPoints,
  formatBudgetBasisPoints,
  formatBudgetPyg,
} from './budget-overview';

describe('budget overview formatting', () => {
  it('calculates category percentages with bigint beyond the safe-number range', () => {
    expect(budgetCategoryBasisPoints(9007199254740993n, 999999999999999999n)).toBe(90n);
    expect(formatBudgetBasisPoints(90n)).toBe('0,9');
  });

  it('rounds to basis points and keeps percentages over 100 explicit', () => {
    const percentage = budgetCategoryBasisPoints(3_410_000n, 3_200_000n);
    expect(percentage).toBe(10_656n);
    expect(formatBudgetBasisPoints(percentage)).toBe('106,56');
  });

  it('treats spend against a zero limit as exceeded instead of dividing by zero', () => {
    expect(budgetCategoryBasisPoints(1n, 0n)).toBe(10_001n);
    expect(budgetCategoryBasisPoints(0n, 0n)).toBe(0n);
  });

  it('formats signed PYG decimal strings without converting them to numbers', () => {
    expect(formatBudgetPyg('-9007199254740993')).toBe('−Gs. 9.007.199.254.740.993');
  });
});

describe('budgetCommitmentRows', () => {
  const expense = {
    id: 'expense',
    kind: 'EXPENSE' as const,
    name: 'Alquiler',
    responsibleUserId: 'member-a',
  };
  const baseOccurrence = {
    id: 'occurrence-a',
    recurringItemId: expense.id,
    dueDate: '2026-07-20',
    amount: '2800000',
    currency: 'PYG' as const,
    fxRateToBase: null,
    responsibleUserId: null,
    status: 'PENDING' as const,
  };
  const members = [{ userId: 'member-a', displayName: 'Ale' }];

  it('keeps only pending expenses, resolves the responsible member, and derives overdue state', () => {
    const rows = budgetCommitmentRows(
      [
        { ...baseOccurrence, id: 'overdue', dueDate: '2026-07-10' },
        { ...baseOccurrence, id: 'settled', status: 'SETTLED' },
        { ...baseOccurrence, id: 'missing', recurringItemId: 'missing' },
        { ...baseOccurrence, id: 'income', recurringItemId: 'income' },
      ],
      [expense, { ...expense, id: 'income', kind: 'INCOME' as const, name: 'Sueldo' }],
      members,
      '2026-07-15',
    );

    expect(rows).toEqual([
      expect.objectContaining({ id: 'overdue', status: 'OVERDUE', responsibleName: 'Ale' }),
    ]);
  });

  it('sorts by due date, caps the list at three, and honors an occurrence override', () => {
    const rows = budgetCommitmentRows(
      [20, 18, 17, 19].map((day) => ({
        ...baseOccurrence,
        id: `day-${day.toString()}`,
        dueDate: `2026-07-${day.toString()}`,
        responsibleUserId: day === 17 ? 'member-b' : null,
      })),
      [expense],
      [...members, { userId: 'member-b', displayName: 'Kevon' }],
      '2026-07-15',
    );

    expect(rows.map((row) => row.id)).toEqual(['day-17', 'day-18', 'day-19']);
    expect(rows[0]?.responsibleName).toBe('Kevon');
  });

  it('converts USD commitments with server-compatible half-up rounding', () => {
    const [row] = budgetCommitmentRows(
      [
        {
          ...baseOccurrence,
          amount: '45.91',
          currency: 'USD',
          fxRateToBase: '7350',
        },
      ],
      [expense],
      members,
      '2026-07-15',
    );

    expect(row).toMatchObject({ baseAmountPyg: '337439', isEstimate: true });
  });
});
