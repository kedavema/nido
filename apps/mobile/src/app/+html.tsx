import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { themeTokens } from '@/theme/tokens';

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
      </head>
      <body style={{ backgroundColor: themeTokens.colors.background }}>{children}</body>
    </html>
  );
}
