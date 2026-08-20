import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'auth_client.dart';
import 'authenticated_identity.dart';
import 'firebase_environment.dart';

/// Real [AuthClient] over Firebase Auth, porting the two legacy entry points:
///
/// * Web (`auth-client.web.ts`): `signInWithPopup` against the Google
///   provider; popup dismissal maps to [GoogleSignInResult.cancelled].
///   Session persistence is the Firebase SDK's own browser persistence —
///   no "secure storage" simulation in JavaScript.
/// * Android/iOS (`auth-client.ts`): the native Google credential flow via
///   `google_sign_in`, exchanged with `signInWithCredential`. Session
///   material persists inside each platform's Firebase SDK storage
///   (Keychain on iOS, app-private storage on Android) — never shared
///   preferences.
class FirebaseAuthClient implements AuthClient {
  FirebaseAuthClient({
    required FirebaseAuth auth,
    required FirebaseEnvironment environment,
    GoogleSignIn? googleSignIn,
  }) : _auth = auth,
       _googleSignIn =
           googleSignIn ??
           GoogleSignIn(
             // The Web OAuth client is the audience the API verifies; the
             // platform client (iOS) comes from FirebaseOptions.
             serverClientId: kIsWeb ? null : environment.googleWebClientId,
           );

  final FirebaseAuth _auth;
  final GoogleSignIn _googleSignIn;

  @override
  void Function() subscribe(
    void Function(AuthenticatedIdentity? identity) onIdentityChanged,
    void Function(Object error) onError,
  ) {
    final subscription = _auth.authStateChanges().listen(
      (user) => onIdentityChanged(_toIdentity(user)),
      onError: onError,
    );
    return subscription.cancel;
  }

  @override
  Future<GoogleSignInResult> signInWithGoogle() async {
    if (kIsWeb) {
      return _signInWithPopup();
    }
    return _signInWithNativeCredential();
  }

  Future<GoogleSignInResult> _signInWithPopup() async {
    try {
      await _auth.signInWithPopup(GoogleAuthProvider());
      return GoogleSignInResult.signedIn;
    } on FirebaseAuthException catch (error) {
      if (_isPopupCancellation(error)) {
        return GoogleSignInResult.cancelled;
      }
      rethrow;
    }
  }

  Future<GoogleSignInResult> _signInWithNativeCredential() async {
    final GoogleSignInAccount? account = await _googleSignIn.signIn();
    if (account == null) {
      return GoogleSignInResult.cancelled;
    }
    final authentication = await account.authentication;
    final credential = GoogleAuthProvider.credential(
      idToken: authentication.idToken,
      accessToken: authentication.accessToken,
    );
    await _auth.signInWithCredential(credential);
    return GoogleSignInResult.signedIn;
  }

  @override
  Future<void> signOut() async {
    if (!kIsWeb) {
      try {
        await _googleSignIn.signOut();
      } catch (_) {
        // Firebase is the API session authority; provider cleanup must not
        // keep it active (same rule as the legacy native client).
      }
    }
    await _auth.signOut();
  }

  @override
  Future<String?> getIdToken() async => _auth.currentUser?.getIdToken();

  static AuthenticatedIdentity? _toIdentity(User? user) {
    if (user == null) {
      return null;
    }
    return AuthenticatedIdentity(
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoUrl: user.photoURL,
    );
  }

  static bool _isPopupCancellation(FirebaseAuthException error) {
    return error.code == 'popup-closed-by-user' ||
        error.code == 'cancelled-popup-request' ||
        error.code == 'user-cancelled' ||
        // Some SDK paths still report web codes with the legacy prefix.
        error.code == 'auth/popup-closed-by-user' ||
        error.code == 'auth/cancelled-popup-request';
  }
}
