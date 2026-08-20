import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/auth/auth_client.dart';
import 'package:nido/core/auth/session_controller.dart';
import 'package:nido/core/auth/session_machine.dart';
import 'package:nido/core/contracts/households.dart';
import 'package:nido/core/errors/app_error.dart';
import 'package:nido/features/household/data/households_api.dart';

import 'package:nido/testing/session_fakes.dart';

/// Behavior port of `apps/mobile/src/auth/session-provider.tsx`: request
/// versioning, per-uid getMe dedup, identity guards, and bounded household
/// reconciliation.
void main() {
  late FakeAuthClient auth;
  late FakeHouseholdsApi api;
  late ProviderContainer container;

  ProviderContainer createContainer() {
    final container = ProviderContainer(
      overrides: [
        authClientProvider.overrideWithValue(auth),
        householdsApiProvider.overrideWithValue(api),
        householdReconciliationDelaysProvider.overrideWithValue(const [
          Duration.zero,
          Duration.zero,
          Duration.zero,
        ]),
      ],
    );
    addTearDown(container.dispose);
    // Riverpod providers are lazy; the session machine must exist (and
    // subscribe) before the event queue is pumped, like the app's root
    // widget does by watching it.
    container.listen(sessionControllerProvider, (_, _) {});
    return container;
  }

  SessionState state() => container.read(sessionControllerProvider);
  SessionController controller() =>
      container.read(sessionControllerProvider.notifier);

  setUp(() {
    auth = FakeAuthClient();
    api = FakeHouseholdsApi();
  });

  test(
    'starts initializing and resolves signed-out to unauthenticated',
    () async {
      container = createContainer();

      expect(state(), isA<SessionInitializing>());
      await pumpEventQueue();
      expect(state(), isA<SessionUnauthenticated>());
    },
  );

  test('loads the profile for a restored identity', () async {
    auth.initialIdentity = testIdentity;
    api.onGetMe = () async => buildProfile(households: [buildHousehold()]);
    container = createContainer();

    await pumpEventQueue();

    final resolved = state();
    expect(resolved, isA<SessionAuthenticated>());
    resolved as SessionAuthenticated;
    expect(resolved.identity.uid, testIdentity.uid);
    expect(resolved.activeHousehold?.name, 'Casa Ale & Kevin');
    expect(api.getMeCalls, 1);
  });

  test('deduplicates getMe across a burst of identity events', () async {
    auth.initialIdentity = testIdentity;
    container = createContainer();
    await null; // let _connect subscribe, before the identity microtask runs
    auth
      ..emit(testIdentity)
      ..emit(testIdentity);

    await pumpEventQueue();

    expect(state(), isA<SessionAuthenticated>());
    expect(api.getMeCalls, 1);
  });

  test('a failed profile load resolves to a recoverable error that can sign '
      'out', () async {
    auth.initialIdentity = testIdentity;
    api.onGetMe = () async => throw const NetworkError();
    container = createContainer();

    await pumpEventQueue();

    final resolved = state();
    expect(resolved, isA<SessionRecoverableError>());
    resolved as SessionRecoverableError;
    expect(resolved.canSignOut, isTrue);
    expect(
      resolved.message,
      'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.',
    );
  });

  test('a profile arriving after sign-out is discarded', () async {
    auth.initialIdentity = testIdentity;
    var release = Completer<void>();
    api.onGetMe = () async {
      await release.future;
      return buildProfile(households: [buildHousehold()]);
    };
    container = createContainer();
    await pumpEventQueue();
    expect(state(), isA<SessionInitializing>());

    auth.emit(null);
    await pumpEventQueue();
    release.complete();
    await pumpEventQueue();

    expect(state(), isA<SessionUnauthenticated>());
  });

  test('cancelled Google sign-in returns to unauthenticated', () async {
    container = createContainer();
    await pumpEventQueue();
    auth.nextSignInResult = GoogleSignInResult.cancelled;

    await controller().signIn();
    await pumpEventQueue();

    expect(state(), isA<SessionUnauthenticated>());
    expect(auth.signInCalls, 1);
  });

  test('successful sign-in resolves through the auth subscription', () async {
    api.onGetMe = () async => buildProfile();
    container = createContainer();
    await pumpEventQueue();

    await controller().signIn();
    await pumpEventQueue();

    expect(state(), isA<SessionAuthenticated>());
    expect(destinationForSession(state()), SessionDestination.onboarding);
  });

  test('sign-out clears the session even before auth resolves', () async {
    auth.initialIdentity = testIdentity;
    api.onGetMe = () async => buildProfile(households: [buildHousehold()]);
    container = createContainer();
    await pumpEventQueue();
    expect(state(), isA<SessionAuthenticated>());

    await controller().signOut();
    await pumpEventQueue();

    expect(state(), isA<SessionUnauthenticated>());
    expect(auth.signOutCalls, 1);
  });

  test('createHousehold reloads the profile after success', () async {
    auth.initialIdentity = testIdentity;
    var households = <String>[];
    api.onGetMe =
        () async => buildProfile(
          households: [for (final id in households) buildHousehold(id: id)],
        );
    api.onCreateHousehold = (name) async {
      households = ['00000000-0000-4000-8000-000000000002'];
      return CreateHouseholdResponse(
        household: HouseholdDetail(
          summary: buildHousehold(),
          createdByUserId: '00000000-0000-4000-8000-000000000001',
          createdAt: DateTime.utc(2026, 7, 16, 12, 5),
          updatedAt: DateTime.utc(2026, 7, 16, 12, 5),
        ),
      );
    };
    container = createContainer();
    await pumpEventQueue();

    await controller().createHousehold('Casa Ale & Kevin');
    await pumpEventQueue();

    final resolved = state();
    expect(resolved, isA<SessionAuthenticated>());
    expect(destinationForSession(resolved), SessionDestination.home);
    expect(api.createHouseholdCalls, 1);
  });

  test(
    'createHousehold reconciles a lost response instead of resubmitting',
    () async {
      auth.initialIdentity = testIdentity;
      var committed = false;
      api.onGetMe =
          () async => buildProfile(
            households: committed ? [buildHousehold()] : const [],
          );
      api.onCreateHousehold = (name) async {
        committed = true; // the server applied it; the response was lost
        throw const NetworkError();
      };
      container = createContainer();
      await pumpEventQueue();
      expect(destinationForSession(state()), SessionDestination.onboarding);

      await controller().createHousehold('Casa Ale & Kevin');
      await pumpEventQueue();

      expect(destinationForSession(state()), SessionDestination.home);
      expect(api.createHouseholdCalls, 1);
    },
  );

  test('createHousehold rethrows a definitive failure', () async {
    auth.initialIdentity = testIdentity;
    api.onGetMe = () async => buildProfile();
    api.onCreateHousehold = (name) async => throw const ValidationError();
    container = createContainer();
    await pumpEventQueue();

    await expectLater(
      controller().createHousehold('Casa'),
      throwsA(isA<ValidationError>()),
    );
    expect(destinationForSession(state()), SessionDestination.onboarding);
  });

  test('acceptInvitation reconciles an ambiguous 409 conflict', () async {
    auth.initialIdentity = testIdentity;
    var committed = false;
    api.onGetMe =
        () async => buildProfile(
          households:
              committed
                  ? [buildHousehold(role: HouseholdRole.member)]
                  : const [],
        );
    api.onAcceptInvite = (token) async {
      committed = true;
      throw const ConflictError(statusCode: 409);
    };
    container = createContainer();
    await pumpEventQueue();

    await controller().acceptInvitation(
      'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE',
    );
    await pumpEventQueue();

    expect(destinationForSession(state()), SessionDestination.home);
  });

  test(
    'acceptInvitation rejects a malformed token before any request',
    () async {
      auth.initialIdentity = testIdentity;
      api.onGetMe = () async => buildProfile();
      container = createContainer();
      await pumpEventQueue();

      await expectLater(
        controller().acceptInvitation('not-a-token'),
        throwsA(isA<ValidationError>()),
      );
      expect(api.acceptInviteCalls, 1); // validated inside the API double
    },
  );

  test('an auth stream error surfaces as recoverable with sign-out', () async {
    container = createContainer();
    await pumpEventQueue();

    auth.emitError(StateError('stream broke'));
    await pumpEventQueue();

    final resolved = state();
    expect(resolved, isA<SessionRecoverableError>());
    expect((resolved as SessionRecoverableError).canSignOut, isTrue);
  });

  test('retry rebuilds the auth wiring', () async {
    container = createContainer();
    await pumpEventQueue();
    auth.emitError(StateError('stream broke'));
    await pumpEventQueue();
    expect(state(), isA<SessionRecoverableError>());

    controller().retry();
    await pumpEventQueue();

    expect(auth.subscribeCount, 2);
    expect(state(), isA<SessionUnauthenticated>());
  });
}
