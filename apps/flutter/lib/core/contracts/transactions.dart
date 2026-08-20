import '../money/base_amount_pyg.dart';
import '../money/currency.dart';
import '../money/fx_rate.dart';
import '../money/money.dart';
import '../time/local_date.dart';
import 'json_reader.dart';
import 'wire_codecs.dart';

/// `TRANSACTION_TYPES` in `packages/domain-types`.
enum TransactionType {
  expense('EXPENSE'),
  income('INCOME');

  const TransactionType(this.wireName);

  final String wireName;

  static TransactionType parseWire(String wire) {
    for (final type in TransactionType.values) {
      if (type.wireName == wire) {
        return type;
      }
    }
    throw FormatException('Unknown transaction type: $wire');
  }
}

/// `TRANSACTION_ORIGINS` in `packages/domain-types`.
enum TransactionOrigin {
  manual('MANUAL'),
  imported('IMPORT'),
  recurring('RECURRING');

  const TransactionOrigin(this.wireName);

  final String wireName;

  static TransactionOrigin parseWire(String wire) {
    for (final origin in TransactionOrigin.values) {
      if (origin.wireName == wire) {
        return origin;
      }
    }
    throw FormatException('Unknown transaction origin: $wire');
  }
}

/// Cross-field rule from `checkAmountCurrencyAndFxRate`: USD requires an fx
/// rate, PYG forbids one. (Currency scale is already enforced by
/// `Money.parseWire`.)
void _checkFxPresence({
  required Currency currency,
  required FxRateToPyg? fxRateToPyg,
}) {
  if (currency == Currency.usd && fxRateToPyg == null) {
    throw ContractViolationException(
      'fxRateToBase',
      'fxRateToBase is required for USD transactions',
    );
  }
  if (currency == Currency.pyg && fxRateToPyg != null) {
    throw ContractViolationException(
      'fxRateToBase',
      'fxRateToBase must be absent for PYG transactions',
    );
  }
}

/// `TransactionSchema` in `packages/contracts/src/transactions.ts`, with the
/// wire's stringly money/date fields already parsed into value types.
class Transaction {
  const Transaction({
    required this.id,
    required this.householdId,
    required this.type,
    required this.amount,
    required this.fxRateToPyg,
    required this.baseAmountPyg,
    required this.occurredAt,
    required this.localDate,
    required this.categoryId,
    required this.paymentSourceId,
    required this.description,
    required this.notes,
    required this.origin,
    required this.createdBy,
    required this.updatedBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String householdId;
  final TransactionType type;

  /// Carries both `currency` and `amount` from the wire.
  final Money amount;
  final FxRateToPyg? fxRateToPyg;
  final BaseAmountPyg baseAmountPyg;
  final DateTime occurredAt;

  /// Server-derived from `occurredAt` + household timezone; never computed
  /// client-side.
  final LocalDate localDate;
  final String categoryId;
  final String? paymentSourceId;
  final String description;
  final String? notes;
  final TransactionOrigin origin;
  final String createdBy;
  final String updatedBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  static Transaction fromJson(Object? json) {
    final reader = JsonReader.object(json);
    final currency = reader.parse('currency', Currency.parseWire);
    final amount = reader.parse(
      'amount',
      (wire) => Money.parseWire(currency: currency, amount: wire),
    );
    final fxRateToPyg = reader.parseNullable(
      'fxRateToBase',
      FxRateToPyg.parseWire,
    );
    _checkFxPresence(currency: currency, fxRateToPyg: fxRateToPyg);

    return Transaction(
      id: reader.parse('id', parseUuid),
      householdId: reader.parse('householdId', parseUuid),
      type: reader.parse('type', TransactionType.parseWire),
      amount: amount,
      fxRateToPyg: fxRateToPyg,
      baseAmountPyg: reader.parse('baseAmountPyg', BaseAmountPyg.parseWire),
      occurredAt: reader.parse('occurredAt', parseWireInstant),
      localDate: reader.parse('localDate', parseWireLocalDate),
      categoryId: reader.parse('categoryId', parseUuid),
      paymentSourceId: reader.parseNullable('paymentSourceId', parseUuid),
      description: reader.parse(
        'description',
        (wire) => parseTrimmedText(wire, min: 1, max: 200),
      ),
      notes: reader.parseNullable(
        'notes',
        (wire) => parseTrimmedText(wire, min: 1, max: 2000),
      ),
      origin: reader.parse('origin', TransactionOrigin.parseWire),
      createdBy: reader.parse('createdBy', parseUuid),
      updatedBy: reader.parse('updatedBy', parseUuid),
      createdAt: reader.parse('createdAt', parseWireInstant),
      updatedAt: reader.parse('updatedAt', parseWireInstant),
    );
  }
}

/// `CreateTransactionRequestSchema`: `localDate` and `baseAmountPyg` are
/// server-derived and never sent. `clientMutationId` implements ADR 0003
/// offline idempotency — when present, the `Idempotency-Key` header must
/// match it exactly.
class CreateTransactionRequest {
  CreateTransactionRequest({
    required this.type,
    required this.amount,
    required this.occurredAt,
    required this.categoryId,
    required this.description,
    this.fxRateToPyg,
    this.paymentSourceId,
    this.notes,
    this.clientMutationId,
  }) {
    _checkFxPresence(currency: amount.currency, fxRateToPyg: fxRateToPyg);
    parseTrimmedText(description, min: 1, max: 200);
    if (notes != null) {
      parseTrimmedText(notes!, min: 1, max: 2000);
    }
  }

  final TransactionType type;
  final Money amount;
  final FxRateToPyg? fxRateToPyg;

  /// Already a wire instant string: built by `localDateToOccurredAt`, or the
  /// exact canonical value replayed from the offline queue.
  final String occurredAt;
  final String categoryId;
  final String? paymentSourceId;
  final String description;
  final String? notes;
  final String? clientMutationId;

  Map<String, Object?> toJson() {
    return {
      'type': type.wireName,
      'amount': amount.toWire(),
      'currency': amount.currency.wireName,
      if (fxRateToPyg != null) 'fxRateToBase': fxRateToPyg!.toWire(),
      'occurredAt': occurredAt,
      'categoryId': categoryId,
      if (paymentSourceId != null) 'paymentSourceId': paymentSourceId,
      'description': description,
      if (notes != null) 'notes': notes,
      if (clientMutationId != null) 'clientMutationId': clientMutationId,
    };
  }
}

/// `CreateTransactionResponseSchema` / `UpdateTransactionResponseSchema`.
class TransactionResponse {
  const TransactionResponse({required this.transaction});

  final Transaction transaction;

  static TransactionResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return TransactionResponse(
      transaction: Transaction.fromJson(reader.raw('transaction')),
    );
  }
}

/// `ListTransactionsResponseSchema`.
class ListTransactionsResponse {
  const ListTransactionsResponse({required this.transactions});

  final List<Transaction> transactions;

  static ListTransactionsResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return ListTransactionsResponse(
      transactions: reader.list('transactions', Transaction.fromJson),
    );
  }
}
