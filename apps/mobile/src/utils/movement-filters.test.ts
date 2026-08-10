import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  applyLocalMovementFilters,
  categoryFilterIds,
  movementCategoryTree,
  movementFilterChips,
} from './movement-filters';

function category(id: string, name: string, parentId: string | null, isActive = true) {
  return {
    id,
    householdId: 'household-1',
    kind: 'EXPENSE',
    parentId,
    name,
    icon: 'tag',
    color: '#123456',
    sortOrder: 0,
    isActive,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  } as const;
}

function transaction(id: string, categoryId: string) {
  return {
    id,
    householdId: 'household-1',
    categoryId,
    paymentSourceId: null,
    type: 'EXPENSE',
    amount: '1000',
    currency: 'PYG',
    fxRateToBase: null,
    baseAmountPyg: '1000',
    occurredAt: '2026-08-02T12:00:00.000Z',
    localDate: '2026-08-02',
    description: 'Compra',
    notes: null,
    origin: 'MANUAL',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
  } as const;
}

const ALIMENTOS = category('alimentos', 'Alimentos', null);
const SUPERMERCADO = category('supermercado', 'Supermercado', 'alimentos');
const POSTRES = category('postres', 'Postres', 'alimentos');
const FARMACIA = category('farmacia', 'Farmacia', null);
const CATEGORIES = [ALIMENTOS, SUPERMERCADO, POSTRES, FARMACIA] as const;

describe('activeFilterCount', () => {
  it('counts only what is set', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ type: 'EXPENSE' })).toBe(1);
    expect(activeFilterCount({ type: 'EXPENSE', categoryId: 'alimentos' })).toBe(2);
  });
});

describe('categoryFilterIds', () => {
  it('includes a root and its children, which is the whole point of the change', () => {
    expect([...categoryFilterIds('alimentos', CATEGORIES)].sort()).toEqual([
      'alimentos',
      'postres',
      'supermercado',
    ]);
  });

  it('matches only itself for a child, which has none of its own', () => {
    expect([...categoryFilterIds('supermercado', CATEGORIES)]).toEqual(['supermercado']);
  });

  it('matches only itself for a childless root', () => {
    expect([...categoryFilterIds('farmacia', CATEGORIES)]).toEqual(['farmacia']);
  });
});

describe('applyLocalMovementFilters', () => {
  const transactions = [
    transaction('t1', 'alimentos'),
    transaction('t2', 'supermercado'),
    transaction('t3', 'farmacia'),
  ] as const;

  it('keeps a subcategory movement when its root is the filter', () => {
    const kept = applyLocalMovementFilters(transactions, { categoryId: 'alimentos' }, CATEGORIES);

    expect(kept.map((item) => item.id)).toEqual(['t1', 't2']);
  });

  it('narrows to the subcategory alone when that is what was picked', () => {
    const kept = applyLocalMovementFilters(
      transactions,
      { categoryId: 'supermercado' },
      CATEGORIES,
    );

    expect(kept.map((item) => item.id)).toEqual(['t2']);
  });

  it('returns the same list untouched when no category is filtered', () => {
    expect(applyLocalMovementFilters(transactions, { type: 'EXPENSE' }, CATEGORIES)).toBe(
      transactions,
    );
  });
});

describe('movementFilterChips', () => {
  it('names a subcategory with its parent, so the chip is unambiguous', () => {
    expect(movementFilterChips({ categoryId: 'supermercado' }, CATEGORIES)).toEqual([
      { key: 'categoryId', label: 'Alimentos · Supermercado' },
    ]);
  });

  it('names a root on its own', () => {
    expect(movementFilterChips({ categoryId: 'alimentos' }, CATEGORIES)).toEqual([
      { key: 'categoryId', label: 'Alimentos' },
    ]);
  });

  it('still shows a chip for a category that no longer exists, so the list cannot look empty for no reason', () => {
    expect(movementFilterChips({ categoryId: 'deleted' }, CATEGORIES)).toEqual([
      { key: 'categoryId', label: 'Categoría filtrada' },
    ]);
  });

  it('orders type before category and translates the type', () => {
    expect(movementFilterChips({ type: 'INCOME', categoryId: 'farmacia' }, CATEGORIES)).toEqual([
      { key: 'type', label: 'Ingresos' },
      { key: 'categoryId', label: 'Farmacia' },
    ]);
  });
});

describe('movementCategoryTree', () => {
  it('groups children under their root, keeping the order the API curated', () => {
    const tree = movementCategoryTree(CATEGORIES, undefined);

    expect(tree.map((group) => group.root.name)).toEqual(['Alimentos', 'Farmacia']);
    // Given order, not alphabetical: the API sorts by `sortOrder` and every other category
    // surface shows that order, so re-sorting here would make one household's categories look
    // like two different sets depending on the screen.
    expect(tree[0]?.children.map((child) => child.name)).toEqual(['Supermercado', 'Postres']);
  });

  it('hides archived categories', () => {
    const retired = category('retired', 'Retirada', 'alimentos', false);
    const tree = movementCategoryTree([...CATEGORIES, retired], undefined);

    expect(tree[0]?.children.map((child) => child.id)).toEqual(['supermercado', 'postres']);
  });

  it('keeps an archived category that is the current selection, so it stays clearable', () => {
    const retired = category('retired', 'Retirada', 'alimentos', false);
    const tree = movementCategoryTree([...CATEGORIES, retired], 'retired');

    expect(tree[0]?.children.map((child) => child.id)).toContain('retired');
  });

  it('keeps the root of a selected archived child even when that root is archived too', () => {
    const deadRoot = category('dead-root', 'Vieja', null, false);
    const deadChild = category('dead-child', 'Vieja sub', 'dead-root', false);
    const tree = movementCategoryTree([...CATEGORIES, deadRoot, deadChild], 'dead-child');

    expect(tree.map((group) => group.root.id)).toContain('dead-root');
    expect(tree.find((group) => group.root.id === 'dead-root')?.children[0]?.id).toBe('dead-child');
  });
});
