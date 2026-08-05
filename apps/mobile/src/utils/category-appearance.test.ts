import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  categoryTint,
  optionsWithCurrent,
  resolveCategoryIcon,
} from './category-appearance';
import { themeTokens } from '../theme/tokens';

/**
 * The swatch gate, recomputed here rather than pinned. A hardcoded list of "known good" hexes
 * would still pass after someone edited one — which is exactly how six failing colours ended up
 * in the seed. Measuring in the test makes the rule enforceable instead of merely documented.
 */
const WCAG_NORMAL_TEXT = 4.5;

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

/** What `categoryTint` resolves to once its alpha is composited over the white card. */
function flattenedTint(color: string): string {
  const alpha = Number.parseInt(categoryTint(color).slice(7, 9), 16) / 255;
  const composited = channels(color)
    .map((value) => Math.round(value * alpha + 255 * (1 - alpha)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `#${composited}`;
}

describe('category appearance', () => {
  it('tints a colour at the alpha the swatches were measured against', () => {
    expect(categoryTint('#3E5C76')).toBe('#3E5C7626');
  });

  it('keeps every offered swatch legible as a glyph on its own tint', () => {
    for (const swatch of themeTokens.categorySwatches) {
      const tint = flattenedTint(swatch);
      expect(contrast(swatch, tint), `${swatch} on ${tint}`).toBeGreaterThanOrEqual(
        WCAG_NORMAL_TEXT,
      );
    }
  });

  it('offers no two swatches that render as the same colour', () => {
    expect(new Set(themeTokens.categorySwatches).size).toBe(themeTokens.categorySwatches.length);
  });

  // The seed lives in apps/api and the app must not import it, so the names are restated here —
  // the same deliberate duplication initial-categories.ts already documents for the palette.
  it('can represent every icon the seed ships', () => {
    const seeded = [
      'home',
      'restaurant',
      'car',
      'medical',
      'flash',
      'game-controller',
      'ellipsis-horizontal',
      'briefcase',
      'laptop',
      'return-down-back',
      'pricetag',
      'add-circle',
    ];
    for (const icon of seeded) {
      expect(CATEGORY_ICONS, `seed icon ${icon}`).toContain(icon);
    }
  });

  // Ionicons answers an unknown name with a literal '?' glyph instead of failing, so a row whose
  // icon was hand-typed into the field this picker replaces would display one.
  it('falls back when the stored icon is not a name Ionicons knows', () => {
    const glyphMap = { home: 1, pricetag: 2 };

    expect(resolveCategoryIcon('definitely-not-an-icon', glyphMap)).toBe(FALLBACK_CATEGORY_ICON);
    expect(resolveCategoryIcon('', glyphMap)).toBe(FALLBACK_CATEGORY_ICON);
  });

  it('keeps an icon Ionicons knows even when the grid does not offer it', () => {
    const glyphMap = { football: 1, pricetag: 2 };

    expect(CATEGORY_ICONS).not.toContain('football');
    expect(resolveCategoryIcon('football', glyphMap)).toBe('football');
  });

  it('does not treat inherited Object members as known glyphs', () => {
    expect(resolveCategoryIcon('toString', { pricetag: 1 })).toBe(FALLBACK_CATEGORY_ICON);
  });

  it('keeps an off-palette current value selectable, at the front', () => {
    // Ocio's #B4632F fails the gate and is absent from the set; editing that category must not
    // silently rewrite its colour just because the picker cannot offer it.
    const options = optionsWithCurrent(themeTokens.categorySwatches, '#B4632F');

    expect(options[0]).toBe('#B4632F');
    expect(options).toHaveLength(themeTokens.categorySwatches.length + 1);
  });

  it('does not duplicate a current value that is already offered', () => {
    expect(optionsWithCurrent(themeTokens.categorySwatches, '#3E5C76')).toEqual(
      themeTokens.categorySwatches,
    );
  });
});
