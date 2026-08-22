import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/categories.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/time/local_date.dart';
import 'package:nido/features/transactions/domain/transaction_draft.dart';
import 'package:nido/testing/finance_fakes.dart';

final LocalDate today = LocalDate(2026, 8, 15);
DateTime nowAt(String wire) => DateTime.parse(wire).toUtc();
DateTime Function() clock = () => nowAt('2026-08-15T21:04:00.000Z');

TransactionDraft blank({
  TransactionType type = TransactionType.expense,
  Currency currency = Currency.pyg,
}) => TransactionDraft.blank(
  todayLocal: today,
  now: clock,
  type: type,
  currency: currency,
);

TransactionDraft filled({
  TransactionType type = TransactionType.expense,
  Currency currency = Currency.pyg,
  String amount = '150000',
  String fxRate = '',
  String? categoryId = expenseChildId,
  String description = 'Biggie',
}) {
  var draft = blank(
    type: type,
    currency: currency,
  ).copyWith(categoryId: categoryId, description: description);
  draft = draft.copyWith(amount: draft.amount.withRaw(amount));
  if (fxRate.isNotEmpty) {
    draft = draft.copyWith(fxRate: draft.fxRate.withRaw(fxRate));
  }
  return draft;
}

void main() {
  group('occurredAt derivation', () {
    test('picking today submits the real current instant', () {
      expect(blank().occurredAt, '2026-08-15T21:04:00.000Z');
    });

    test('a backdated date is pinned to 15:00Z so the server agrees', () {
      final draft = blank().withLocalDate(
        LocalDate(2026, 8, 11),
        todayLocal: today,
        now: clock,
      );

      // Midday in America/Asuncion regardless of offset, so the server's
      // timezone-derived localDate resolves back to the picked date.
      expect(draft.occurredAt, '2026-08-11T15:00:00.000Z');
      expect(draft.localDate, LocalDate(2026, 8, 11));
    });

    test('editing keeps the stored instant, not a re-derived one', () {
      final draft = TransactionDraft.fromTransaction(
        buildTransaction(occurredAt: '2026-08-15T18:30:00.000Z'),
      );

      // Opening the form to fix a typo must not move the movement in time.
      expect(draft.occurredAt, '2026-08-15T18:30:00.000Z');
    });
  });

  group('validation', () {
    test('a blank draft names every missing field', () {
      expect(blank().validate(), [
        DraftProblem.amountMissing,
        DraftProblem.categoryMissing,
        DraftProblem.descriptionMissing,
      ]);
      expect(blank().isSubmittable, isFalse);
    });

    test('a complete PYG expense is submittable', () {
      expect(filled().validate(), isEmpty);
      expect(filled().isSubmittable, isTrue);
    });

    // FLT-017: the legacy forms disagreed — four rejected the literal string
    // "0" and the movement form accepted any non-empty text, so a zero-value
    // movement could be created there and nowhere else.
    test('zero is rejected, however it was typed', () {
      for (final amount in ['0', '00', '000']) {
        expect(
          filled(amount: amount).validate(),
          contains(DraftProblem.amountZero),
          reason: 'PYG "$amount" must not pass',
        );
      }
      for (final amount in ['0', '0,0', '0,00']) {
        expect(
          filled(
            currency: Currency.usd,
            amount: amount,
            fxRate: '7350',
          ).validate(),
          contains(DraftProblem.amountZero),
          reason: 'USD "$amount" must not pass',
        );
      }
    });

    test('a half-typed amount is invalid, not merely missing', () {
      final draft = filled(
        currency: Currency.usd,
        amount: '45,',
        fxRate: '7350',
      );
      expect(draft.validate(), contains(DraftProblem.amountInvalid));
      expect(draft.validate(), isNot(contains(DraftProblem.amountMissing)));
    });

    test('USD requires an exchange rate, PYG must not carry one', () {
      expect(
        filled(currency: Currency.usd, amount: '45,90').validate(),
        contains(DraftProblem.fxRateMissing),
      );
      expect(
        filled(
          currency: Currency.usd,
          amount: '45,90',
          fxRate: '7350',
        ).validate(),
        isEmpty,
      );
    });

    test('a zero exchange rate is rejected: it would zero the movement', () {
      expect(
        filled(currency: Currency.usd, amount: '45,90', fxRate: '0').validate(),
        contains(DraftProblem.fxRateZero),
      );
    });

    test('an income needs no merchant; an expense does', () {
      final income = filled(
        type: TransactionType.income,
        categoryId: incomeRootId,
        description: '',
      );
      expect(income.validate(), isEmpty);

      expect(
        filled(description: '   ').validate(),
        contains(DraftProblem.descriptionMissing),
      );
    });
  });

  group('currency switching', () {
    test('leaving USD drops the exchange rate the contract forbids', () {
      final usd = filled(
        currency: Currency.usd,
        amount: '45,90',
        fxRate: '7350',
      );
      final pyg = usd.withCurrency(Currency.pyg);

      expect(pyg.fxRate.isEmpty, isTrue);
      expect(pyg.validate(), isEmpty);
      expect(
        pyg
            .toCreateRequest(
              categories: buildCategories(),
              clientMutationId: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
            )
            .toJson()['fxRateToBase'],
        isNull,
      );
    });

    test('switching kind clears a category that no longer applies', () {
      final expense = filled();
      final income = expense.withType(TransactionType.income);

      expect(income.categoryId, isNull);
      expect(income.validate(), contains(DraftProblem.categoryMissing));
    });
  });

  group('base-PYG preview', () {
    test('matches the worked example and rounds half-up exactly once', () {
      String? preview(String amount, String rate) =>
          filled(
            currency: Currency.usd,
            amount: amount,
            fxRate: rate,
          ).previewBaseAmountPyg()?.toWire();

      expect(preview('45,90', '7350'), '337365');
      // 45.91 × 7350 = 337438.5 → half-up → 337439.
      expect(preview('45,91', '7350'), '337439');
      // 45.90 × 7350.0004 = 337365.01836 → 337365.
      expect(preview('45,90', '7350,0004'), '337365');
      expect(preview('0', '7350'), '0');
    });

    test('is null while the draft cannot produce one', () {
      expect(
        filled(currency: Currency.usd, amount: '45,90').previewBaseAmountPyg(),
        isNull,
      );
      expect(blank().previewBaseAmountPyg(), isNull);
    });

    test('a PYG movement previews itself', () {
      expect(filled().previewBaseAmountPyg()?.toWire(), '150000');
    });
  });

  group('request building', () {
    const mutationId = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

    test(
      'a create carries the idempotency key and no server-derived field',
      () {
        final json =
            filled()
                .copyWith(paymentSourceId: cashSourceId, notes: '  con cupón  ')
                .toCreateRequest(
                  categories: buildCategories(),
                  clientMutationId: mutationId,
                )
                .toJson();

        expect(json, {
          'type': 'EXPENSE',
          'amount': '150000',
          'currency': 'PYG',
          'occurredAt': '2026-08-15T21:04:00.000Z',
          'categoryId': expenseChildId,
          'paymentSourceId': cashSourceId,
          'description': 'Biggie',
          'notes': 'con cupón',
          'clientMutationId': mutationId,
        });
        // localDate and baseAmountPyg are the server's to derive.
        expect(json.containsKey('localDate'), isFalse);
        expect(json.containsKey('baseAmountPyg'), isFalse);
      },
    );

    test('a new income is named after its category, discarding typed text', () {
      final json =
          filled(
                type: TransactionType.income,
                categoryId: incomeRootId,
                description: 'Biggie',
              )
              .toCreateRequest(
                categories: buildCategories(),
                clientMutationId: mutationId,
              )
              .toJson();

      // Text typed while the form was in expense mode answered a question
      // that no longer applies.
      expect(json['description'], 'Salario');
      expect(json.containsKey('paymentSourceId'), isFalse);
    });

    test('an unsubmittable draft cannot be turned into a request', () {
      expect(
        () => blank().toCreateRequest(
          categories: buildCategories(),
          clientMutationId: mutationId,
        ),
        throwsStateError,
      );
      expect(() => filled(amount: '0').toUpdateRequest(), throwsStateError);
    });

    test('an edit clears the note and the payment source explicitly', () {
      final draft = TransactionDraft.fromTransaction(
        buildTransaction(notes: 'vieja nota'),
      ).copyWith(notes: '', paymentSourceId: null);

      expect(draft.toUpdateRequest().toJson(), {
        'amount': '150000',
        'currency': 'PYG',
        'fxRateToBase': null,
        'occurredAt': '2026-08-15T18:30:00.000Z',
        'categoryId': expenseChildId,
        'paymentSourceId': null,
        'description': 'Supermercado semanal',
        'notes': null,
      });
    });

    test('an edited income keeps the description it was stored with', () {
      final draft = TransactionDraft.fromTransaction(
        buildTransaction(
          type: TransactionType.income,
          categoryId: incomeRootId,
          description: 'Sueldo de julio',
          paymentSourceId: null,
        ),
      );

      // One settled from an expected income carries a real name; only a new
      // income is renamed after its category.
      expect(
        draft.toUpdateRequest().toJson()['description'],
        'Sueldo de julio',
      );
    });

    test('an edit never changes the movement kind', () {
      final draft = TransactionDraft.fromTransaction(buildTransaction());
      expect(draft.toUpdateRequest().toJson().containsKey('type'), isFalse);
    });
  });

  group('descriptionForNewTransaction', () {
    test('an income falls back rather than saving a blank title', () {
      expect(
        descriptionForNewTransaction(
          type: TransactionType.income,
          typedDescription: '',
          categoryName: null,
        ),
        'Ingreso',
      );
      expect(
        descriptionForNewTransaction(
          type: TransactionType.income,
          typedDescription: '',
          categoryName: '   ',
        ),
        'Ingreso',
      );
    });

    test('an expense keeps what it asked for, trimmed', () {
      expect(
        descriptionForNewTransaction(
          type: TransactionType.expense,
          typedDescription: '  Biggie  ',
          categoryName: 'Alimentación',
        ),
        'Biggie',
      );
    });
  });

  group('quick chips', () {
    final categories = buildCategories();

    test('recent roots rank by frequency, crediting a child to its root', () {
      final ids = recentRootCategoryIds(
        transactions: [
          buildTransaction(
            id: _id(1),
            categoryId: expenseChildId,
            localDate: '2026-08-14',
          ),
          buildTransaction(
            id: _id(2),
            categoryId: expenseRootId,
            localDate: '2026-08-01',
          ),
          buildTransaction(
            id: _id(3),
            categoryId: incomeRootId,
            localDate: '2026-08-14',
          ),
        ],
        categories: categories,
        kind: CategoryKind.expense,
        todayLocal: today,
      );

      expect(ids, [expenseRootId]);
    });

    test('a movement outside the window does not rank', () {
      final ids = recentRootCategoryIds(
        transactions: [
          buildTransaction(categoryId: expenseRootId, localDate: '2025-01-01'),
        ],
        categories: categories,
        kind: CategoryKind.expense,
        todayLocal: today,
      );

      expect(ids, isEmpty);
    });

    test('favourite sources rank all-time and ignore archived ones', () {
      final ids = favoritePaymentSourceIds(
        transactions: [
          buildTransaction(id: _id(1), paymentSourceId: cashSourceId),
          buildTransaction(id: _id(2), paymentSourceId: cashSourceId),
          buildTransaction(id: _id(3), paymentSourceId: bankSourceId),
          buildTransaction(id: _id(4), paymentSourceId: null),
          buildTransaction(id: _id(5), paymentSourceId: archivedSourceId),
        ],
        activePaymentSourceIds: {cashSourceId, bankSourceId},
      );

      expect(ids, [cashSourceId, bankSourceId]);
    });

    test('the chip row falls back to any active source when none rank', () {
      final chips = paymentSourceChips(
        paymentSources: buildPaymentSources(),
        favoriteIds: const [],
        selectedId: null,
      );

      expect(chips.map((source) => source.id), [cashSourceId, bankSourceId]);
    });

    test('selecting a source does not reshuffle the row', () {
      // Tapping a chip used to pull it to the front, moving the next one
      // under the finger that was about to tap it.
      final chips = paymentSourceChips(
        paymentSources: buildPaymentSources(),
        favoriteIds: const [cashSourceId],
        selectedId: bankSourceId,
      );

      expect(chips.map((source) => source.id), [cashSourceId, bankSourceId]);
    });

    test('a source past the limit is promoted so it stays visible', () {
      final many = [
        for (var index = 0; index < 5; index++)
          buildPaymentSource(
            id: '00000000-0000-4000-8000-00000000003$index',
            name: 'Medio $index',
          ),
      ];
      final chips = paymentSourceChips(
        paymentSources: many,
        favoriteIds: const [],
        selectedId: '00000000-0000-4000-8000-000000000034',
      );

      // A selection you cannot see reads as no selection at all.
      expect(chips.first.id, '00000000-0000-4000-8000-000000000034');
      expect(chips, hasLength(quickChipLimit));
    });
  });

  group('mostRecentUsdRate', () {
    test('takes the latest USD movement by instant, ignoring PYG ones', () {
      final rate = mostRecentUsdRate([
        buildTransaction(id: _id(1), localDate: '2026-08-14'),
        buildTransaction(
          id: _id(2),
          currency: Currency.usd,
          amount: '10.00',
          fxRateToBase: '7200',
          localDate: '2026-08-10',
        ),
        buildTransaction(
          id: _id(3),
          currency: Currency.usd,
          amount: '10.00',
          fxRateToBase: '7350',
          localDate: '2026-08-11',
        ),
      ]);

      expect(rate?.wire, '7350');
      expect(rate?.localDate, LocalDate(2026, 8, 11));
    });

    test('is null when the household has never used dollars', () {
      expect(mostRecentUsdRate([buildTransaction()]), isNull);
    });
  });
}

/// Distinct valid UUIDs, since several fixtures share a default id.
String _id(int n) => '00000000-0000-4000-8000-00000000000$n';
