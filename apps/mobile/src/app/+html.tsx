import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { themeTokens } from '@/theme/tokens';

/**
 * react-native-web renders real `<input>` elements, so the browser draws its own `:focus` ring on
 * a design that never planned for one — most visibly on the `hero` amount field, which has no
 * border of its own, so the ring reads as a stray box. React Native has no outline concept, so
 * none of this exists on Android and none of it can be expressed in a StyleSheet.
 *
 * `:focus-visible` rather than `:focus` is the whole point: the browser matches it only when the
 * focus came from the keyboard. A pointer user sees nothing; a keyboard user keeps a clear
 * indicator. Dropping the ring outright would trade a cosmetic complaint for an accessibility
 * defect.
 *
 * Global rather than per-component because the ring appears on every focusable element, including
 * pressables that become focusable divs — one rule here cannot be forgotten by the next component.
 *
 * The `@supports` guard is load-bearing. A browser that does not implement `:focus-visible` drops
 * that rule as an unparseable selector but still applies `outline: none`, which would leave
 * keyboard users with no focus indicator at all — strictly worse than the default ring this
 * replaces. Guarded, such a browser simply keeps its own ring.
 */
const FOCUS_RING_CSS = `
@supports selector(:focus-visible) {
  :focus { outline: none; }
  :focus-visible {
    outline: 2px solid ${themeTokens.colors.primary};
    outline-offset: 2px;
  }
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es-PY">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport" />
        <meta content={themeTokens.colors.background} name="theme-color" />
        <meta content="Nido" name="application-name" />
        <meta content="yes" name="mobile-web-app-capable" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/icon-192.png" rel="apple-touch-icon" sizes="192x192" />
        <link href="/icon.svg" rel="icon" type="image/svg+xml" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: FOCUS_RING_CSS }} />
      </head>
      <body style={{ backgroundColor: themeTokens.colors.background }}>{children}</body>
    </html>
  );
}
