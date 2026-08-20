import 'dart:async';

import 'package:nido/core/auth/auth_client.dart';
import 'package:nido/core/auth/authenticated_identity.dart';
import 'package:nido/core/contracts/households.dart';
import 'package:nido/core/contracts/identity.dart';
import 'package:nido/core/errors/app_error.dart';
import 'package:nido/features/household/data/households_api.dart';

const AuthenticatedIdentity testIdentity = AuthenticatedIdentity(
  uid: 'firebase-uid',
  email: 'ale@example.com',
  displayName: 'Ale',
  photoUrl: null,
);

AuthenticatedUser buildUser() => AuthenticatedUser(
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ale@example.com',
  displayName: 'Ale',
  avatarUrl: null,
  timezone: 'America/Asuncion',
  createdAt: DateTime.utc(2026, 7, 16, 12),
  updatedAt: DateTime.utc(2026, 7, 16, 12),
);

ActiveHouseholdSummary buildHousehold({
  String id = '00000000-0000-4000-8000-000000000002',
  String name = 'Casa Ale & Kevin',
  HouseholdRole role = HouseholdRole.owner,
}) => ActiveHouseholdSummary(
  id: id,
  name: name,
  timezone: 'America/Asuncion',
  role: role,
  joinedAt: DateTime.utc(2026, 7, 16, 12, 5),
);

GetMeResponse buildProfile({List<ActiveHouseholdSummary>? households}) =>
    GetMeResponse(user: buildUser(), households: households ?? const []);

HouseholdMember buildMember({
  String userId = '00000000-0000-4000-8000-000000000001',
  String displayName = 'Ale',
  HouseholdRole role = HouseholdRole.owner,
  HouseholdMemberStatus status = HouseholdMemberStatus.active,
}) => HouseholdMember(
  userId: userId,
  displayName: displayName,
  avatarUrl: null,
  role: role,
  status: status,
  joinedAt: DateTime.utc(2026, 7, 16, 12, 5),
);

CreateHouseholdInviteResponse buildInviteResponse({
  String email = 'kevin@example.com',
}) => CreateHouseholdInviteResponse(
  invite: HouseholdInvite(
    id: '00000000-0000-4000-8000-000000000004',
    householdId: '00000000-0000-4000-8000-000000000002',
    email: email,
    expiresAt: DateTime.utc(2026, 7, 19, 12, 5),
  ),
  token: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE',
);

/// Scriptable [AuthClient]: emits identities on demand and records calls.
class FakeAuthClient implements AuthClient {
  FakeAuthClient({this.initialIdentity});

  AuthenticatedIdentity? initialIdentity;
  AuthenticatedIdentity? signInIdentity = testIdentity;
  GoogleSignInResult nextSignInResult = GoogleSignInResult.signedIn;
  Object? signInError;
  Object? signOutError;

  int subscribeCount = 0;
  int signInCalls = 0;
  int signOutCalls = 0;

  final List<void Function(AuthenticatedIdentity?)> _listeners = [];
  void Function(Object error)? _onError;

  @override
  void Function() subscribe(
    void Function(AuthenticatedIdentity? identity) onIdentityChanged,
    void Function(Object error) onError,
  ) {
    subscribeCount++;
    _listeners.add(onIdentityChanged);
    _onError = onError;
    // The Firebase SDK reports the restored session asynchronously.
    scheduleMicrotask(() {
      if (_listeners.contains(onIdentityChanged)) {
        onIdentityChanged(initialIdentity);
      }
    });
    return () => _listeners.remove(onIdentityChanged);
  }

  void emit(AuthenticatedIdentity? identity) {
    initialIdentity = identity;
    for (final listener in List.of(_listeners)) {
      listener(identity);
    }
  }

  void emitError(Object error) => _onError?.call(error);

  @override
  Future<GoogleSignInResult> signInWithGoogle() async {
    signInCalls++;
    final error = signInError;
    if (error != null) {
      throw error;
    }
    if (nextSignInResult == GoogleSignInResult.signedIn) {
      emit(signInIdentity);
    }
    return nextSignInResult;
  }

  @override
  Future<void> signOut() async {
    signOutCalls++;
    final error = signOutError;
    if (error != null) {
      throw error;
    }
    emit(null);
  }

  @override
  Future<String?> getIdToken() async =>
      initialIdentity == null ? null : 'fake-id-token';
}

/// Scriptable [HouseholdsApi] double: every endpoint is a settable closure
/// and call counts are recorded (getMe dedup assertions rely on them).
class FakeHouseholdsApi implements HouseholdsApi {
  Future<GetMeResponse> Function() onGetMe = () async => buildProfile();
  Future<CreateHouseholdResponse> Function(String name) onCreateHousehold =
      (_) async => throw UnimplementedError('onCreateHousehold not scripted');
  Future<GetHouseholdMembersResponse> Function(String householdId)
  onGetMembers =
      (_) async => GetHouseholdMembersResponse(members: [buildMember()]);
  Future<CreateHouseholdInviteResponse> Function(
    String householdId,
    String email,
  )
  onCreateInvite = (_, _) async => buildInviteResponse();
  Future<AcceptHouseholdInviteResponse> Function(String token) onAcceptInvite =
      (_) async => throw UnimplementedError('onAcceptInvite not scripted');

  int getMeCalls = 0;
  int createHouseholdCalls = 0;
  int acceptInviteCalls = 0;

  @override
  Future<GetMeResponse> getMe() {
    getMeCalls++;
    return onGetMe();
  }

  @override
  Future<CreateHouseholdResponse> createHousehold(String name) {
    createHouseholdCalls++;
    if (name.trim().isEmpty || name.trim().length > 100) {
      throw const ValidationError();
    }
    return onCreateHousehold(name);
  }

  @override
  Future<GetHouseholdMembersResponse> getMembers(String householdId) {
    return onGetMembers(householdId);
  }

  @override
  Future<CreateHouseholdInviteResponse> createInvite(
    String householdId,
    String email,
  ) {
    return onCreateInvite(householdId, email);
  }

  @override
  Future<AcceptHouseholdInviteResponse> acceptInvite(String token) {
    acceptInviteCalls++;
    if (!isValidInviteToken(token)) {
      throw const ValidationError();
    }
    return onAcceptInvite(token);
  }
}
