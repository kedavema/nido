import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session_controller.dart';
import 'api_client.dart';
import 'api_config.dart';

/// The clock every time-dependent provider reads. Overridden in tests for
/// determinism; production leaves the default.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Where the API lives (see [resolveApiBaseUrl] for the per-platform rule).
final apiBaseUrlProvider = Provider<String>((ref) => resolveApiBaseUrl());

/// Supplies the Firebase ID Token per request, straight from the Firebase
/// SDK session (M2). Returning `null` means "no session"; refresh stays
/// inside the SDK. Tests override [authClientProvider] (or this provider).
final idTokenProvider = Provider<IdTokenProvider>((ref) {
  final auth = ref.watch(authClientProvider);
  return auth.getIdToken;
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
