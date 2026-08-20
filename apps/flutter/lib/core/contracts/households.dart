import 'identity.dart';
import 'json_reader.dart';
import 'wire_codecs.dart';

/// Household contracts mirroring `packages/contracts/src/households.ts`.
/// Every parser fails loudly on contract drift; the shared fixtures under
/// `packages/contracts/fixtures/` lock both languages together.

/// `HouseholdRoleSchema` (`HOUSEHOLD_ROLES` in `packages/domain-types`).
enum HouseholdRole {
  owner('OWNER'),
  member('MEMBER');

  const HouseholdRole(this.wire);

  final String wire;

  static HouseholdRole parseWire(String wire) {
    for (final role in values) {
      if (role.wire == wire) {
        return role;
      }
    }
    throw FormatException('Unknown household role', wire);
  }
}

/// `HouseholdMemberStatusSchema` (`HOUSEHOLD_MEMBER_STATUSES`).
enum HouseholdMemberStatus {
  active('ACTIVE'),
  removed('REMOVED');

  const HouseholdMemberStatus(this.wire);

  final String wire;

  static HouseholdMemberStatus parseWire(String wire) {
    for (final status in values) {
      if (status.wire == wire) {
        return status;
      }
    }
    throw FormatException('Unknown household member status', wire);
  }
}

/// `HouseholdNameSchema`: `z.string().trim().min(1).max(100)`.
String parseHouseholdName(String wire) =>
    parseTrimmedText(wire, min: 1, max: 100);

/// `InviteTokenSchema`: exactly 43 URL-safe base64 characters. The value is
/// secret material — it must NEVER be logged, persisted, or embedded in an
/// observable path (see `HouseholdsApi.acceptInvite`).
final RegExp inviteTokenPattern = RegExp(r'^[A-Za-z0-9_-]{43}$');

bool isValidInviteToken(String token) => inviteTokenPattern.hasMatch(token);

/// `ActiveHouseholdSummarySchema`.
class ActiveHouseholdSummary {
  const ActiveHouseholdSummary({
    required this.id,
    required this.name,
    required this.timezone,
    required this.role,
    required this.joinedAt,
  });

  final String id;
  final String name;

  /// The contract pins `baseCurrency` to the literal `'PYG'`; parsing
  /// rejects anything else, so the value needs no field.
  String get baseCurrency => 'PYG';

  final String timezone;
  final HouseholdRole role;
  final DateTime joinedAt;

  static ActiveHouseholdSummary fromJson(Object? json) {
    final reader = JsonReader.object(json);
    _requirePygBaseCurrency(reader);
    return ActiveHouseholdSummary(
      id: reader.parse('id', parseUuid),
      name: reader.parse('name', parseHouseholdName),
      timezone: reader.parse(
        'timezone',
        (wire) => parseBoundedText(wire, min: 1, max: 100),
      ),
      role: reader.parse('role', HouseholdRole.parseWire),
      joinedAt: reader.parse('joinedAt', parseWireInstant),
    );
  }
}

void _requirePygBaseCurrency(JsonReader reader) {
  final wire = reader.string('baseCurrency');
  if (wire != 'PYG') {
    throw ContractViolationException('baseCurrency', 'expected literal "PYG"');
  }
}

/// `GetMeResponseSchema`.
class GetMeResponse {
  const GetMeResponse({required this.user, required this.households});

  final AuthenticatedUser user;
  final List<ActiveHouseholdSummary> households;

  static GetMeResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return GetMeResponse(
      user: AuthenticatedUser.fromJson(reader.raw('user')),
      households: reader.list('households', ActiveHouseholdSummary.fromJson),
    );
  }
}

/// `HouseholdDetailSchema` (`ActiveHouseholdSummary` + creation metadata).
class HouseholdDetail {
  const HouseholdDetail({
    required this.summary,
    required this.createdByUserId,
    required this.createdAt,
    required this.updatedAt,
  });

