import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/household/data/households_api.dart';
import '../contracts/households.dart';
import '../errors/app_error.dart';
import 'auth_client.dart';
import 'auth_error_messages.dart';
import 'authenticated_identity.dart';
import 'firebase_auth_client.dart';
import 'firebase_environment.dart';
import 'session_machine.dart';

/// The real [AuthClient]. Requires a complete Firebase `--dart-define`
/// environment (validated here — a partial configuration surfaces as a
/// [ConfigurationError] naming the missing keys) and `bootstrap()` having
/// initialized Firebase. Tests override this provider with a fake.
final authClientProvider = Provider<AuthClient>((ref) {
  final environment = FirebaseEnvironment.require();
  if (Firebase.apps.isEmpty) {
    // Configuration is present but bootstrap didn't initialize Firebase —
    // a wiring bug, not a user-recoverable condition.
    throw StateError('bootstrap() must initialize Firebase before use');
  }
  return FirebaseAuthClient(
    auth: FirebaseAuth.instance,
    environment: environment,
  );
});

/// Bounded backoff for reconciling an ambiguous household mutation (the
/// legacy `HOUSEHOLD_RECONCILIATION_DELAYS_MILLISECONDS`). Overridden with
/// zeros in tests.
final householdReconciliationDelaysProvider = Provider<List<Duration>>((ref) {
  return const <Duration>[
    Duration.zero,
    Duration(milliseconds: 300),
    Duration(seconds: 1),
  ];
});

/// The single session machine the router and every screen read (port of
/// `apps/mobile/src/auth/session-provider.tsx`). Invariants preserved:
///
/// * `getMe` is deduplicated per uid, so a burst of identity events causes
///   ONE profile request — the go_router redirect never issues requests.
/// * Every async completion is guarded by a request version AND the current
///   identity: a stale response can never overwrite a newer state, and a
///   profile can never be applied after sign-out or an account switch.
/// * A household mutation whose response was lost (network/timeout — the
///   commit is ambiguous) reconciles against `getMe` with bounded retries
///   instead of blind resubmission.
final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);

class SessionController extends Notifier<SessionState> {
  AuthClient? _auth;
  void Function()? _unsubscribe;
  bool _disposed = false;

  AuthenticatedIdentity? _identity;
  GetMeResponse? _profile;
  int _requestVersion = 0;
  ({String uid, Set<String> previousHouseholdIds})? _pendingHouseholdCreation;
  ({String uid, Future<GetMeResponse> request})? _inFlightMe;

  @override
  SessionState build() {
    ref.onDispose(() {
      _disposed = true;
      _unsubscribe?.call();
    });
    // Connecting inside build would mutate state before it exists; the
    // microtask mirrors the legacy provider's mount effect.
    scheduleMicrotask(_connect);
    return const SessionInitializing();
  }

  void _setState(SessionState next) {
    if (!_disposed) {
      state = next;
    }
  }

  void _connect() {
    if (_disposed) {
      return;
    }
    final AuthClient auth;
    try {
      auth = ref.read(authClientProvider);
    } catch (error) {
      // Auth never initialized: signing out is not meaningful.
      _setState(
        SessionRecoverableError(
          message: messageForAuthError(error),
          canSignOut: false,
        ),
      );
      return;
    }
    _auth = auth;
    _unsubscribe = auth.subscribe(_onIdentityChanged, (error) {
      _setState(
        SessionRecoverableError(
          message: messageForAuthError(error),
          canSignOut: true,
        ),
      );
    });
  }

  void _onIdentityChanged(AuthenticatedIdentity? identity) {
    if (_disposed) {
      return;
    }
    _identity = identity;

    if (identity == null) {
      _requestVersion++;
      _profile = null;
      _pendingHouseholdCreation = null;
      _setState(const SessionUnauthenticated());
      return;
    }

    unawaited(
      _loadProfile(identity, deduplicate: true).catchError((Object _) {}),
    );
  }

  bool _isCurrentIdentity(AuthenticatedIdentity expected) {
    final current = _identity;
    return current != null && current.uid == expected.uid;
  }

  Future<void> _loadProfile(
    AuthenticatedIdentity identity, {
    required bool deduplicate,
  }) async {
    final api = ref.read(householdsApiProvider);
    if (!_isCurrentIdentity(identity)) {
      return;
    }

    final requestVersion = ++_requestVersion;
    _setState(const SessionInitializing());

    try {
      final profile =
          deduplicate ? await _getMeOnce(api, identity.uid) : await api.getMe();
      if (requestVersion == _requestVersion && _isCurrentIdentity(identity)) {
        _profile = profile;
        _setState(SessionAuthenticated(identity: identity, profile: profile));
      }
    } catch (error) {
      if (requestVersion == _requestVersion && _isCurrentIdentity(identity)) {
        _setState(
          SessionRecoverableError(
            message: messageForAuthError(error),
            canSignOut: true,
          ),
        );
      }
      rethrow;
    }
  }

  Future<GetMeResponse> _getMeOnce(HouseholdsApi api, String uid) {
    final inFlight = _inFlightMe;
    if (inFlight != null && inFlight.uid == uid) {
      return inFlight.request;
    }

    Future<GetMeResponse>? tracked;
    tracked = api.getMe().whenComplete(() {
      if (_inFlightMe?.request == tracked) {
        _inFlightMe = null;
      }
    });
    _inFlightMe = (uid: uid, request: tracked);
    return tracked;
  }

