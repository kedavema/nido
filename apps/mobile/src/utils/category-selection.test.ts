import { describe, expect, it } from 'vitest';

import {
  filterCategoryGroups,
  nextRequiredCategoryId,
  selectedRootCategoryId,
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
