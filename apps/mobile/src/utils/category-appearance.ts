import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * Ionicons' own name union. The import is type-only on purpose: it gives `tsc` the vocabulary to
 * reject a misspelled icon at build time, while keeping this module free of the native dependency
 * so it stays testable in node — the same trick `navigation/tabs.ts` uses.
 *
 * It only constrains names written in this repo. Names read back from the API need
 * `resolveCategoryIcon` below.
 */
export type CategoryIconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Icons the category form offers. The twelve names the seed uses lead the list, so every seeded
 * category stays representable in the grid; the rest cover what households actually add.
 */
export const CATEGORY_ICONS: readonly CategoryIconName[] = [
  'home',
  'restaurant',
  'car',
  'medical',
  'flash',
  'game-controller',
  'briefcase',
  'laptop',
  'return-down-back',
  'pricetag',
  'add-circle',
  'ellipsis-horizontal',
  'cart',
  'shirt',
  'school',
  'paw',
  'airplane',
  'gift',
  'barbell',
  'book',
  'cash',
  'card',
  'water',
  'wifi',
];

export const FALLBACK_CATEGORY_ICON: CategoryIconName = 'pricetag';

/**
 * Guards a stored icon before it reaches Ionicons. The type union above only constrains values
 * chosen through the picker; `CategoryIconSchema` accepts any string, and the free-text field
 * this picker replaces is precisely how existing rows got their icon. Ionicons answers a name it
 * does not know with a literal `?` glyph rather than failing, so without this the categories most
 * likely to hold a typo are the ones that would display one.
 *
 * The glyph map is a parameter rather than an import so this stays free of the native module and
 * testable in node. A name Ionicons knows but this app does not offer still passes through — it
 * renders correctly, and there is no reason to overwrite a working choice.
 */
export function resolveCategoryIcon(
  icon: string,
  glyphMap: Readonly<Record<string, unknown>>,
): CategoryIconName {
  return Object.hasOwn(glyphMap, icon) ? (icon as CategoryIconName) : FALLBACK_CATEGORY_ICON;
}

/**
 * The category avatar background: the colour at 15% over the card. Every surface that draws one
 * composes it this way, and `themeTokens.categorySwatches` was measured against exactly this
 * tint, so the two have to move together.
 */
export function categoryTint(color: string): string {
  return `${color}26`;
}

/**
 * Keeps a category's current value selectable even when it is not one of the offered options.
 * Six seed colours fail the contrast gate and are absent from `categorySwatches`; without this,
 * opening the form on such a category and saving would silently change it.
 */
export function optionsWithCurrent<T extends string>(
  options: readonly T[],
  current: T,
): readonly T[] {
  return options.includes(current) ? options : [current, ...options];
}
