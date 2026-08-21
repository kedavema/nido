import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/patch.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/money/fx_rate.dart';
import 'package:nido/core/money/money.dart';
import 'package:nido/core/time/local_date.dart';

Object? loadFixture(String name) {
  final file = File('../../packages/contracts/fixtures/$name');
  return jsonDecode(file.readAsStringSync());
}

void main() {
  group('shared transaction list fixture', () {
    test('parses a mixed month: PYG expense, PYG income and USD expense', () {
      final response = ListTransactionsResponse.fromJson(
        loadFixture('transactions-list.json'),
      );

      expect(response.transactions, hasLength(3));

      final expense = response.transactions[0];
      expect(expense.type, TransactionType.expense);
      expect(expense.amount.currency, Currency.pyg);
      expect(expense.fxRateToPyg, isNull);
      expect(expense.baseAmountPyg.toWire(), '150000');

      final income = response.transactions[1];
      expect(income.type, TransactionType.income);
      expect(income.paymentSourceId, isNull);

      final usd = response.transactions[2];
      expect(usd.amount.currency, Currency.usd);
      expect(usd.fxRateToPyg?.toWire(), '7350');
      // ADR 0001: 10.01 × 7350 = 73573.50, half-up once → 73574.
      expect(usd.baseAmountPyg.toWire(), '73574');
    });
  });

  group('UpdateTransactionRequest', () {
    test('round-trips to the shared fixture', () {
      final fixture = loadFixture('update-transaction-request.json')!;
      final request = UpdateTransactionRequest(
        type: TransactionType.expense,
        amount: Patch.of(
          Money.parseWire(currency: Currency.usd, amount: '45.90'),
        ),
        fxRateToPyg: Patch.of(FxRateToPyg.parseWire('7350.0400')),
        occurredAt: '2026-08-14T15:00:00.000Z',
        categoryId: '1a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5d',
        paymentSourceId: const Patch.of(null),
        description: 'Suscripción anual',
        notes: const Patch.of(null),
      );

      expect(request.toJson(), fixture);
    });

    test('amount and currency always travel together', () {
      final request = UpdateTransactionRequest(
        amount: Patch.of(
          Money.parseWire(currency: Currency.pyg, amount: '150000'),
        ),
      );

      expect(request.toJson(), {'amount': '150000', 'currency': 'PYG'});
    });

    test('a USD amount without an fx rate is refused before it is sent', () {
      expect(
        () => UpdateTransactionRequest(
          amount: Patch.of(
            Money.parseWire(currency: Currency.usd, amount: '10.00'),
          ),
        ),
        throwsA(isA<Exception>()),
      );
    });

    test('a PYG amount carrying an fx rate is refused too', () {
      expect(
        () => UpdateTransactionRequest(
          amount: Patch.of(
            Money.parseWire(currency: Currency.pyg, amount: '150000'),
          ),
          fxRateToPyg: Patch.of(FxRateToPyg.parseWire('7350')),
        ),
        throwsA(isA<Exception>()),
      );
    });

    test('an empty patch is recognised as a no-op', () {
      expect(UpdateTransactionRequest().isEmpty, isTrue);
      expect(UpdateTransactionRequest(description: 'Biggie').isEmpty, isFalse);
      // Clearing a note is a real change, not an empty patch.
      expect(
        UpdateTransactionRequest(notes: const Patch.of(null)).isEmpty,
        isFalse,
      );
    });
  });

  group('ListTransactionsQuery', () {
    test('parses the shared fixture and re-emits the same parameters', () {
      final query = ListTransactionsQuery.fromJson(
        loadFixture('list-transactions-query.json'),
      );

      expect(query.from, LocalDate(2026, 8, 1));
      expect(query.to, LocalDate(2026, 8, 31));
      expect(query.type, TransactionType.expense);
      expect(query.currency, Currency.pyg);
      expect(query.search, 'supermercado');

      expect(query.toQueryParameters(), {
        'from': '2026-08-01',
        'to': '2026-08-31',
        'type': 'EXPENSE',
        'categoryId': '0f7a1c2d-3b4e-4f5a-8b6c-7d8e9f0a1b2c',
        'paymentSourceId': '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a',
        'createdBy': '9b2fca8e-4a1d-4d2b-9f3e-5a6b7c8d9e0f',
        'currency': 'PYG',
        'search': 'supermercado',
      });
    });

    test('unset filters are absent, not empty strings', () {
      expect(ListTransactionsQuery.none.toQueryParameters(), isEmpty);
      expect(
        ListTransactionsQuery(from: LocalDate(2026, 8, 1)).toQueryParameters(),
        {'from': '2026-08-01'},
      );
    });

    test('two queries with the same filters are equal (Riverpod keys)', () {
      final a = ListTransactionsQuery(
        from: LocalDate(2026, 8, 1),
        type: TransactionType.income,
      );
      final b = ListTransactionsQuery(
        from: LocalDate(2026, 8, 1),
        type: TransactionType.income,
      );

      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });
  });

  group('CreateTransactionRequest', () {
    test('a malformed clientMutationId fails before the request leaves', () {
      expect(
        () => CreateTransactionRequest(
          type: TransactionType.expense,
          amount: Money.parseWire(currency: Currency.pyg, amount: '1000'),
          occurredAt: '2026-08-15T18:30:00.000Z',
          categoryId: '1a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5d',
          description: 'Café',
          clientMutationId: 'not-a-uuid',
        ),
        throwsFormatException,
      );
    });
  });
}
