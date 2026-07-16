import { Platform, type ViewStyle } from 'react-native';

import { themeTokens } from './tokens';

const cardShadow = themeTokens.shadow.card;

export const cardShadowStyle: ViewStyle = Platform.select<ViewStyle>({
  web: {
    boxShadow: cardShadow.css,
  },
  default: {
    elevation: 1,
    shadowColor: cardShadow.color,
    shadowOffset: {
      width: cardShadow.offsetX,
      height: cardShadow.offsetY,
    },
    shadowOpacity: cardShadow.opacity,
    shadowRadius: cardShadow.blur,
  },
});
