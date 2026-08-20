import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../app.dart';

/// Bootstraps the Flutter application with Riverpod [ProviderScope].
Future<void> bootstrap({List<Override> overrides = const []}) async {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(ProviderScope(overrides: overrides, child: const NidoApp()));
}
