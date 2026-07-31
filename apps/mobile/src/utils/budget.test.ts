import { describe, expect, it } from 'vitest';

import {
  budgetAllocationDrafts,
  buildBudgetUpsertInput,
  editableBudgetRootCategoryIds,
  summarizeBudgetDraft,
} from './budget';

const foodId = '00000000-0000-4000-8000-000000000021';
const housingId = '00000000-0000-4000-8000-000000000022';

describe('budget draft helpers', () => {
  it('uses bigint for totals beyond Number.MAX_SAFE_INTEGER', () => {
    expect(
      summarizeBudgetDraft('999999999999999999', [
        { categoryId: foodId, amountPyg: '9007199254740993' },
      ]),
    ).toMatchObject({
      allocatedPyg: 9007199254740993n,
      remainingPyg: 990992800745259006n,
      hasInvalidAmount: false,
      exceedsTotal: false,
    });
  });

  it('omits empty and zero allocations from a valid PUT payload', () => {
    expect(
      buildBudgetUpsertInput('15000000', [
        { categoryId: foodId, amountPyg: '3410000' },
        { categoryId: housingId, amountPyg: '0' },
        { categoryId: '00000000-0000-4000-8000-000000000023', amountPyg: '' },
      ]),
    ).toEqual({
      totalLimitPyg: '15000000',
      allocations: [{ categoryId: foodId, amountPyg: '3410000' }],
    });
  });

  it('rejects missing, oversized, malformed, or over-allocated drafts', () => {
    expect(buildBudgetUpsertInput('', [])).toBeUndefined();
    expect(
      buildBudgetUpsertInput('100', [{ categoryId: foodId, amountPyg: '101' }]),
    ).toBeUndefined();
    expect(
      buildBudgetUpsertInput('100', [{ categoryId: foodId, amountPyg: '1.5' }]),
    ).toBeUndefined();
    expect(buildBudgetUpsertInput('9'.repeat(19), [])).toBeUndefined();
  });

  it('hydrates rows in catalog order and leaves unallocated categories empty', () => {
    expect(
      budgetAllocationDrafts([housingId, foodId], {
        id: '00000000-0000-4000-8000-000000000030',
        householdId: '00000000-0000-4000-8000-000000000011',
        month: '2026-07',
        totalLimitPyg: '15000000',
        allocations: [{ categoryId: foodId, amountPyg: '3410000' }],
        unallocatedPyg: '11590000',
        copiedFromId: null,
      }),
    ).toEqual([
      { categoryId: housingId, amountPyg: '' },
      { categoryId: foodId, amountPyg: '3410000' },
    ]);
  });

  it('keeps archived allocated roots editable without exposing other archived categories', () => {
    const category = (id: string, isActive: boolean, parentId: string | null = null) => ({
      id,
      householdId: '00000000-0000-4000-8000-000000000011',
      kind: 'EXPENSE' as const,
      parentId,
      name: id,
      icon: 'wallet',
      color: '#123456',
      sortOrder: 0,
      isActive,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    const budgetMonth = {
      id: '00000000-0000-4000-8000-000000000030',
      householdId: '00000000-0000-4000-8000-000000000011',
      month: '2026-07',
      totalLimitPyg: '100',
      allocations: [{ categoryId: housingId, amountPyg: '50' }],
      unallocatedPyg: '50',
      copiedFromId: null,
    };

    expect(
      editableBudgetRootCategoryIds(
        [
          category(foodId, true),
          category(housingId, false),
          category('archived', false),
          category('child', true, foodId),
        ],
        budgetMonth,
      ),
    ).toEqual([foodId, housingId]);
  });
});
