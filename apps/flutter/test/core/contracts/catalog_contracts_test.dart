import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/categories.dart';
import 'package:nido/core/contracts/json_reader.dart';
import 'package:nido/core/contracts/patch.dart';
import 'package:nido/core/contracts/payment_sources.dart';

/// The same fixtures `packages/contracts/test/fixtures.spec.ts` validates
/// with the real Zod schemas — one shared source both languages must parse.
Object? loadFixture(String name) {
  final file = File('../../packages/contracts/fixtures/$name');
  return jsonDecode(file.readAsStringSync());
}

void main() {
  group('shared category fixtures parse into typed DTOs', () {
    test('the household catalog, roots and children alike', () {
      final response = ListCategoriesResponse.fromJson(
        loadFixture('categories-list.json'),
      );

      expect(response.categories, hasLength(4));

      final root = response.categories.first;
      expect(root.name, 'Alimentación');
      expect(root.kind, CategoryKind.expense);
      expect(root.isRoot, isTrue);
      expect(root.color, '#3E6B34');
      expect(root.sortOrder, 0);

      final child = response.categories[1];
      expect(child.parentId, root.id);
      expect(child.isRoot, isFalse);

      // An archived child still parses: the history filed under it has to
      // keep rendering.
      expect(response.categories[2].isActive, isFalse);
      expect(response.categories.last.kind, CategoryKind.income);
    });

    test('create request round-trips to the fixture it was built from', () {
      final fixture = loadFixture('create-category-request.json')!;
      final request = CreateCategoryRequest(
        kind: CategoryKind.expense,
        name: 'Farmacia',
        icon: 'medical',
        color: '#A04848',
        parentId: '0f7a1c2d-3b4e-4f5a-8b6c-7d8e9f0a1b2c',
        sortOrder: 2,
      );

      expect(request.toJson(), fixture);
    });

    test('update request round-trips to the fixture it was built from', () {
      final fixture = loadFixture('update-category-request.json')!;
      final request = UpdateCategoryRequest(
        name: 'Delivery y apps',
        icon: 'restaurant',
        color: '#3E6B34',
        parentId: const Patch.of('0f7a1c2d-3b4e-4f5a-8b6c-7d8e9f0a1b2c'),
        isActive: false,
      );

      expect(request.toJson(), fixture);
    });
  });

  group('category contract rules', () {
    test('a colour outside #RRGGBB is a contract violation', () {
      expect(() => parseCategoryColor('3E6B34'), throwsFormatException);
      expect(() => parseCategoryColor('#3E6B3'), throwsFormatException);
      expect(() => parseCategoryColor('#3E6B34AA'), throwsFormatException);
      expect(parseCategoryColor('#aabbcc'), '#aabbcc');
    });

    test('a fractional sortOrder is rejected rather than rounded', () {
      final json = <String, Object?>{
        ...(loadFixture('categories-list.json')! as Map<String, Object?>),
      };
      final categories = (json['categories']! as List<Object?>).toList();
      final first = <String, Object?>{
        ...categories.first! as Map<String, Object?>,
      }..['sortOrder'] = 1.5;

      expect(
        () => Category.fromJson(first),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('a name of only whitespace fails the trimmed bound', () {
      expect(() => parseCategoryName('   '), throwsFormatException);
      // Zod's `.trim()` transforms before validating, so the trimmed value is
      // what both sides keep.
      expect(parseCategoryName('  Salud  '), 'Salud');
    });

    test('an absent patch field is omitted; an explicit null clears it', () {
      expect(UpdateCategoryRequest().toJson(), isEmpty);
      expect(UpdateCategoryRequest(parentId: const Patch.of(null)).toJson(), {
        'parentId': null,
      });
      expect(const Patch<String>.of(null).clears, isTrue);
      expect(const Patch<String>.absent().clears, isFalse);
    });
  });

  group('shared payment-source fixtures parse into typed DTOs', () {
    test('every type, owned and unowned, active and archived', () {
      final response = ListPaymentSourcesResponse.fromJson(
        loadFixture('payment-sources-list.json'),
      );

      expect(response.paymentSources, hasLength(3));
      expect(response.paymentSources[0].type, PaymentSourceType.cash);
      expect(response.paymentSources[0].ownerUserId, isNull);
      expect(response.paymentSources[1].type, PaymentSourceType.bankAccount);
      expect(
        response.paymentSources[1].ownerUserId,
        '9b2fca8e-4a1d-4d2b-9f3e-5a6b7c8d9e0f',
      );
      expect(response.paymentSources[2].isActive, isFalse);
    });

    test('create request round-trips to the fixture it was built from', () {
      final fixture = loadFixture('create-payment-source-request.json')!;
      final request = CreatePaymentSourceRequest(
        name: 'Tarjeta Visa',
        type: PaymentSourceType.creditCard,
        ownerUserId: '9b2fca8e-4a1d-4d2b-9f3e-5a6b7c8d9e0f',
      );

      expect(request.toJson(), fixture);
    });

    test('clearing the informative holder is distinct from leaving it', () {
      expect(
        UpdatePaymentSourceRequest(ownerUserId: const Patch.of(null)).toJson(),
        {'ownerUserId': null},
      );
      expect(UpdatePaymentSourceRequest(name: 'Efectivo').toJson(), {
        'name': 'Efectivo',
      });
    });

    test('an unknown wire type fails loudly instead of defaulting', () {
      expect(
        () => PaymentSourceType.parseWire('CRYPTO'),
        throwsFormatException,
      );
    });
  });
}
