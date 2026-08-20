import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/app_router.dart';
import 'theme/app_theme.dart';

/// Root application widget configuring theme and declarative routing.
class NidoApp extends ConsumerWidget {
  const NidoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Nido',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.createLightTheme(),
      routerConfig: router,
    );
  }
}
