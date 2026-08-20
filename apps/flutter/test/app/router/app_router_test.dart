import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/router/app_router.dart';
import 'package:nido/app/router/app_routes.dart';

void main() {
  group('AppRouter navigation', () {
    testWidgets('resolves initial root route to FoundationScreen', (
      tester,
    ) async {
      final router = createRouter(initialLocation: AppRoutes.root);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            routerProvider.overrideWithValue(router),
          ],
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(FoundationScreen), findsOneWidget);
      expect(find.text('Nido Foundation'), findsOneWidget);
    });

    testWidgets('shows NotFoundScreen on unknown route', (tester) async {
      final router = createRouter(initialLocation: '/unknown-route-xyz');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            routerProvider.overrideWithValue(router),
          ],
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('not_found_screen')), findsOneWidget);
      expect(find.text('404 — Ruta desconocida'), findsOneWidget);
      expect(find.textContaining('/unknown-route-xyz'), findsOneWidget);
    });

    testWidgets('returns home when pressing return button on NotFoundScreen', (
      tester,
    ) async {
      final router = createRouter(initialLocation: '/some-invalid-path');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            routerProvider.overrideWithValue(router),
          ],
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('not_found_screen')), findsOneWidget);

      final returnButton = find.byKey(const Key('return_home_button'));
      expect(returnButton, findsOneWidget);

      await tester.tap(returnButton);
      await tester.pumpAndSettle();

      expect(find.byType(FoundationScreen), findsOneWidget);
    });
  });
}
