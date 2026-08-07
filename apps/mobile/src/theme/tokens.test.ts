import { describe, expect, it } from 'vitest';

import * as densityWeb from './density';
import * as densityNative from './density.native';
import { themeTokens } from './tokens';

describe('canonical Nido v0.3 theme tokens', () => {
  it('keeps the light foundation palette exact', () => {
    expect(themeTokens.colors).toMatchObject({
      primary: '#1C4F47',
      primaryTint: '#E3EEE9',
      accent: '#B4632F',
      background: '#F6F4EF',
      surface: '#FFFFFF',
      border: '#EAE7DF',
      ink: '#26302C',
      inkSecondary: '#5C6862',
    });
  });

  it('keeps every semantic foreground and tint paired', () => {
    expect(themeTokens.semanticColors).toEqual({
      danger: { foreground: '#B3372E', background: '#FAE7E4' },
      warning: { foreground: '#8A5A00', background: '#FBF0DC' },
      success: { foreground: '#2F7D4E', background: '#E4F1E8' },
    });
  });

  // The mark is a single validated hue, not a per-category colour: every bar in the app
  // sits beside its own name and amount, so colour would re-encode what the row already
  // says. Measured at 7.73:1 against the track, above the 3:1 floor for chart marks —
  // changing either value means re-measuring, which is why they are pinned here.
  it('exposes one validated chart mark on its track', () => {
    expect(themeTokens.chartColors).toEqual({
      mark: '#1C4F47',
      track: '#EDEAE2',
    });
  });

  it('keeps the canonical web type, spacing, shape, shadow, and touch scales', () => {
    // themeTokens resolves the web/node density baseline (density.ts).
    expect(themeTokens.typography.scale).toEqual({
      hero: 28,
      screenTitle: 20,
      cardTitle: 17,
      body: 15,
      secondary: 13,
      label: 11,
    });
    expect(themeTokens.spacing).toEqual({
      base: 4,
      cardGap: 12,
      screen: 16,
      cardPadding: 16,
      lg: 20,
      xl: 24,
      xxl: 32,
    });
    expect(themeTokens.radii).toEqual({
      card: 16,
      modal: 28,
      button: 14,
      chip: 999,
    });
    expect(themeTokens.shadow.card).toMatchObject({
      offsetX: 0,
      offsetY: 1,
      blur: 2,
      opacity: 0.05,
    });
    expect(themeTokens.touchTarget.minimum).toBe(44);
  });

  it('gives the native density scale the same shape with roomier values', () => {
    // Metro resolves density.native.ts on device; assert its shape matches the
    // web baseline (same keys) while density-sensitive values are larger.
    expect(Object.keys(densityNative.typographyScale)).toEqual(
      Object.keys(densityWeb.typographyScale),
    );
    expect(Object.keys(densityNative.spacingScale)).toEqual(Object.keys(densityWeb.spacingScale));
    expect(densityNative.typographyScale.body).toBeGreaterThan(densityWeb.typographyScale.body);
    expect(densityNative.typographyScale.label).toBeGreaterThan(densityWeb.typographyScale.label);
    expect(densityNative.typographyScale.secondary).toBeGreaterThan(
      densityWeb.typographyScale.secondary,
    );
    expect(densityNative.touchTargetMinimum).toBeGreaterThan(densityWeb.touchTargetMinimum);
  });
});
