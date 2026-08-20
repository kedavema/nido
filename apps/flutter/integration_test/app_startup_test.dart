import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nido/app/app.dart';
import 'package:nido/core/auth/session_controller.dart';
import 'package:nido/features/household/data/households_api.dart';

import 'package:nido/testing/session_fakes.dart';

/// M2 E2E startup: the app boots, the session machine resolves, and the
/// router redirects to the sign-in screen without flicker or duplicate
/// profile requests. Auth is faked (a real Google login cannot run headless);
/// the real-credential login is a separately reported manual check.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('M2 E2E startup', () {
    testWidgets('boots signed-out and resolves to the sign-in screen', (
      tester,
    ) async {
      final auth = FakeAuthClient();
      final api = FakeHouseholdsApi();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authClientProvider.overrideWithValue(auth),
            householdsApiProvider.overrideWithValue(api),
          ],
          child: const NidoApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sign_in_screen')), findsOneWidget);
      expect(find.text('Continuar con Google'), findsOneWidget);
      // The redirect issued no profile requests while signed out.
      expect(api.getMeCalls, 0);
    });

    testWidgets('a restored session with household resolves straight home', (
      tester,
    ) async {
      final auth = FakeAuthClient(initialIdentity: testIdentity);
      final api =
          FakeHouseholdsApi()
            ..onGetMe =
                (() async => buildProfile(households: [buildHousehold()]));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authClientProvider.overrideWithValue(auth),
            householdsApiProvider.overrideWithValue(api),
          ],
          child: const NidoApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('household_home_screen')), findsOneWidget);
      expect(api.getMeCalls, 1);
    });
  });
}
