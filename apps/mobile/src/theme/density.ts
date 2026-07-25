// Platform-scoped density baseline.
//
// This base module holds the WEB values (unchanged from the original v0.3
// tokens) and is what Node/vitest resolves. Metro resolves `density.native.ts`
// on iOS/Android, giving native builds a roomier, more finger-friendly scale
// without touching the web pixels. Only the density-sensitive numbers live
// here; the rest of the design tokens stay in `tokens.ts` (RN-free, testable).
//
// Spacing steps `lg`/`xl`/`xxl` are new and identical across platforms — they
// are additive tokens, not a density change.

export const typographyScale = {
  hero: 28,
  screenTitle: 20,
  cardTitle: 17,
  body: 15,
  secondary: 13,
  label: 11,
} as const;

export const spacingScale = {
  base: 4,
  cardGap: 12,
  screen: 16,
  cardPadding: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const touchTargetMinimum = 44;
