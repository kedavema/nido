import 'authenticated_identity.dart';

/// Outcome of an interactive Google sign-in: dismissing the account chooser
/// or popup is a normal user decision, not an error.
enum GoogleSignInResult { signedIn, cancelled }

/// Platform-agnostic Firebase Auth surface (the Flutter port of
/// `FirebaseAuthClient` in `apps/mobile/src/auth/auth-client.types.ts`).
/// The session controller and tests depend on this interface; the real
/// implementation lives in `firebase_auth_client.dart`.
abstract interface class AuthClient {
  /// Subscribes to identity changes. [onIdentityChanged] fires with `null`
  /// when signed out and fires immediately with the restored session on
  /// startup. Returns the unsubscribe callback.
  void Function() subscribe(
    void Function(AuthenticatedIdentity? identity) onIdentityChanged,
    void Function(Object error) onError,
  );

  Future<GoogleSignInResult> signInWithGoogle();

  Future<void> signOut();

  /// The Firebase ID Token for the current session, or `null` when there is
  /// none. Token refresh stays inside the Firebase SDK (no custom refresh
  /// interceptor — architecture §API).
  Future<String?> getIdToken();
}
