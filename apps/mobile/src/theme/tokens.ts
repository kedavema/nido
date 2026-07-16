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
  categoryColors: {
    alimentacion: {
      foreground: '#3E6B34',
      background: '#E7EFE2',
    },
    vivienda: {
      foreground: '#3E5C76',
      background: '#E4EAF1',
    },
    transporte: {
      foreground: '#7A4B6E',
      background: '#F0E6EE',
    },
    salud: {
      foreground: '#A04848',
      background: '#F7E5E5',
    },
    servicios: {
      foreground: '#3E5C76',
      background: '#E4EAF1',
    },
    ocio: {
      foreground: '#B4632F',
      background: '#F6E7DC',
    },
    otros: {
      foreground: '#5C6862',
      background: '#EDEAE2',
    },
  },
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
    scale: {
      hero: 28,
      screenTitle: 20,
      cardTitle: 17,
      body: 15,
      secondary: 13,
      label: 11,
    },
  },
  spacing: {
    base: 4,
    cardGap: 12,
    screen: 16,
    cardPadding: 16,
  },
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
    minimum: 44,
  },
} as const;

export type ThemeTokens = typeof themeTokens;