  /// A mutation whose response never arrived: the server may have committed
  /// it, so it must be reconciled rather than blindly resubmitted. Covers
  /// both transport loss and deadline expiry (a timed-out mutation may still
  /// have been applied — `ApiClient` never auto-retries mutations).
  static bool _isResponseLoss(Object error) =>
      error is NetworkError || error is TimeoutError;

  Future<bool> _reconcileHouseholdMutation(
    HouseholdsApi api,
    AuthenticatedIdentity identity,
    Set<String> previousHouseholdIds,
  ) async {
    for (final delay in ref.read(householdReconciliationDelaysProvider)) {
      if (delay > Duration.zero) {
        await Future<void>.delayed(delay);
      }
      if (_disposed || !_isCurrentIdentity(identity)) {
        return false;
      }

      final reconciliationVersion = _requestVersion;
      try {
        final profile = await api.getMe();
        if (reconciliationVersion != _requestVersion ||
            !canApplyProfileForIdentity(_identity?.uid, identity.uid)) {
          return false;
        }
        if (hasNewHousehold(previousHouseholdIds, profile)) {
          _requestVersion++;
          _profile = profile;
          _pendingHouseholdCreation = null;
          _setState(SessionAuthenticated(identity: identity, profile: profile));
          return true;
        }
      } catch (_) {
        // A later bounded attempt may observe a commit after transient
        // response loss.
      }
    }
    return false;
  }

  Future<void> signIn() async {
    final auth = _auth;
    if (auth == null) {
      _setState(
        const SessionRecoverableError(
          message: 'La autenticación todavía no está disponible.',
          canSignOut: false,
        ),
      );
      return;
    }

    _setState(const SessionInitializing());
    try {
      final result = await auth.signInWithGoogle();
      if (result == GoogleSignInResult.cancelled) {
        _setState(const SessionUnauthenticated());
      }
      // On success the auth subscription delivers the identity and loads
      // the profile; setting state here would race it.
    } catch (error) {
      _setState(
        SessionRecoverableError(
          message: messageForAuthError(error),
          canSignOut: false,
        ),
      );
    }
  }

  Future<void> signOut() async {
    _identity = null;
    _profile = null;
    _pendingHouseholdCreation = null;
    _requestVersion++;

    final auth = _auth;
    if (auth == null) {
      _setState(const SessionUnauthenticated());
      return;
    }

    _setState(const SessionInitializing());
    try {
      await auth.signOut();
      // The subscription emits null and resolves to unauthenticated.
    } catch (error) {
      _setState(
        SessionRecoverableError(
          message: messageForAuthError(error),
          canSignOut: true,
        ),
      );
    }
  }

  /// Rebuilds the auth wiring after a recoverable error (the legacy retry
  /// re-ran the whole session effect).
  void retry() {
    _setState(const SessionInitializing());
    _unsubscribe?.call();
    _unsubscribe = null;
    _auth = null;
    _connect();
  }

  Future<void> createHousehold(String name) async {
    final api = ref.read(householdsApiProvider);
    final identity = _identity;
    if (identity == null) {
      throw const UnauthenticatedError();
    }

    final profile = _profile;
    final previousHouseholdIds = <String>{
      ...?profile?.households.map((household) => household.id),
    };

    final pending = _pendingHouseholdCreation;
    if (pending != null &&
        pending.uid == identity.uid &&
        await _reconcileHouseholdMutation(
          api,
          identity,
          pending.previousHouseholdIds,
        )) {
      return;
    }
    _pendingHouseholdCreation = null;

    try {
      await api.createHousehold(name);
      _pendingHouseholdCreation = null;
    } catch (error) {
      if (profile != null && _isResponseLoss(error)) {
        if (await _reconcileHouseholdMutation(
          api,
          identity,
          previousHouseholdIds,
        )) {
          return;
        }
        _pendingHouseholdCreation = (
          uid: identity.uid,
          previousHouseholdIds: previousHouseholdIds,
        );
      }
      rethrow;
    }
    await _loadProfile(identity, deduplicate: false);
  }

  Future<void> acceptInvitation(String token) async {
    final api = ref.read(householdsApiProvider);
    final identity = _identity;
    if (identity == null) {
      throw const UnauthenticatedError();
    }

    final profile = _profile;
    final previousHouseholdIds = <String>{
      ...?profile?.households.map((household) => household.id),
    };

    try {
      await api.acceptInvite(token);
    } catch (error) {
      // 404 (already-consumed token pruned) and 409 (already a member) are
      // ambiguous exactly like response loss: the household may be granted.
      final reconcilable =
          _isResponseLoss(error) ||
          (error is AppError &&
              (error.statusCode == 404 || error.statusCode == 409));
      if (profile != null &&
          reconcilable &&
          await _reconcileHouseholdMutation(
            api,
            identity,
            previousHouseholdIds,
          )) {
        return;
      }
      rethrow;
    }
    await _loadProfile(identity, deduplicate: false);
  }

  Future<GetHouseholdMembersResponse> getMembers(String householdId) {
    return ref.read(householdsApiProvider).getMembers(householdId);
  }

  Future<CreateHouseholdInviteResponse> createInvitation(
    String householdId,
    String email,
  ) {
    return ref.read(householdsApiProvider).createInvite(householdId, email);
  }
}
