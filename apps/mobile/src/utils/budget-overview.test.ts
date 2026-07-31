import { describe, expect, it } from 'vitest';

import {
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
