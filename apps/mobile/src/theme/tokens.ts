import { spacingScale, touchTargetMinimum, typographyScale } from './density';

export const themeTokens = {
  colors: {
    primary: '#1C4F47',
    primaryTint: '#E3EEE9',
    accent: '#B4632F',
    background: '#F6F4EF',
    surface: '#FFFFFF',
    border: '#EAE7DF',
    borderStrong: '#D8D4C9',
    ink: '#26302C',
    inkSecondary: '#5C6862',
    tabInactive: '#6B756F',
    surfaceMuted: '#EDEAE2',
  },
  semanticColors: {
    danger: {
      foreground: '#B3372E',
      background: '#FAE7E4',
    },
    warning: {
      foreground: '#8A5A00',
      background: '#FBF0DC',
    },
    success: {
      foreground: '#2F7D4E',
      background: '#E4F1E8',
    },
  },
  // Chart marks. Every bar in the app sits in a row that already names its category
  // or payment source and prints its amount, so the bar encodes magnitude only —
  // identity is carried by the text beside it. One hue for every bar keeps that
  // channel free and stops a category's own colour (chosen for chips, where a label
  // sits next to the tint) from being read as a chart mark, where nothing
  // disambiguates them. Measured at 7.73:1 against `track`, above the 3:1 floor.
  chartColors: {
    mark: '#1C4F47',
    track: '#EDEAE2',
  },
  // Colours the category form offers. A category avatar draws its glyph in the colour on a 15%
  // tint of that same colour, so the gate here is WCAG text contrast against that tint, not
  // separation between categories — each avatar sits beside its own name. Every entry clears
  // 4.5:1 (worst 4.52), derived by holding each hue and lowering lightness until it passed, then
  // maximising separation so no two cells of the picker grid look alike. The seed draws all twelve
  // of its colours from this set. A household is still free to hold a colour that is not here —
  // one it chose before the picker existed, or through the API — so the picker shows a category's
  // current colour alongside these rather than silently rewriting it on the next edit.
  categorySwatches: [
    '#3E5C76',
    '#3E6B34',
    '#7A4B6E',
    '#A04848',
    '#5C6862',
    '#6559C3',
    '#886108',
    '#99469F',
    '#026AB6',
  ],
  typography: {
    families: {
      displayMedium: 'BricolageGrotesque_500Medium',
      displaySemibold: 'BricolageGrotesque_600SemiBold',
      displayBold: 'BricolageGrotesque_700Bold',
      bodyRegular: 'IBMPlexSans_400Regular',
      bodyMedium: 'IBMPlexSans_500Medium',
      bodySemibold: 'IBMPlexSans_600SemiBold',
      bodyBold: 'IBMPlexSans_700Bold',
    },
    scale: typographyScale,
  },
  spacing: spacingScale,
  radii: {
    card: 16,
    modal: 28,
    button: 14,
    chip: 999,
  },
  shadow: {
    card: {
      color: '#1C3F36',
      offsetX: 0,
      offsetY: 1,
      blur: 2,
      opacity: 0.05,
      css: '0 1px 2px rgba(28, 63, 54, 0.05)',
    },
  },
  touchTarget: {
    minimum: touchTargetMinimum,
  },
} as const;

export type ThemeTokens = typeof themeTokens;
