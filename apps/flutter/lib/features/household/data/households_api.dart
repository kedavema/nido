import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/contracts/households.dart';
import '../../../core/errors/app_error.dart';

/// Identity & household endpoints (M2), path-for-path with the legacy client
/// (`apps/mobile/src/api/client.ts`).
class HouseholdsApi {
  HouseholdsApi(this._client);

  final ApiClient _client;

  Future<GetMeResponse> getMe() {
    return _client.get('/v1/me', parse: GetMeResponse.fromJson);
  }

  Future<CreateHouseholdResponse> createHousehold(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty || trimmed.length > 100) {
      // Same boundary the request schema enforces server-side; rejecting
      // locally gives feedback without a doomed request.
      throw const ValidationError();
    }
    return _client.mutate(
      '/v1/households',
      method: 'POST',
      body: <String, Object?>{'name': trimmed},
      parse: CreateHouseholdResponse.fromJson,
    );
  }

  Future<GetHouseholdMembersResponse> getMembers(String householdId) {
    return _client.get(
      '/v1/households/${Uri.encodeComponent(householdId)}/members',
      parse: GetHouseholdMembersResponse.fromJson,
    );
  }

  Future<CreateHouseholdInviteResponse> createInvite(
    String householdId,
    String email,
  ) {
    // `NormalizedEmailSchema` trims and lowercases on the wire; normalizing
    // here keeps what the user sees consistent with what the server stores.
    final normalized = email.trim().toLowerCase();
    if (normalized.isEmpty || normalized.length > 254) {
      throw const ValidationError();
    }
    return _client.mutate(
      '/v1/households/${Uri.encodeComponent(householdId)}/invites',
      method: 'POST',
      body: <String, Object?>{'email': normalized},
      parse: CreateHouseholdInviteResponse.fromJson,
    );
  }

  Future<AcceptHouseholdInviteResponse> acceptInvite(String token) {
    // An obviously malformed token never leaves the device (legacy parsed
    // `InviteTokenSchema` before building the URL).
    if (!isValidInviteToken(token)) {
      throw const ValidationError();
    }
    return _client.mutate(
      '/v1/invites/${Uri.encodeComponent(token)}/accept',
      method: 'POST',
      parse: AcceptHouseholdInviteResponse.fromJson,
      // The token is secret material: observability only ever sees the
      // route template (architecture §Errores/observabilidad).
      logPath: '/v1/invites/:token/accept',
    );
  }
}

final householdsApiProvider = Provider<HouseholdsApi>((ref) {
  return HouseholdsApi(ref.watch(apiClientProvider));
});
