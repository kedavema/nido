import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'api_config.dart';

/// The clock every time-dependent provider reads. Overridden in tests for
/// determinism; production leaves the default.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Where the API lives (see [resolveApiBaseUrl] for the per-platform rule).
final apiBaseUrlProvider = Provider<String>((ref) => resolveApiBaseUrl());

/// Supplies the Firebase ID Token per request. Real implementation arrives
/// with M2 authentication; foundation fails loudly instead of shipping a
/// fake session.
final idTokenProvider = Provider<IdTokenProvider>((ref) {
  return () =>
      throw UnimplementedError(
        'Firebase authentication is implemented in M2; override idTokenProvider',
      );
});

/// The application's single [ApiClient]. Tests override [idTokenProvider]
/// and/or [apiBaseUrlProvider] (or this provider entirely) rather than
/// touching network or Firebase.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: ref.watch(apiBaseUrlProvider),
    getIdToken: ref.watch(idTokenProvider),
  );
});
