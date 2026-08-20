import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/app.dart';
import 'package:nido/core/auth/auth_client.dart';
import 'package:nido/core/auth/session_controller.dart';
import 'package:nido/core/contracts/households.dart';
import 'package:nido/core/errors/app_error.dart';
import 'package:nido/features/household/data/households_api.dart';

import 'package:nido/testing/session_fakes.dart';

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

  Future<void> pumpHome(
    WidgetTester tester, {
    HouseholdRole role = HouseholdRole.owner,
  }) async {
    auth.initialIdentity = testIdentity;
    api.onGetMe =
        () async => buildProfile(households: [buildHousehold(role: role)]);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
  }

  group('sign-in screen', () {
    testWidgets('tapping the Google CTA starts exactly one sign-in', (
      tester,
    ) async {
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();

      auth.nextSignInResult = GoogleSignInResult.cancelled;
      await tester.tap(find.byKey(const Key('google_sign_in_button')));
      await tester.pumpAndSettle();

      expect(auth.signInCalls, 1);
      // Cancellation returns to the sign-in screen, not an error.
      expect(find.byKey(const Key('sign_in_screen')), findsOneWidget);
    });
  });

  group('onboarding screen', () {
    testWidgets('create is disabled until a name is typed', (tester) async {
      auth.initialIdentity = testIdentity;
      api.onGetMe = () async => buildProfile();
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();

      final button = find.byKey(const Key('create_household_button'));
      expect(tester.widget<FilledButton>(button).onPressed, isNull);

      await tester.enterText(
        find.byKey(const Key('household_name_field')),
        'Casa Ale & Kevin',
      );
      await tester.pump();
      expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
    });

    testWidgets('greets by first name and offers sign-out', (tester) async {
      auth.initialIdentity = testIdentity;
      api.onGetMe = () async => buildProfile();
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();

      expect(
        find.text('Hola, Ale · después invitás a tu pareja'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('onboarding_sign_out_button')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('sign_in_screen')), findsOneWidget);
    });
  });

  group('household home screen', () {
    testWidgets('renders household summary and members', (tester) async {
      api.onGetMembers =
          (_) async => GetHouseholdMembersResponse(
            members: [
              buildMember(),
              buildMember(
                userId: '00000000-0000-4000-8000-000000000003',
                displayName: 'Kevin',
                role: HouseholdRole.member,
                status: HouseholdMemberStatus.removed,
              ),
            ],
          );
      await pumpHome(tester);

      expect(find.text('Casa Ale & Kevin'), findsOneWidget);
      expect(find.text('Propietario/a'), findsWidgets);
      expect(find.text('Activo'), findsOneWidget);
      expect(find.text('Removido'), findsOneWidget);
    });

    testWidgets('members failure shows the safe message and retry works', (
      tester,
    ) async {
      var failures = 1;
      api.onGetMembers = (_) async {
        if (failures > 0) {
          failures--;
          throw const UnavailableError(statusCode: 500);
        }
        return GetHouseholdMembersResponse(members: [buildMember()]);
      };
      await pumpHome(tester);

      expect(
        find.text('Nido no pudo conectarse con el servicio. Intentá de nuevo.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('retry_members_button')));
      await tester.pumpAndSettle();
      expect(find.text('Ale'), findsOneWidget);
      expect(find.text('Activo'), findsOneWidget);
    });

    testWidgets('a MEMBER sees no invitation panel', (tester) async {
      await pumpHome(tester, role: HouseholdRole.member);

      expect(find.byKey(const Key('invite_card')), findsNothing);
    });

    testWidgets(
      'owner creates a one-use invitation, sees the token once and can '
      'clear it',
      (tester) async {
        await pumpHome(tester);
        expect(find.byKey(const Key('invite_card')), findsOneWidget);

        await tester.enterText(
          find.byKey(const Key('invite_email_field')),
          'kevin@example.com',
        );
        await tester.pump();
        await tester.ensureVisible(
          find.byKey(const Key('create_invitation_button')),
        );
        await tester.tap(find.byKey(const Key('create_invitation_button')));
        await tester.pumpAndSettle();

        expect(
          find.text('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'),
          findsOneWidget,
        );
        expect(find.textContaining('Vence el 19 jul 2026'), findsOneWidget);

        await tester.ensureVisible(
          find.byKey(const Key('clear_invitation_button')),
        );
        await tester.tap(find.byKey(const Key('clear_invitation_button')));
        await tester.pumpAndSettle();

        // The token left the view for good.
        expect(
          find.text('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'),
          findsNothing,
        );
        expect(find.byKey(const Key('invite_email_field')), findsOneWidget);
      },
    );

    testWidgets('sign-out returns to the sign-in screen', (tester) async {
      await pumpHome(tester);

      await tester.ensureVisible(find.byKey(const Key('home_sign_out_button')));
      await tester.tap(find.byKey(const Key('home_sign_out_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sign_in_screen')), findsOneWidget);
      expect(auth.signOutCalls, 1);
    });

    testWidgets('expanded width renders the two-column composition', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1280, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await pumpHome(tester);

      expect(find.byKey(const Key('household_home_expanded')), findsOneWidget);
    });

    testWidgets('compact width renders the single-column composition', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await pumpHome(tester);

      expect(find.byKey(const Key('household_home_compact')), findsOneWidget);
    });
  });
}
