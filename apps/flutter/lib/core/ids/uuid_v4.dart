import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Generates a fresh identifier. Injected rather than called directly so a
/// test can pin the value a mutation will carry
/// (`docs/flutter-architecture.md` §Bootstrap lists the UUID generator among
/// the overridable dependencies).
typedef IdGenerator = String Function();

final _random = Random.secure();

/// A random (version 4, RFC 9562) UUID, the shape `UuidSchema` accepts.
///
/// Hand-rolled on `Random.secure` instead of taking a `uuid` dependency: the
/// app needs exactly this one generator, for `clientMutationId` (ADR 0003),
/// and the value is a collision-avoidance token rather than a secret.
String generateUuidV4() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
  // Version 4 in the high nibble of byte 6, RFC variant (10xx) in byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  final hex =
      bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

final idGeneratorProvider = Provider<IdGenerator>((ref) => generateUuidV4);
