import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/firebase_environment.dart';
import '../app.dart';

/// Bootstraps the Flutter application with Riverpod [ProviderScope].
///
/// Firebase initializes here only when the build carries a complete public
/// configuration (`--dart-define`, see [FirebaseEnvironment]). A build
/// without one still boots: the session machine resolves to a recoverable
/// error naming the missing keys instead of crashing at startup — the same
/// behavior the legacy client had for a broken public environment.
Future<void> bootstrap({List<Override> overrides = const []}) async {
  WidgetsFlutterBinding.ensureInitialized();

  if (FirebaseEnvironment.isConfigured) {
    await Firebase.initializeApp(
      options: FirebaseEnvironment.require().toFirebaseOptions(),
    );
  }

  runApp(ProviderScope(overrides: overrides, child: const NidoApp()));
}
