import 'json_reader.dart';
import 'wire_codecs.dart';

/// `AuthenticatedUserSchema` in `packages/contracts/src/identity.ts`.
class AuthenticatedUser {
  const AuthenticatedUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.avatarUrl,
    required this.timezone,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final String timezone;
  final DateTime createdAt;
  final DateTime updatedAt;

  static AuthenticatedUser fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return AuthenticatedUser(
      id: reader.parse('id', parseUuid),
      email: reader.parse('email', parseNormalizedEmail),
      displayName: reader.parse(
        'displayName',
        (wire) => parseBoundedText(wire, min: 1, max: 100),
      ),
      avatarUrl: reader.nullableString('avatarUrl'),
      timezone: reader.parse(
        'timezone',
        (wire) => parseBoundedText(wire, min: 1, max: 100),
      ),
      createdAt: reader.parse('createdAt', parseWireInstant),
      updatedAt: reader.parse('updatedAt', parseWireInstant),
    );
  }
}
