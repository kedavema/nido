import 'json_reader.dart';
import 'patch.dart';
import 'wire_codecs.dart';

/// Payment-source contracts mirroring
/// `packages/contracts/src/payment-sources.ts`.
///
/// A payment source is informational only: it has no balance, no currency and
/// no ledger (see `docs/flutter-architecture.md` — it is deliberately NOT
/// renamed "account").

/// `PAYMENT_SOURCE_TYPES` in `packages/domain-types`.
enum PaymentSourceType {
  bankAccount('BANK_ACCOUNT'),
  cash('CASH'),
  creditCard('CREDIT_CARD'),
  digitalWallet('DIGITAL_WALLET'),
  other('OTHER');

  const PaymentSourceType(this.wire);

  final String wire;

  static PaymentSourceType parseWire(String wire) {
    for (final type in values) {
      if (type.wire == wire) {
        return type;
      }
    }
    throw FormatException('Unknown payment source type', wire);
  }
}

/// `PaymentSourceNameSchema`: `z.string().trim().min(1).max(100)`.
String parsePaymentSourceName(String wire) =>
    parseTrimmedText(wire, min: 1, max: 100);

/// `PaymentSourceSchema`.
class PaymentSource {
  const PaymentSource({
    required this.id,
    required this.householdId,
    required this.name,
    required this.type,
    required this.ownerUserId,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String householdId;
  final String name;
  final PaymentSourceType type;

  /// Informative holder only — it grants no permission and carries no balance.
  final String? ownerUserId;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  static PaymentSource fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return PaymentSource(
      id: reader.parse('id', parseUuid),
      householdId: reader.parse('householdId', parseUuid),
      name: reader.parse('name', parsePaymentSourceName),
      type: reader.parse('type', PaymentSourceType.parseWire),
      ownerUserId: reader.parseNullable('ownerUserId', parseUuid),
      isActive: reader.boolean('isActive'),
      createdAt: reader.parse('createdAt', parseWireInstant),
      updatedAt: reader.parse('updatedAt', parseWireInstant),
    );
  }
}

/// `CreatePaymentSourceRequestSchema`.
class CreatePaymentSourceRequest {
  CreatePaymentSourceRequest({
    required String name,
    required this.type,
    this.ownerUserId,
  }) : name = parsePaymentSourceName(name);

  final String name;
  final PaymentSourceType type;
  final String? ownerUserId;

  Map<String, Object?> toJson() => {
    'name': name,
    'type': type.wire,
    if (ownerUserId != null) 'ownerUserId': ownerUserId,
  };
}

/// `UpdatePaymentSourceRequestSchema`: all fields optional, `ownerUserId`
/// additionally nullable (see [Patch]).
class UpdatePaymentSourceRequest {
  UpdatePaymentSourceRequest({
    String? name,
    this.type,
    this.ownerUserId = const Patch<String>.absent(),
    this.isActive,
  }) : name = name == null ? null : parsePaymentSourceName(name);

  final String? name;
  final PaymentSourceType? type;
  final Patch<String> ownerUserId;
  final bool? isActive;

  Map<String, Object?> toJson() => {
    if (name != null) 'name': name,
    if (type != null) 'type': type!.wire,
    if (ownerUserId.isPresent) 'ownerUserId': ownerUserId.value,
    if (isActive != null) 'isActive': isActive,
  };
}

/// `CreatePaymentSourceResponseSchema` / `UpdatePaymentSourceResponseSchema`.
class PaymentSourceResponse {
  const PaymentSourceResponse({required this.paymentSource});

  final PaymentSource paymentSource;

  static PaymentSourceResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return PaymentSourceResponse(
      paymentSource: PaymentSource.fromJson(reader.raw('paymentSource')),
    );
  }
}

/// `ListPaymentSourcesResponseSchema`.
class ListPaymentSourcesResponse {
  const ListPaymentSourcesResponse({required this.paymentSources});

  final List<PaymentSource> paymentSources;

  static ListPaymentSourcesResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return ListPaymentSourcesResponse(
      paymentSources: reader.list('paymentSources', PaymentSource.fromJson),
    );
  }
}
