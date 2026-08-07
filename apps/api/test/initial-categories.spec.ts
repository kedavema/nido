import { describe, expect, it } from 'vitest';

import { INITIAL_CATEGORIES } from '../src/categories/initial-categories.js';

/**
 * The seed's contrast gate, recomputed rather than pinned. A list of known-good hexes would still
 * pass after someone edited one — which is how six failing colors survived here in the first
 * place. The mobile app enforces the same rule on the swatches it offers, in
 * apps/mobile/src/utils/category-appearance.test.ts; the two must agree, so the math is restated
 * rather than shared, for the same reason the palette itself is duplicated.
 */
const WCAG_NORMAL_TEXT = 4.5;

/** The alpha `categoryTint` applies: `${color}26`, or 15%. */
const TINT_ALPHA = 0x26 / 255;

function channels(hex: string): readonly number[] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function relativeLuminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const luminances = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((luminances[0] ?? 0) + 0.05) / ((luminances[1] ?? 0) + 0.05);
}

/** What the tint resolves to once its alpha is composited over the white card behind it. */
function flattenedTint(color: string): string {
  const composited = channels(color)
    .map((value) => Math.round(value * TINT_ALPHA + 255 * (1 - TINT_ALPHA)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `#${composited}`;
}

describe('initial categories', () => {
  it('keeps every seeded color legible as a glyph on its own tint', () => {
    for (const category of INITIAL_CATEGORIES) {
      const tint = flattenedTint(category.color);
      expect(contrast(category.color, tint), `${category.name} ${category.color}`).toBeGreaterThan(
        WCAG_NORMAL_TEXT,
      );
    }
  });

  // Nine validated swatches cannot give twelve roots a distinct color, so sharing is expected —
  // but only across the EXPENSE/INCOME split, where the categories screen puts a section heading
  // between the two rows. Two expense roots that look alike, as Vivienda and Servicios did, leave
  // the reader nothing to tell them apart but the label.
  it('gives every root of one kind its own color', () => {
    for (const kind of ['EXPENSE', 'INCOME'] as const) {
      const colors = INITIAL_CATEGORIES.filter((category) => category.kind === kind).map(
        (category) => category.color,
      );

      expect(new Set(colors).size, `${kind} colors: ${colors.join(', ')}`).toBe(colors.length);
    }
  });

  // A data migration that has to reach one specific root identifies it by the seed signature it
  // still carries — m8's Servicios statement matches name, icon, sort order and kind together,
  // because Vivienda shares its color and every one of those fields is editable on its own. A
  // duplicated name would make that signature match a row it was never meant to touch.
  it('names every root exactly once', () => {
    const names = INITIAL_CATEGORIES.map((category) => category.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
