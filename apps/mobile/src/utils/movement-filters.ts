import type { Category, Transaction, TransactionType } from '@nido/contracts';

import { categoryGroups, type CategoryGroup } from './category-selection';

/**
 * What Movimientos can narrow by. Deliberately two fields: Moneda and Medio de pago were removed
 * (#228) because the search box already covers merchant, note and amount, and a currency filter
 * only earns its place in a household running two currencies in parallel.
 */
export interface MovementFilters {
  readonly type?: TransactionType | undefined;
  readonly categoryId?: string | undefined;
}

export interface MovementFilterChip {
  readonly key: 'type' | 'categoryId';
  readonly label: string;
}

export function activeFilterCount(filters: MovementFilters): number {
  return (filters.type === undefined ? 0 : 1) + (filters.categoryId === undefined ? 0 : 1);
}

/**
 * Every category id a selection should match: the category itself, plus its children when it is a
 * root. The taxonomy is exactly two levels, so children are the whole descendant set.
 *
 * This exists because the API matches `categoryId` exactly (`transactions.service.ts`), which made
 * selecting a root return only what was filed directly on it — invisible while the picker was a
 * flat list, and a lie once the list groups children under their parent. Applied on the client
 * because a month's transactions arrive in one unpaginated response; if that ever changes, the
 * contract needs `categoryId` to become a set.
 */
export function categoryFilterIds(
  categoryId: string,
  categories: readonly Category[],
): ReadonlySet<string> {
  const children = categories
    .filter((category) => category.parentId === categoryId)
    .map((category) => category.id);

  return new Set([categoryId, ...children]);
}

/** Applies the filters this screen resolves locally. Type and search are applied by the API. */
export function applyLocalMovementFilters(
  transactions: readonly Transaction[],
  filters: MovementFilters,
  categories: readonly Category[],
): readonly Transaction[] {
  const { categoryId } = filters;

  if (categoryId === undefined) return transactions;

  const wanted = categoryFilterIds(categoryId, categories);
  return transactions.filter((transaction) => wanted.has(transaction.categoryId));
}

/** Shared with the sheet's segmented control so one copy change reaches both surfaces. */
export const TYPE_LABELS: Readonly<Record<TransactionType, string>> = {
  EXPENSE: 'Gastos',
  INCOME: 'Ingresos',
};

/**
 * The applied filters, for the chips that stay visible outside the sheet. A filter you cannot see
 * is a filter you forget, and then a narrowed list reads as missing data.
 *
 * A selection whose category no longer exists still produces a chip — labelled generically, since
 * there is no name left to print. Dropping it would leave the list narrowed with nothing on screen
 * saying so, which is the failure the chips exist to prevent.
 */
export function movementFilterChips(
  filters: MovementFilters,
  categories: readonly Category[],
): readonly MovementFilterChip[] {
  const chips: MovementFilterChip[] = [];

  if (filters.type !== undefined) {
    chips.push({ key: 'type', label: TYPE_LABELS[filters.type] });
  }

  if (filters.categoryId !== undefined) {
    const selected = categories.find((category) => category.id === filters.categoryId);
    const parent =
      selected?.parentId === null || selected?.parentId === undefined
        ? undefined
        : categories.find((category) => category.id === selected.parentId);

    chips.push({
      key: 'categoryId',
      label:
        selected === undefined
          ? 'Categoría filtrada'
          : parent === undefined
            ? selected.name
            : `${parent.name} · ${selected.name}`,
    });
  }

  return chips;
}

/**
 * The tree the sheet renders. Only active categories, except that a selected-but-archived one is
 * kept so its row stays visible and clearable from inside the sheet — the same reason the chips
 * outside keep it.
 *
 * Order is whatever the API returned: `sortOrder`, then name. That is the curated order every
 * other category surface shows, and a filter list that disagreed with the picker beside it would
 * make the same household's categories look like two different sets.
 */
export function movementCategoryTree(
  categories: readonly Category[],
  selectedCategoryId: string | undefined,
): readonly CategoryGroup[] {
  const selected = categories.find((category) => category.id === selectedCategoryId);
  // Its parent too: an archived child under an archived root would otherwise have no root to hang
  // from and would vanish from the sheet, taking its only clear affordance with it.
  const keptParentId = selected?.parentId ?? undefined;
  const visible = categories.filter(
    (category) =>
      category.isActive || category.id === selectedCategoryId || category.id === keptParentId,
  );

  return categoryGroups(visible);
}
