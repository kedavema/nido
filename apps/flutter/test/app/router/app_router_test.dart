import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/app.dart';
import 'package:nido/app/router/app_router.dart';
import 'package:nido/app/router/app_routes.dart';
import 'package:nido/core/auth/session_controller.dart';
import 'package:nido/core/auth/session_machine.dart';
import 'package:nido/core/contracts/households.dart';
import 'package:nido/features/household/data/households_api.dart';

import 'package:nido/testing/session_fakes.dart';

import '../../features/pump_app.dart';

void main() {
  late FakeAuthClient auth;
  late FakeHouseholdsApi api;

  setUp(() {
    auth = FakeAuthClient();
    api = FakeHouseholdsApi();
  });

  Widget app() => ProviderScope(
    overrides: [
      authClientProvider.overrideWithValue(auth),
      householdsApiProvider.overrideWithValue(api),
      householdReconciliationDelaysProvider.overrideWithValue(const [
        Duration.zero,
        Duration.zero,
        Duration.zero,
      ]),
    ],
    child: const NidoApp(),
  );

  group('redirectPathForSession (pure, idempotent)', () {
    final withHousehold = SessionAuthenticated(
      identity: testIdentity,
      profile: buildProfile(households: [buildHousehold()]),
    );
    final withoutHousehold = SessionAuthenticated(
      identity: testIdentity,
      profile: buildProfile(),
    );

    test('unresolved states never redirect (no flicker while resolving)', () {
      for (final location in [
        AppRoutes.root,
        AppRoutes.signIn,
        AppRoutes.onboarding,
        AppRoutes.invitation,
      ]) {
        expect(
          redirectPathForSession(const SessionInitializing(), location),
          isNull,
        );
        expect(
          redirectPathForSession(
            const SessionRecoverableError(message: 'x', canSignOut: true),
            location,
          ),
          isNull,
        );
      }
    });

    test('unauthenticated always lands on /sign-in and stays there', () {
      const session = SessionUnauthenticated();
      expect(redirectPathForSession(session, AppRoutes.root), AppRoutes.signIn);
      expect(
        redirectPathForSession(session, AppRoutes.onboarding),
        AppRoutes.signIn,
      );
      expect(redirectPathForSession(session, AppRoutes.signIn), isNull);
    });

    test('without household: onboarding and invitation are the only stops', () {
      expect(
        redirectPathForSession(withoutHousehold, AppRoutes.root),
        AppRoutes.onboarding,
      );
      expect(
        redirectPathForSession(withoutHousehold, AppRoutes.signIn),
        AppRoutes.onboarding,
      );
      expect(
        redirectPathForSession(withoutHousehold, AppRoutes.onboarding),
        isNull,
      );
      expect(
        redirectPathForSession(withoutHousehold, AppRoutes.invitation),
        isNull,
      );
    });

    test('with household: auth-flow routes bounce home, home stays', () {
      expect(
        redirectPathForSession(withHousehold, AppRoutes.signIn),
        AppRoutes.root,
      );
      expect(
        redirectPathForSession(withHousehold, AppRoutes.onboarding),
        AppRoutes.root,
      );
      expect(
        redirectPathForSession(withHousehold, AppRoutes.invitation),
        AppRoutes.root,
      );
      expect(redirectPathForSession(withHousehold, AppRoutes.root), isNull);
    });

    test(
      'the financial routes are open with a household and closed without',
      () {
        for (final location in [
          AppRoutes.transactions,
          AppRoutes.transactionNew,
          AppRoutes.transactionDetail('5f1b2f0a-9c3d-4e5f-8a6b-1c2d3e4f5a6b'),
          AppRoutes.categories,
          AppRoutes.paymentSources,
        ]) {
          expect(redirectPathForSession(withHousehold, location), isNull);
          // Nothing financial exists before a household does.
          expect(
            redirectPathForSession(withoutHousehold, location),
            AppRoutes.onboarding,
          );
          expect(
            redirectPathForSession(const SessionUnauthenticated(), location),
            AppRoutes.signIn,
          );
        }
      },
    );

    test('every target is a fixed point — a second evaluation never moves', () {
      final sessions = <SessionState>[
        const SessionUnauthenticated(),
        withoutHousehold,
        withHousehold,
      ];
      for (final session in sessions) {
        for (final location in [
          AppRoutes.root,
          AppRoutes.signIn,
          AppRoutes.onboarding,
          AppRoutes.invitation,
          AppRoutes.transactions,
          AppRoutes.transactionNew,
          AppRoutes.categories,
          AppRoutes.paymentSources,
        ]) {
          final target = redirectPathForSession(session, location);
          if (target != null) {
            expect(
              redirectPathForSession(session, target),
              isNull,
              reason: '$session redirected $location -> $target -> must stay',
            );
          }
        }
      }
    });
  });

  group('router + session integration', () {
    testWidgets('signed-out startup lands on the sign-in screen', (
      tester,
    ) async {
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sign_in_screen')), findsOneWidget);
    });

    testWidgets('authenticated without household lands on onboarding', (
      tester,
    ) async {
      auth.initialIdentity = testIdentity;
      api.onGetMe = () async => buildProfile();

      await tester.pumpWidget(app());
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('onboarding_screen')), findsOneWidget);
    });

    testWidgets(
      'authenticated with household lands home without duplicate getMe',
      (tester) async {
        auth.initialIdentity = testIdentity;
        api.onGetMe = () async => buildProfile(households: [buildHousehold()]);

        await tester.pumpWidget(app());
        await tester.pumpAndSettle();

        expect(find.byKey(const Key('household_home_screen')), findsOneWidget);
        // The redirect itself issues no requests: exactly one profile load.
        expect(api.getMeCalls, 1);
      },
    );

    testWidgets('onboarding links into the invitation screen and back', (
      tester,
    ) async {
      auth.initialIdentity = testIdentity;
      api.onGetMe = () async => buildProfile();

      await tester.pumpWidget(app());
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('open_invitation_button')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('invitation_screen')), findsOneWidget);
    });

    testWidgets('accepting an invitation moves home', (tester) async {
      auth.initialIdentity = testIdentity;
      var accepted = false;
      api.onGetMe =
          () async => buildProfile(
            households:
                accepted
                    ? [buildHousehold(role: HouseholdRole.member)]
                    : const [],
          );
      api.onAcceptInvite = (token) async {
        accepted = true;
        return AcceptHouseholdInviteResponse(
          household: buildHousehold(role: HouseholdRole.member),
        );
      };

      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('open_invitation_button')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('invitation_token_field')),
        'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('accept_invitation_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('household_home_screen')), findsOneWidget);
    });

    testWidgets('unknown route shows NotFoundScreen', (tester) async {
      final router = createRouter(initialLocation: '/unknown-route-xyz');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [routerProvider.overrideWithValue(router)],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('not_found_screen')), findsOneWidget);
      expect(find.textContaining('/unknown-route-xyz'), findsOneWidget);
    });
  });

  group('legacy Expo URLs redirect to their canonical route', () {
    /// Opening the app *at* a URL is exactly what a direct Web refresh or an
    /// external link does, so this covers both.
    Future<String> openAt(WidgetTester tester, String location) async {
      final harness = FinanceHarness();
      await harness.pumpWithRealRedirects(tester, location);
      return harness.currentLocation;
    }

    testWidgets('/movimientos becomes /transactions', (tester) async {
      expect(await openAt(tester, '/movimientos'), '/transactions');
      expect(find.byKey(const Key('transactions_screen')), findsOneWidget);
    });

    testWidgets('a legacy link keeps its query string', (tester) async {
      // A shared link that encoded a filter has to keep it, or the redirect
      // silently widens what the recipient sees.
      expect(
        await openAt(tester, '/nuevo-gasto?type=INCOME'),
        '/transactions/new?type=INCOME',
      );
      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);
      expect(find.text('Nuevo ingreso'), findsWidgets);
    });

    testWidgets('/movimiento/:id carries the id across', (tester) async {
      const id = '5f1b2f0a-9c3d-4e5f-8a6b-1c2d3e4f5a6b';
      expect(await openAt(tester, '/movimiento/$id'), '/transactions/$id');
      expect(
        find.byKey(const Key('transaction_detail_screen')),
        findsOneWidget,
      );
    });

    testWidgets('/transactions/new is not read as a movement id', (
      tester,
    ) async {
      final harness = FinanceHarness();
      await harness.pumpWithRealRedirects(tester, AppRoutes.transactionNew);

      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);
      expect(find.byKey(const Key('transaction_detail_screen')), findsNothing);
    });
  });
}
