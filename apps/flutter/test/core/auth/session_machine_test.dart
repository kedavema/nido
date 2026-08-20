import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/auth/session_machine.dart';
import 'package:nido/core/contracts/households.dart';

import 'package:nido/testing/session_fakes.dart';

/// Port of `apps/mobile/src/auth/session-machine.test.ts` — same scenarios,
/// same expected destinations.
void main() {
  group('session state machine', () {
    test('routes a signed-out identity to sign in', () {
      const state = SessionUnauthenticated();
      expect(destinationForSession(state), SessionDestination.signIn);
    });

    test('routes an authenticated user without a household to onboarding', () {
      final state = SessionAuthenticated(
        identity: testIdentity,
        profile: buildProfile(),
      );

      expect(state.activeHousehold, isNull);
      expect(destinationForSession(state), SessionDestination.onboarding);
    });

    test('routes an authenticated member to the canonical home', () {
      final state = SessionAuthenticated(
        identity: testIdentity,
        profile: buildProfile(
          households: [buildHousehold(role: HouseholdRole.member)],
        ),
      );

      expect(destinationForSession(state), SessionDestination.home);
      expect(state.activeHousehold?.role, HouseholdRole.member);
    });

    test('keeps errors explicit and remembers whether sign out is safe', () {
      const state = SessionRecoverableError(
        message: 'No pudimos conectar.',
        canSignOut: true,
      );

      expect(destinationForSession(state), SessionDestination.error);
      expect(state.message, 'No pudimos conectar.');
      expect(state.canSignOut, isTrue);
    });

    test('resolves initializing to its own destination', () {
      expect(
        destinationForSession(const SessionInitializing()),
        SessionDestination.initializing,
      );
    });

    test(
      'detects a household added while reconciling an ambiguous mutation',
      () {
        final profile = buildProfile(
          households: [
            buildHousehold(
              id: '00000000-0000-4000-8000-000000000003',
              name: 'Casa reconciliada',
              role: HouseholdRole.member,
            ),
          ],
        );

        expect(
          hasNewHousehold({'00000000-0000-4000-8000-000000000002'}, profile),
          isTrue,
        );
        expect(
          hasNewHousehold({'00000000-0000-4000-8000-000000000003'}, profile),
          isFalse,
        );
      },
    );

    test('rejects a reconciled profile after sign-out or account switch', () {
      expect(canApplyProfileForIdentity(null, testIdentity.uid), isFalse);
      expect(
        canApplyProfileForIdentity('another-uid', testIdentity.uid),
        isFalse,
      );
      expect(
        canApplyProfileForIdentity(testIdentity.uid, testIdentity.uid),
        isTrue,
      );
    });

    test('active household is deliberately the first result (FLT-014)', () {
      final state = SessionAuthenticated(
        identity: testIdentity,
        profile: buildProfile(
          households: [
            buildHousehold(id: '00000000-0000-4000-8000-000000000002'),
            buildHousehold(
              id: '00000000-0000-4000-8000-000000000003',
              name: 'Otro hogar',
            ),
          ],
        ),
      );

      expect(state.activeHousehold?.id, '00000000-0000-4000-8000-000000000002');
    });
  });
}
