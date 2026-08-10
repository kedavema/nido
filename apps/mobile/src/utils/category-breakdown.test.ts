import type { CategoryBreakdownItem } from '@nido/contracts';
import { describe, expect, it } from 'vitest';

import { MAX_CATEGORY_ROWS, categoryBreakdownRemainder } from './category-breakdown';

function item(name: string, amount: string, percentage: number): CategoryBreakdownItem {
  return {
    categoryId: `00000000-0000-4000-8000-${name.padEnd(12, '0').slice(0, 12)}`,
    categoryName: name,
    amount,
    percentage,
  };
}

/** Five rows of filler, so a test only has to describe what sits past the cap. */
function fillToCap(): CategoryBreakdownItem[] {
  return Array.from({ length: MAX_CATEGORY_ROWS }, (_, index) =>
    item(`Top${index.toString()}`, '1000', 10),
  );
}

describe('categoryBreakdownRemainder', () => {
  it('returns undefined when nothing is dropped', () => {
    expect(categoryBreakdownRemainder(fillToCap())).toBeUndefined();
  });

  it('returns undefined for an empty breakdown', () => {
    expect(categoryBreakdownRemainder([])).toBeUndefined();
  });

  it('sums amount and percentage across every dropped category', () => {
    const remainder = categoryBreakdownRemainder([
      ...fillToCap(),
      item('Salud', '3000000', 21),
      item('Ocio', '1500000', 10.5),
      item('Otros', '1260000', 8.5),
    ]);

    expect(remainder).toEqual({
      label: 'Salud y Otros',
      amount: '5760000',
      percentage: 40,
      categoryCount: 3,
    });
  });

  it('names the single dropped category without an "y"', () => {
    const remainder = categoryBreakdownRemainder([...fillToCap(), item('Salud', '900', 4)]);

    expect(remainder?.label).toBe('Salud');
    expect(remainder?.categoryCount).toBe(1);
  });

  it('names both when exactly two are dropped', () => {
    const remainder = categoryBreakdownRemainder([
      ...fillToCap(),
      item('Salud', '900', 4),
      item('Ocio', '100', 1),
    ]);

    expect(remainder?.label).toBe('Salud y Ocio');
  });

  /**
   * The reason this sums as `BigInt`. Two categories at ~4.5e15 guaraníes exceed
   * `Number.MAX_SAFE_INTEGER` once added, and a float sum would round the total silently. The
   * amount is a digit string at the API boundary precisely so this cannot happen.
   */
  it('does not lose precision on amounts past Number.MAX_SAFE_INTEGER', () => {
    const remainder = categoryBreakdownRemainder([
      ...fillToCap(),
      item('Salud', '4503599627370497', 50),
      item('Ocio', '4503599627370497', 50),
    ]);

    expect(remainder?.amount).toBe('9007199254740994');
  });

  it('honours an explicit limit', () => {
    const remainder = categoryBreakdownRemainder(
      [item('A', '100', 60), item('B', '40', 25), item('C', '15', 15)],
      1,
    );

    expect(remainder).toEqual({
      label: 'B y C',
      amount: '55',
      percentage: 40,
      categoryCount: 2,
    });
  });
});
