import type { Category } from '@nido/contracts';

export interface CategoryGroup {
  readonly root: Category;
  readonly children: readonly Category[];
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('es');
}

/** Builds the root/child tree used by every transaction category picker. */
export function categoryGroups(categories: readonly Category[]): readonly CategoryGroup[] {
  return categories
    .filter((category) => category.parentId === null)
    .map((root) => ({
      root,
      children: categories.filter((category) => category.parentId === root.id),
    }));
}

/**
 * Filters a category tree without losing context: a root match keeps all its
 * children, while a child-only match keeps its parent and only matching children.
 */
export function filterCategoryGroups(
  categories: readonly Category[],
  search: string,
): readonly CategoryGroup[] {
  const query = normalizeSearchValue(search);
  const groups = categoryGroups(categories);
  if (query === '') return groups;

  return groups.flatMap((group) => {
    if (normalizeSearchValue(group.root.name).includes(query)) return [group];

    const children = group.children.filter((child) =>
      normalizeSearchValue(child.name).includes(query),
    );
    return children.length === 0 ? [] : [{ root: group.root, children }];
  });
}

/** Resolves a selected subcategory to the root chip that owns it. */
export function selectedRootCategoryId(
  selectedCategoryId: string | undefined,
  categories: readonly Category[],
): string | undefined {
  const selected = categories.find((category) => category.id === selectedCategoryId);
  return selected?.parentId ?? selected?.id;
}

/**
 * The root chips a form shows above the picker: preferred roots first (the
 * selected one, then whatever the caller ranks as recent), padded with the
 * remaining active roots so selecting a category never collapses the row to a
 * single chip.
 */
export function rootCategoryChips(
  categories: readonly Category[],
  preferredRootIds: readonly (string | undefined)[],
  limit: number,
): readonly Category[] {
  const roots = categories.filter((category) => category.parentId === null && category.isActive);
  return orderedByPreference(
    roots,
    preferredRootIds,
    roots.map((root) => root.id),
  ).slice(0, limit);
}

/**
 * The child chips for the selected root, with the selected child pulled to the
 * front so it stays visible even when the root has more children than `limit`.
 */
export function subcategoryChips(
  categories: readonly Category[],
  selectedRootId: string | undefined,
  selectedCategoryId: string | undefined,
  limit: number,
): readonly Category[] {
  if (selectedRootId === undefined) return [];
  const children = categories.filter(
    (category) => category.parentId === selectedRootId && category.isActive,
  );
  return orderedByPreference(
    children,
    [children.find((child) => child.id === selectedCategoryId)?.id],
    children.map((child) => child.id),
  ).slice(0, limit);
}

/** Resolves ids to categories in preference order, deduplicated, dropping unknowns. */
function orderedByPreference(
  pool: readonly Category[],
  preferred: readonly (string | undefined)[],
  rest: readonly string[],
): readonly Category[] {
  const ids = [
    ...new Set([...preferred, ...rest].filter((id): id is string => id !== undefined)),
  ];
  return ids
    .map((id) => pool.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Category => candidate !== undefined);
}

/**
 * Categories are required, but subcategories are optional. Tapping an already
 * selected child therefore removes only that child and falls back to its root;
 * tapping a root never clears the required category into an invalid state.
 */
export function nextRequiredCategoryId(
  currentCategoryId: string | undefined,
  selected: Category,
): string {
  if (selected.parentId !== null && currentCategoryId === selected.id) {
    return selected.parentId;
  }
  return selected.id;
}
