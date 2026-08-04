import { describe, expect, it } from 'vitest';

import {
  filterCategoryGroups,
  nextRequiredCategoryId,
  rootCategoryChips,
  selectedRootCategoryId,
  subcategoryChips,
} from './category-selection';

function category(id: string, name: string, parentId: string | null) {
  return {
    id,
    householdId: 'household-1',
    kind: 'EXPENSE',
    parentId,
    name,
    icon: 'tag',
    color: '#123456',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  } as const;
}

const food = category('food', 'Alimentación', null);
const market = category('market', 'Supermercado', 'food');
const delivery = category('delivery', 'Delivery', 'food');
const transport = category('transport', 'Transporte', null);
const fuel = category('fuel', 'Combustible', 'transport');
const categories = [food, market, delivery, transport, fuel];

describe('filterCategoryGroups', () => {
  it('returns every root and child when Todas clears the search', () => {
    expect(filterCategoryGroups(categories, '')).toEqual([
      { root: food, children: [market, delivery] },
      { root: transport, children: [fuel] },
    ]);
  });

  it('keeps all children for a root match and only matching children for a child match', () => {
    expect(filterCategoryGroups(categories, 'alimentacion')).toEqual([
      { root: food, children: [market, delivery] },
    ]);
    expect(filterCategoryGroups(categories, 'comb')).toEqual([
      { root: transport, children: [fuel] },
    ]);
  });
});

describe('category selection state', () => {
  it('keeps the parent root selected when a subcategory is selected', () => {
    expect(selectedRootCategoryId('market', categories)).toBe('food');
  });

  it('deselects an optional child back to its required root', () => {
    expect(nextRequiredCategoryId('market', market)).toBe('food');
    expect(nextRequiredCategoryId('food', food)).toBe('food');
    expect(nextRequiredCategoryId('food', fuel)).toBe('fuel');
  });
});

describe('rootCategoryChips', () => {
  const health = category('health', 'Salud', null);
  const home = category('home', 'Hogar', null);
  const manyRoots = [...categories, health, home];

  it('puts the preferred roots first and keeps their order', () => {
    expect(rootCategoryChips(manyRoots, ['home', 'transport'], 3)).toEqual([home, transport, food]);
  });

  it('pads with the remaining roots so a selection never shrinks the row', () => {
    expect(rootCategoryChips(manyRoots, ['transport'], 3)).toEqual([transport, food, health]);
  });

  it('ignores undefined preferences and duplicates', () => {
    expect(rootCategoryChips(manyRoots, [undefined, 'food', 'food'], 2)).toEqual([food, transport]);
  });

  it('never offers a child or an inactive root as a chip', () => {
    const retired = { ...category('retired', 'Retirada', null), isActive: false } as const;
    expect(rootCategoryChips([...manyRoots, retired], ['market', 'retired'], 2)).toEqual([
      food,
      transport,
    ]);
  });
});

describe('subcategoryChips', () => {
  it('returns nothing when no root is selected or the root has no children', () => {
    expect(subcategoryChips(categories, undefined, undefined, 3)).toEqual([]);
    expect(subcategoryChips([food, transport], 'food', undefined, 3)).toEqual([]);
  });

  it('lists the children of the selected root', () => {
    expect(subcategoryChips(categories, 'food', undefined, 3)).toEqual([market, delivery]);
  });

  it('pulls the selected child to the front so it stays visible past the limit', () => {
    expect(subcategoryChips(categories, 'food', 'delivery', 1)).toEqual([delivery]);
  });

  it('ignores a selected id that does not belong to the root', () => {
    expect(subcategoryChips(categories, 'food', 'fuel', 3)).toEqual([market, delivery]);
  });

  it('leaves archived children out, even when one of them is the selected id', () => {
    const archivedDelivery = { ...delivery, isActive: false } as const;
    const withArchived = [food, market, archivedDelivery, transport];
    expect(subcategoryChips(withArchived, 'food', undefined, 3)).toEqual([market]);
    expect(subcategoryChips(withArchived, 'food', 'delivery', 3)).toEqual([market]);
  });
});
