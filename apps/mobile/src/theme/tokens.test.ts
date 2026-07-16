import { describe, expect, it } from 'vitest';

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

  it('contains the seven fixed category color pairs', () => {
    expect(themeTokens.categoryColors).toEqual({
      alimentacion: { foreground: '#3E6B34', background: '#E7EFE2' },
      vivienda: { foreground: '#3E5C76', background: '#E4EAF1' },
      transporte: { foreground: '#7A4B6E', background: '#F0E6EE' },
      salud: { foreground: '#A04848', background: '#F7E5E5' },
      servicios: { foreground: '#3E5C76', background: '#E4EAF1' },
      ocio: { foreground: '#B4632F', background: '#F6E7DC' },
      otros: { foreground: '#5C6862', background: '#EDEAE2' },
    });
  });

  it('keeps the canonical type, spacing, shape, shadow, and touch scales', () => {
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
});
