import 'package:flutter/foundation.dart';

/// Build-time API location (`--dart-define=API_URL=...`), public
/// configuration — never a secret.
const String _configuredApiUrl = String.fromEnvironment('API_URL');

/// Path a same-origin deployment proxies to the API, matching the legacy
/// PWA's Cloudflare Pages function (`SAME_ORIGIN_API_PATH`).
const String sameOriginApiPath = '/api';

/// Resolves where the API lives, preserving the legacy per-platform rule
/// (`apps/mobile/src/config/api-url*.ts`):
///
/// * Everywhere: an explicit `API_URL` define wins (local development, where
///   app and API are two ports with no proxy).
/// * Web without a define: this page's own origin + `/api`. The deployment
///   decides where `/api` points; nothing is baked into the bundle and the
///   request stays same-origin (no CORS to maintain).
/// * Native without a define: there is no runtime origin to fall back to —
///   a binary is rebuilt to point elsewhere anyway — so this fails fast
///   instead of inventing one.
String resolveApiBaseUrl({Uri Function() webOrigin = _currentOrigin}) {
  if (_configuredApiUrl.isNotEmpty) {
    return _configuredApiUrl;
  }
  if (kIsWeb) {
    final origin = webOrigin();
    return '${origin.origin}$sameOriginApiPath';
  }
  throw StateError(
    'API_URL is required on native builds: pass --dart-define=API_URL=<url>',
  );
}

Uri _currentOrigin() => Uri.base;
