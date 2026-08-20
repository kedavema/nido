import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/households.dart';
import 'package:nido/core/contracts/json_reader.dart';

/// The same fixtures `packages/contracts/test/fixtures.spec.ts` validates
/// with the real Zod schemas — one shared source both languages must parse.
Object? loadFixture(String name) {
  final file = File('../../packages/contracts/fixtures/$name');
  return jsonDecode(file.readAsStringSync());
}

void main() {
  group('shared household fixtures parse into typed DTOs', () {
    test('get-me with one owned household', () {
      final me = GetMeResponse.fromJson(loadFixture('get-me.json'));

      expect(me.user.email, 'ale@example.com');
      expect(me.households, hasLength(1));
      final household = me.households.single;
      expect(household.name, 'Casa Ale & Kevin');
      expect(household.baseCurrency, 'PYG');
      expect(household.role, HouseholdRole.owner);
      expect(household.timezone, 'America/Asuncion');
      expect(household.joinedAt, DateTime.utc(2026, 7, 16, 12, 5));
    });

    test('create-household response with creation metadata', () {
      final response = CreateHouseholdResponse.fromJson(
        loadFixture('create-household-response.json'),
      );

      expect(response.household.summary.role, HouseholdRole.owner);
      expect(
        response.household.createdByUserId,
        '00000000-0000-4000-8000-000000000001',
      );
      expect(response.household.createdAt, DateTime.utc(2026, 7, 16, 12, 5));
    });

    test('household members with active and removed states', () {
      final response = GetHouseholdMembersResponse.fromJson(
        loadFixture('household-members.json'),
      );

      expect(response.members, hasLength(2));
      expect(response.members[0].status, HouseholdMemberStatus.active);
      expect(response.members[0].role, HouseholdRole.owner);
      expect(response.members[0].avatarUrl, isNull);
      expect(response.members[1].status, HouseholdMemberStatus.removed);
      expect(
        response.members[1].avatarUrl,
        'https://example.com/avatars/kevin.png',
      );
    });

    test('create-invite response carries a valid one-use token', () {
      final response = CreateHouseholdInviteResponse.fromJson(
        loadFixture('create-household-invite-response.json'),
      );

      expect(response.invite.email, 'kevin@example.com');
      expect(response.invite.expiresAt, DateTime.utc(2026, 7, 19, 12, 5));
      expect(isValidInviteToken(response.token), isTrue);
      // The token must never leak through diagnostics.
      expect(response.toString(), isNot(contains(response.token)));
    });

    test('accept-invite response resolves to the joined household', () {
      final response = AcceptHouseholdInviteResponse.fromJson(
        loadFixture('accept-household-invite-response.json'),
      );

      expect(response.household.role, HouseholdRole.member);
      expect(response.household.name, 'Casa Ale & Kevin');
    });
  });

  group('contract violations fail loudly', () {
    Map<String, Object?> getMeJson() =>
        (loadFixture('get-me.json')! as Map<String, Object?>);

    test('rejects a non-PYG base currency', () {
      final json = getMeJson();
      final households = (json['households']! as List<Object?>);
      final household = Map<String, Object?>.of(
        households.first! as Map<String, Object?>,
      );
      household['baseCurrency'] = 'USD';
      json['households'] = [household];

      expect(
        () => GetMeResponse.fromJson(json),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('rejects an unknown role', () {
      final json = getMeJson();
      final households = (json['households']! as List<Object?>);
      final household = Map<String, Object?>.of(
        households.first! as Map<String, Object?>,
      );
      household['role'] = 'ADMIN';
      json['households'] = [household];

      expect(
        () => GetMeResponse.fromJson(json),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('rejects a token with the wrong shape', () {
      final json = Map<String, Object?>.of(
        loadFixture('create-household-invite-response.json')!
            as Map<String, Object?>,
      );
      json['token'] = 'short-token';

      expect(
        () => CreateHouseholdInviteResponse.fromJson(json),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('rejects a missing member status', () {
      final json = Map<String, Object?>.of(
        loadFixture('household-members.json')! as Map<String, Object?>,
      );
      final members = (json['members']! as List<Object?>);
      final member = Map<String, Object?>.of(
        members.first! as Map<String, Object?>,
      )..remove('status');
      json['members'] = [member];

      expect(
        () => GetHouseholdMembersResponse.fromJson(json),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('invite token shape helper matches the Zod regex', () {
      expect(
        isValidInviteToken('AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'),
        isTrue,
      );
      expect(isValidInviteToken(''), isFalse);
      expect(isValidInviteToken('a' * 42), isFalse);
      expect(isValidInviteToken('a' * 44), isFalse);
      expect(isValidInviteToken('${'a' * 42}!'), isFalse);
    });
  });
}
