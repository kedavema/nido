import type { CategoryBreakdownItem } from '@nido/contracts';

/**
 * INI-02 caps "Top categorías del mes" at 5 rows. The API already returns the full root-category
 * breakdown sorted descending by amount (see `monthly-summary.service.ts`), so this is a display
 * cap, not a query param — everything past it is in memory and would otherwise be dropped at
 * render, leaving five percentages that visibly fail to reach 100 % with nothing to explain the
 * gap.
 */
export const MAX_CATEGORY_ROWS = 5;

export interface CategoryBreakdownRemainder {
  /** "Salud y Otros", "Salud y Ocio", "Salud" — see `remainderLabel`. */
  readonly label: string;
  /** Digit string, `BigInt`-summed. Feed to `formatPygMagnitude`, do not parse as a number. */
  readonly amount: string;
  readonly percentage: number;
  readonly categoryCount: number;
}

/**
 * Names the categories folded into the remainder line, given *all* of their names.
 *
 * One is named alone, two are named as a pair, and three or more become "<first> y Otros". A bare
 * "Otros" would hide which categories are involved, which is the same omission this whole line
 * exists to undo, only in a smaller font.
 *
 * This has to receive the full list rather than a pre-truncated one — otherwise it cannot tell
 * "exactly two dropped" from "two of many", and would name the second category in both.
 */
function remainderLabel(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) {
    return '';
  }
  if (second === undefined) {
    return first;
  }
  return names.length === 2 ? `${first} y ${second}` : `${first} y Otros`;
}

/**
 * Everything past the display cap, collapsed into one row — or `undefined` when the breakdown fits
 * and no remainder line should render.
 *
 * Amounts are summed as `BigInt` like every other total in this app: `amount` is a digit string at
 * the API boundary and a household's monthly spend in guaraníes runs to nine digits, so summing
 * through `Number` would be a silent precision bug waiting for a large enough month.
 *
 * Percentages are plain floats and are summed as such — they are already rounded to two decimals by
 * the service, so this total can be a hair off the arithmetic difference from 100. That is the
 * service's rounding surfacing, not a new error introduced here.
 */
export function categoryBreakdownRemainder(
  items: readonly CategoryBreakdownItem[],
  limit: number = MAX_CATEGORY_ROWS,
): CategoryBreakdownRemainder | undefined {
  const dropped = items.slice(limit);
  if (dropped.length === 0) {
    return undefined;
  }

  const amount = dropped.reduce((total, item) => total + BigInt(item.amount), 0n);
  const percentage = dropped.reduce((total, item) => total + item.percentage, 0);

  return {
    label: remainderLabel(dropped.map((item) => item.categoryName)),
    amount: amount.toString(),
    percentage,
    categoryCount: dropped.length,
  };
}
