// Native (iOS/Android) density scale — resolved by Metro on device, while web
// and Node/vitest fall back to `density.ts`. Body/secondary/label are bumped up
// and the minimum touch target grows so the app reads as a native app rather
// than a dense web page. Keep the object shape identical to `density.ts`.

export const typographyScale = {
  hero: 28,
  screenTitle: 20,
  cardTitle: 17,
  body: 16,
  secondary: 14,
  label: 12,
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

export const touchTargetMinimum = 48;
