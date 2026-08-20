/// The Firebase-side identity of the signed-in user (the Flutter port of
/// `AuthenticatedIdentity` in `apps/mobile/src/auth/auth-client.types.ts`).
/// This is transport identity only — the product profile is `GetMeResponse`.
class AuthenticatedIdentity {
  const AuthenticatedIdentity({
    required this.uid,
    required this.displayName,
    required this.email,
    required this.photoUrl,
  });

  final String uid;
  final String? displayName;
  final String? email;
  final String? photoUrl;

  @override
  bool operator ==(Object other) =>
      other is AuthenticatedIdentity &&
      other.uid == uid &&
      other.displayName == displayName &&
      other.email == email &&
      other.photoUrl == photoUrl;

  @override
  int get hashCode => Object.hash(uid, displayName, email, photoUrl);

  @override
  String toString() => 'AuthenticatedIdentity(uid: $uid)';
}
