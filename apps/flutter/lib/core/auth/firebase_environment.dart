import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import '../errors/app_error.dart';

/// Public Firebase configuration via `--dart-define`, mirroring the legacy
/// `EXPO_PUBLIC_FIREBASE_*` values (`apps/mobile/src/config/public-environment.ts`).
/// All of these are public bundle configuration — API keys for Firebase are
/// identifiers, not secrets — but they are still never committed: each build
/// passes its own values.
///
/// iOS values come from the NEW iOS Firebase/Google configuration (FLT-001):
/// the Android/web client ids do not carry over automatically.
const String _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
const String _authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
const String _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
const String _appId = String.fromEnvironment('FIREBASE_APP_ID');
const String _messagingSenderId = String.fromEnvironment(
  'FIREBASE_MESSAGING_SENDER_ID',
);

/// OAuth client of type Web — required on every platform: it is the audience
/// the backend verifies ID Tokens against.
const String _googleWebClientId = String.fromEnvironment(
  'GOOGLE_WEB_CLIENT_ID',
);

/// OAuth client of type iOS — required only for the iOS native flow.
const String _googleIosClientId = String.fromEnvironment(
  'GOOGLE_IOS_CLIENT_ID',
);

/// Validated Firebase/Google public environment.
class FirebaseEnvironment {
  const FirebaseEnvironment._({
    required this.apiKey,
    required this.authDomain,
    required this.projectId,
    required this.appId,
    required this.messagingSenderId,
    required this.googleWebClientId,
    required this.googleIosClientId,
  });

  final String apiKey;
  final String authDomain;
  final String projectId;
  final String appId;
  final String messagingSenderId;
  final String googleWebClientId;
  final String googleIosClientId;

  /// The `--dart-define` keys that are missing for this platform. Empty list
  /// means the environment is complete.
  static List<String> missingDefines({bool? isWeb, bool? isIos}) {
    final web = isWeb ?? kIsWeb;
    final ios =
        isIos ?? (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS);
    return <String>[
      if (_apiKey.isEmpty) 'FIREBASE_API_KEY',
      if (web && _authDomain.isEmpty) 'FIREBASE_AUTH_DOMAIN',
      if (_projectId.isEmpty) 'FIREBASE_PROJECT_ID',
      if (_appId.isEmpty) 'FIREBASE_APP_ID',
      if (_messagingSenderId.isEmpty) 'FIREBASE_MESSAGING_SENDER_ID',
      if (_googleWebClientId.isEmpty) 'GOOGLE_WEB_CLIENT_ID',
      if (ios && _googleIosClientId.isEmpty) 'GOOGLE_IOS_CLIENT_ID',
    ];
  }

  /// Whether the current build carries a complete Firebase configuration.
  static bool get isConfigured => missingDefines().isEmpty;

  /// Reads and validates the environment, or throws a [ConfigurationError]
  /// naming the missing keys (never their values).
  static FirebaseEnvironment require() {
    final missing = missingDefines();
    if (missing.isNotEmpty) {
      throw ConfigurationError(missing);
    }
    return const FirebaseEnvironment._(
      apiKey: _apiKey,
      authDomain: _authDomain,
      projectId: _projectId,
      appId: _appId,
      messagingSenderId: _messagingSenderId,
      googleWebClientId: _googleWebClientId,
      googleIosClientId: _googleIosClientId,
    );
  }

  FirebaseOptions toFirebaseOptions() {
    return FirebaseOptions(
      apiKey: apiKey,
      appId: appId,
      messagingSenderId: messagingSenderId,
      projectId: projectId,
      authDomain: kIsWeb ? authDomain : null,
      iosClientId: googleIosClientId.isEmpty ? null : googleIosClientId,
    );
  }
}
