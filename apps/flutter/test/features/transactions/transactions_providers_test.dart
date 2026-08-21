import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/api/api_providers.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/core/time/year_month.dart';
import 'package:nido/features/transactions/application/transactions_providers.dart';
import 'package:nido/features/transactions/data/transactions_api.dart';
import 'package:nido/features/transactions/domain/transaction_filters.dart';
import 'package:nido/testing/finance_fakes.dart';

void main() {
  late FakeTransactionsApi api;
  late ProviderContainer container;

  setUp(() {
    api = FakeTransactionsApi();
    container = ProviderContainer(
      overrides: [
        transactionsApiProvider.overrideWithValue(api),
        clockProvider.overrideWithValue(() => DateTime.utc(2026, 8, 15, 21, 4)),
        searchDebounceProvider.overrideWithValue(
          const Duration(milliseconds: 10),
        ),
      ],
    );
    addTearDown(container.dispose);
  });

  TransactionsListKey keyFor({
    YearMonth? month,
    TransactionType? type,
    String search = '',
  }) => (
    householdId: testHouseholdId,
    month: month ?? YearMonth(2026, 8),
    type: type,
    search: search,
  );

  group('transactionsProvider', () {
    test('turns the key into the month range the API filters by', () async {
      final subscription = container.listen(
        transactionsProvider(
          keyFor(type: TransactionType.expense, search: 'super'),
        ),
        (_, _) {},
      );
      addTearDown(subscription.close);
      await container.read(
        transactionsProvider(
          keyFor(type: TransactionType.expense, search: 'super'),
        ).future,
      );

      expect(api.listQueries.single.toQueryParameters(), {
        'from': '2026-08-01',
        'to': '2026-08-31',
        'type': 'EXPENSE',
        'search': 'super',
      });
    });

    test(
      'an empty search is absent from the query, not an empty parameter',
      () async {
        await container.read(transactionsProvider(keyFor()).future);

        expect(api.listQueries.single.toQueryParameters(), {
          'from': '2026-08-01',
          'to': '2026-08-31',
        });
      },
    );

    test(
      'the same key is one request, however many widgets watch it',
      () async {
        final a = container.listen(transactionsProvider(keyFor()), (_, _) {});
        final b = container.listen(transactionsProvider(keyFor()), (_, _) {});
        addTearDown(a.close);
        addTearDown(b.close);
        await container.read(transactionsProvider(keyFor()).future);

        expect(api.listCallCount, 1);
      },
    );

    test('changing the filter cancels the request it superseded', () async {
      // The first query is held open, so it is genuinely still in flight when
      // the second one starts — the shape of the bug this guards against.
      final gate = Completer<void>();
      api.gateList = (query) async {
        if (query.type == null) {
          await gate.future;
        }
      };

      final first = container.listen(transactionsProvider(keyFor()), (_, _) {});
      await Future<void>.delayed(Duration.zero);
      expect(api.listTokens.single?.isCancelled, isFalse);

      // Applying a filter drops the previous key's provider.
      first.close();
      final second = container.listen(
        transactionsProvider(keyFor(type: TransactionType.income)),
        (_, _) {},
      );
      addTearDown(second.close);
      await Future<void>.delayed(Duration.zero);

      expect(
        api.listTokens.first?.isCancelled,
        isTrue,
        reason: 'the superseded request must be aborted, not just ignored',
      );
      expect(api.listTokens.last?.isCancelled, isFalse);

      gate.complete();
    });

    test('a stale response cannot reach a screen that moved on', () async {
      final gate = Completer<void>();
      api.gateList = (query) async {
        if (query.type == null) {
          await gate.future;
        }
      };
      api.transactions = [buildTransaction(description: 'vieja')];

      final stale = container.listen(transactionsProvider(keyFor()), (_, _) {});
      await Future<void>.delayed(Duration.zero);
      stale.close();

      api.transactions = [buildTransaction(description: 'nueva')];
      final current = keyFor(type: TransactionType.income);
      final subscription = container.listen(
        transactionsProvider(current),
        (_, _) {},
      );
      addTearDown(subscription.close);
      final result = await container.read(transactionsProvider(current).future);

      // Let the abandoned request finish after the newer one already did.
      gate.complete();
      await Future<void>.delayed(Duration.zero);

      expect(result.single.description, 'nueva');
      expect(
        container.read(transactionsProvider(current)).value?.single.description,
        'nueva',
      );
    });
  });

  group('MovementSearchController', () {
    test(
      'the input updates immediately, the query only after the pause',
      () async {
        final notifier = container.read(movementSearchProvider.notifier);

        notifier.type('s');
        notifier.type('su');
        notifier.type('sup');

        expect(container.read(movementSearchProvider).input, 'sup');
        expect(container.read(movementSearchProvider).debounced, '');

        await Future<void>.delayed(const Duration(milliseconds: 30));

        // One pause, one debounced value — not one per keystroke.
        expect(container.read(movementSearchProvider).debounced, 'sup');
      },
    );

    test(
      'the debounced value is trimmed, so " a " and "a" are one query',
      () async {
        container.read(movementSearchProvider.notifier).type('  super  ');
        await Future<void>.delayed(const Duration(milliseconds: 30));

        expect(container.read(movementSearchProvider).debounced, 'super');
      },
    );

    test(
      'clearing cancels a pending debounce instead of firing it late',
      () async {
        final notifier = container.read(movementSearchProvider.notifier);
        notifier.type('super');
        notifier.clear();
        await Future<void>.delayed(const Duration(milliseconds: 30));

        expect(container.read(movementSearchProvider).input, '');
        expect(container.read(movementSearchProvider).debounced, '');
      },
    );
  });

  group('MovementMonth', () {
    test('starts on the current month in the household timezone', () {
      expect(container.read(movementMonthProvider), YearMonth(2026, 8));
    });

    test('steps across the year boundary in both directions', () {
      final notifier = container.read(movementMonthProvider.notifier);

      for (var index = 0; index < 5; index++) {
        notifier.next();
      }
      expect(container.read(movementMonthProvider), YearMonth(2027, 1));

      notifier.previous();
      expect(container.read(movementMonthProvider), YearMonth(2026, 12));

      notifier.reset();
      expect(container.read(movementMonthProvider), YearMonth(2026, 8));
    });
  });

  group('MovementFiltersController', () {
    test('applies, removes one at a time, and clears', () {
      final notifier = container.read(movementFiltersProvider.notifier);

      notifier.apply(
        const MovementFilters(
          type: TransactionType.expense,
          categoryId: expenseRootId,
        ),
      );
      expect(container.read(movementFiltersProvider).activeCount, 2);

      notifier.remove(MovementFilterKey.type);
      expect(container.read(movementFiltersProvider).type, isNull);
      expect(container.read(movementFiltersProvider).categoryId, expenseRootId);

      notifier.clear();
      expect(container.read(movementFiltersProvider).isEmpty, isTrue);
    });
  });

  group('TransactionsController', () {
    test(
      'a create invalidates every cached list, not just the visible one',
      () async {
        final key = keyFor();
        final subscription = container.listen(
          transactionsProvider(key),
          (_, _) {},
        );
        addTearDown(subscription.close);
        await container.read(transactionsProvider(key).future);
        expect(api.listCallCount, 1);

        await container
            .read(transactionsControllerProvider)
            .create(
              testHouseholdId,
              CreateTransactionRequest(
                type: TransactionType.expense,
                amount: buildTransaction().amount,
                occurredAt: '2026-08-15T21:04:00.000Z',
                categoryId: expenseChildId,
                description: 'Café',
                clientMutationId: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
              ),
            );
        final after = await container.read(transactionsProvider(key).future);

        // The cached list was dropped, so the next read went back to the
        // server and sees the new movement — a movement can even be backdated
        // into a month nobody is looking at.
        expect(api.created, hasLength(1));
        expect(api.listCallCount, greaterThan(1));
        expect(after.map((t) => t.description), contains('Café'));
      },
    );

    test('a delete removes the row and refreshes the list', () async {
      final key = keyFor();
      final subscription = container.listen(
        transactionsProvider(key),
        (_, _) {},
      );
      addTearDown(subscription.close);
      await container.read(transactionsProvider(key).future);

      await container
          .read(transactionsControllerProvider)
          .delete(testHouseholdId, buildTransaction().id);
      final after = await container.read(transactionsProvider(key).future);

      expect(api.deleted, [buildTransaction().id]);
      expect(after, isEmpty);
    });
  });
}
