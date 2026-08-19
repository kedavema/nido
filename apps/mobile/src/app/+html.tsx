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
  /*
   * Text controls get the ring as a box-shadow rather than an outline, because a shadow follows
   * border-radius and an outline does not: on a rounded field Safari draws the outline as a plain
   * rectangle, which is the green box around the input rather than a focused input.
   *
   * The outline is cleared here too: the reset above only covers plain :focus, not :focus-visible.
   */
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${themeTokens.colors.primary};
  }
}
`;

/**
 * Registers the service worker on every page load.
 *
 * It has to happen here and not from application code, because the worker serves two purposes and
 * only one of them starts with a user action. Web Push registers it too, from the button that asks
 * for notification permission — but the offline shell has to be cached on an ordinary visit, long
 * before anyone opens notification settings. Registering the same URL twice is a no-op, so the two
 * paths do not conflict.
 *
 * Inline in the document rather than inside React so it runs even if the bundle fails to boot,
 * which is the one moment a cached shell is worth the most. `load` keeps it off the critical path.
 */
const SERVICE_WORKER_REGISTRATION_JS = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      // A failed registration is not worth surfacing: the app works online without a worker, and
      // the browser already logs the reason.
    });
  });
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
        <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_REGISTRATION_JS }} />
      </head>
      <body style={{ backgroundColor: themeTokens.colors.background }}>{children}</body>
    </html>
  );
}