  final ActiveHouseholdSummary summary;
  final String createdByUserId;
  final DateTime createdAt;
  final DateTime updatedAt;

  static HouseholdDetail fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return HouseholdDetail(
      summary: ActiveHouseholdSummary.fromJson(json),
      createdByUserId: reader.parse('createdByUserId', parseUuid),
      createdAt: reader.parse('createdAt', parseWireInstant),
      updatedAt: reader.parse('updatedAt', parseWireInstant),
    );
  }
}

/// `CreateHouseholdResponseSchema` / `GetHouseholdResponseSchema`.
class CreateHouseholdResponse {
  const CreateHouseholdResponse({required this.household});

  final HouseholdDetail household;

  static CreateHouseholdResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return CreateHouseholdResponse(
      household: HouseholdDetail.fromJson(reader.raw('household')),
    );
  }
}

/// `HouseholdMemberSchema`.
class HouseholdMember {
  const HouseholdMember({
    required this.userId,
    required this.displayName,
    required this.avatarUrl,
    required this.role,
    required this.status,
    required this.joinedAt,
  });

  final String userId;
  final String displayName;
  final String? avatarUrl;
  final HouseholdRole role;
  final HouseholdMemberStatus status;
  final DateTime joinedAt;

  static HouseholdMember fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return HouseholdMember(
      userId: reader.parse('userId', parseUuid),
      displayName: reader.parse(
        'displayName',
        (wire) => parseBoundedText(wire, min: 1, max: 100),
      ),
      avatarUrl: reader.nullableString('avatarUrl'),
      role: reader.parse('role', HouseholdRole.parseWire),
      status: reader.parse('status', HouseholdMemberStatus.parseWire),
      joinedAt: reader.parse('joinedAt', parseWireInstant),
    );
  }
}

/// `GetHouseholdMembersResponseSchema`.
class GetHouseholdMembersResponse {
  const GetHouseholdMembersResponse({required this.members});

  final List<HouseholdMember> members;

  static GetHouseholdMembersResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return GetHouseholdMembersResponse(
      members: reader.list('members', HouseholdMember.fromJson),
    );
  }
}

/// `HouseholdInviteSchema` — the invite's public metadata. The secret token
/// travels beside it in `CreateHouseholdInviteResponse` and only there.
class HouseholdInvite {
  const HouseholdInvite({
    required this.id,
    required this.householdId,
    required this.email,
    required this.expiresAt,
  });

  final String id;
  final String householdId;
  final String email;
  final DateTime expiresAt;

  static HouseholdInvite fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return HouseholdInvite(
      id: reader.parse('id', parseUuid),
      householdId: reader.parse('householdId', parseUuid),
      email: reader.parse('email', parseNormalizedEmail),
      expiresAt: reader.parse('expiresAt', parseWireInstant),
    );
  }
}

/// `CreateHouseholdInviteResponseSchema`. The token is shown ONCE for manual
/// delivery and exists only in memory — `toString` never includes it and no
/// log statement may receive this object.
class CreateHouseholdInviteResponse {
  const CreateHouseholdInviteResponse({
    required this.invite,
    required this.token,
  });

  final HouseholdInvite invite;
  final String token;

  static CreateHouseholdInviteResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return CreateHouseholdInviteResponse(
      invite: HouseholdInvite.fromJson(reader.raw('invite')),
      token: reader.parse('token', (wire) {
        if (!isValidInviteToken(wire)) {
          throw const FormatException('Not a valid invite token');
        }
        return wire;
      }),
    );
  }

  @override
  String toString() => 'CreateHouseholdInviteResponse(invite: [redacted])';
}

/// `AcceptHouseholdInviteResponseSchema`.
class AcceptHouseholdInviteResponse {
  const AcceptHouseholdInviteResponse({required this.household});

  final ActiveHouseholdSummary household;

  static AcceptHouseholdInviteResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return AcceptHouseholdInviteResponse(
      household: ActiveHouseholdSummary.fromJson(reader.raw('household')),
    );
  }
}
