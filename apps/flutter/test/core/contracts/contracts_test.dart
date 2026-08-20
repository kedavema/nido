import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/identity.dart';
import 'package:nido/core/contracts/json_reader.dart';
import 'package:nido/core/contracts/monthly_summary.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/core/money/base_amount_pyg.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/money/fx_rate.dart';
import 'package:nido/core/money/money.dart';
import 'package:nido/core/time/local_date.dart';

/// The same fixtures `packages/contracts/test/fixtures.spec.ts` validates
/// with the real Zod schemas — one shared source both languages must parse.
Object? loadFixture(String name) {
  final file = File('../../packages/contracts/fixtures/$name');
  return jsonDecode(file.readAsStringSync());
}

Map<String, Object?> transactionJson({
  Map<String, Object?> overrides = const {},
}) {
  final base = loadFixture('transaction.pyg.json')! as Map<String, Object?>;
  return {...base, ...overrides};
}

void main() {
  group('shared Zod fixtures parse into typed DTOs', () {
    test('PYG transaction', () {
      final tx = Transaction.fromJson(loadFixture('transaction.pyg.json'));
      expect(tx.type, TransactionType.expense);
      expect(
        tx.amount,
        Money.parseWire(currency: Currency.pyg, amount: '150000'),
      );
      expect(tx.fxRateToPyg, isNull);
      expect(tx.baseAmountPyg.toWire(), '150000');
      expect(tx.localDate, LocalDate.parseWire('2026-08-15'));
      expect(tx.occurredAt, DateTime.utc(2026, 8, 15, 18, 30));
      expect(tx.paymentSourceId, isNull);
      expect(tx.notes, isNull);
      expect(tx.origin, TransactionOrigin.manual);
    });

    test('USD transaction, and its baseAmountPyg matches our own compute', () {
      final tx = Transaction.fromJson(loadFixture('transaction.usd.json'));
      expect(tx.amount.currency, Currency.usd);
      expect(tx.amount.toWire(), '10.01');
      expect(tx.fxRateToPyg, FxRateToPyg.parseWire('7350'));
      expect(tx.baseAmountPyg.toWire(), '73574');
      // Cross-language lock: the server-computed fixture value must equal
      // the client-side ADR 0001 computation.
      expect(
        BaseAmountPyg.compute(amount: tx.amount, fxRateToPyg: tx.fxRateToPyg),
        tx.baseAmountPyg,
      );
    });

    test('monthly summary with negative balance and budget block', () {
      final summary = MonthlySummaryResponse.fromJson(
        loadFixture('monthly-summary.json'),
      );
      expect(summary.balance.isNegative, isTrue);
      expect(summary.balance.toWire(), '-125000');
      expect(summary.incomeTotal.toWire(), '3000000');
      expect(summary.expenseTotal.toWire(), '3125000');
      expect(summary.categoryBreakdown, hasLength(1));
      expect(summary.categoryBreakdown.first.percentage, 41.67);
      expect(summary.recentTransactions, hasLength(1));
      expect(summary.budget, isNotNull);
      expect(summary.budget!.projectedAvailablePyg.toWire(), '-100000');
      expect(summary.budget!.spentPercentage, 72);
    });

    test('authenticated user', () {
      final user = AuthenticatedUser.fromJson(
        loadFixture('authenticated-user.json'),
      );
      expect(user.email, 'pareja@example.com');
      expect(user.avatarUrl, isNull);
      expect(user.timezone, 'America/Asuncion');
    });

    test(
      'CreateTransactionRequest serializes byte-compatible with its fixture',
      () {
        final request = CreateTransactionRequest(
          type: TransactionType.expense,
          amount: Money.parseWire(currency: Currency.usd, amount: '10.01'),
          fxRateToPyg: FxRateToPyg.parseWire('7350.0400'),
          occurredAt: '2026-08-14T15:00:00.000Z',
          categoryId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          paymentSourceId: '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a',
          description: 'Suscripción en dólares',
          notes: 'Pago mensual',
          clientMutationId: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
        );
        expect(
          request.toJson(),
          loadFixture('create-transaction-request.usd.json'),
        );
      },
    );
  });

  group('contract cross-field rules', () {
    test('USD transaction without fxRateToBase is rejected', () {
      expect(
        () => Transaction.fromJson(
          transactionJson(
            overrides: {
              'currency': 'USD',
              'amount': '10.01',
              'fxRateToBase': null,
            },
          ),
        ),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('PYG transaction with fxRateToBase is rejected', () {
      expect(
        () => Transaction.fromJson(
          transactionJson(overrides: {'fxRateToBase': '7350'}),
        ),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('currency-scale violations are rejected at the boundary', () {
      expect(
        () => Transaction.fromJson(
          transactionJson(overrides: {'amount': '150000.50'}),
        ),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('missing required fields are named in the violation', () {
      final json = transactionJson()..remove('baseAmountPyg');
      expect(
        () => Transaction.fromJson(json),
        throwsA(
          isA<ContractViolationException>().having(
            (error) => error.message,
            'message',
            contains('baseAmountPyg'),
          ),
        ),
      );
    });

    test('non-object payloads are rejected, never silently coerced', () {
      expect(
        () => Transaction.fromJson('[]'),
        throwsA(isA<ContractViolationException>()),
      );
      expect(
        () => Transaction.fromJson(null),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('CreateTransactionRequest enforces fx presence at construction', () {
      expect(
        () => CreateTransactionRequest(
          type: TransactionType.expense,
          amount: Money.parseWire(currency: Currency.usd, amount: '10.00'),
          occurredAt: '2026-08-14T15:00:00.000Z',
          categoryId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          description: 'Sin tasa',
        ),
        throwsA(isA<ContractViolationException>()),
      );
    });

    test('recentTransactions above the contractual max(4) is rejected', () {
      final summary =
          loadFixture('monthly-summary.json')! as Map<String, Object?>;
      final tx = transactionJson();
      expect(
        () => MonthlySummaryResponse.fromJson({
          ...summary,
          'recentTransactions': List<Object?>.filled(5, tx),
        }),
        throwsA(isA<ContractViolationException>()),
      );
    });
  });
}
