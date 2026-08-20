import '../contracts/households.dart';
import 'authenticated_identity.dart';

/// The single session state machine the whole app reads (the Flutter port of
/// `apps/mobile/src/auth/session-machine.ts`, with the states named by
/// `docs/flutter-architecture.md` §Routing):
///
/// * [SessionInitializing] — restoring/validating the persisted session.
/// * [SessionUnauthenticated] — resolved: nobody is signed in.
/// * [SessionAuthenticated] with [SessionAuthenticated.activeHousehold]
///   `null` — authenticated-without-household (onboarding).
/// * [SessionAuthenticated] with a household — authenticated-with-household.
/// * [SessionRecoverableError] — resolved to a failure the user can retry.
sealed class SessionState {
  const SessionState();
}

class SessionInitializing extends SessionState {
  const SessionInitializing();
}

class SessionUnauthenticated extends SessionState {
  const SessionUnauthenticated();
}

class SessionAuthenticated extends SessionState {
  SessionAuthenticated({required this.identity, required this.profile})
    : activeHousehold =
          profile.households.isEmpty ? null : profile.households.first;

  final AuthenticatedIdentity identity;
  final GetMeResponse profile;

  /// Deliberately the FIRST household, preserving the legacy client's
  /// behavior (FLT-014 keeps "active household is always the first result"
  /// until its ticket decides otherwise — the product has one household).
  final ActiveHouseholdSummary? activeHousehold;
}

class SessionRecoverableError extends SessionState {
  const SessionRecoverableError({
    required this.message,
    required this.canSignOut,
  });

  final String message;

  /// Whether signing out is a safe exit from this error (false when auth
  /// itself never initialized, e.g. missing configuration).
  final bool canSignOut;
}

/// Where a session state routes (port of `destinationForSession`).
enum SessionDestination { initializing, signIn, error, onboarding, home }

SessionDestination destinationForSession(SessionState state) {
  return switch (state) {
    SessionInitializing() => SessionDestination.initializing,
    SessionUnauthenticated() => SessionDestination.signIn,
    SessionRecoverableError() => SessionDestination.error,
    SessionAuthenticated(activeHousehold: null) =>
      SessionDestination.onboarding,
    SessionAuthenticated() => SessionDestination.home,
  };
}

/// Whether [profile] contains a household absent from [previousHouseholdIds]
/// — used to reconcile an ambiguous household mutation (timeout/404/409)
/// against what the server actually committed.
bool hasNewHousehold(Set<String> previousHouseholdIds, GetMeResponse profile) {
  return profile.households.any(
    (household) => !previousHouseholdIds.contains(household.id),
  );
}

/// A reconciled profile may only be applied while the SAME identity is still
/// signed in; after sign-out or an account switch it must be discarded.
bool canApplyProfileForIdentity(String? currentUid, String expectedUid) {
  return currentUid == expectedUid;
}
