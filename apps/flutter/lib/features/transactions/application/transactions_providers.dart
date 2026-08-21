import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/time/year_month.dart';
import '../data/transactions_api.dart';
import '../domain/transaction_filters.dart';

/// The month a movements list is showing, and how it is narrowed.
///
/// Only what the API resolves is part of the key: the month range, the type
/// and the search text. The category filter is applied over the response
/// (see [applyLocalMovementFilters]) because selecting a root has to include
/// its subcategories and the endpoint matches the id exactly — so putting it
/// in the key would refetch an identical query and blank a perfectly good
/// list on every category pick.
typedef TransactionsListKey =
    ({
      String householdId,
      YearMonth month,
      TransactionType? type,
      String search,
    });

typedef TransactionKey = ({String householdId, String transactionId});

/// How long the search box waits before it becomes a request.
final searchDebounceProvider = Provider<Duration>(
  (ref) => const Duration(milliseconds: 400),
);

/// The month the movements list is showing. Defaults to the current month in
/// the household timezone, never the device's.
final movementMonthProvider = NotifierProvider<MovementMonth, YearMonth>(
  MovementMonth.new,
);

class MovementMonth extends Notifier<YearMonth> {
  @override
  YearMonth build() => currentMonthInAsuncion(ref.read(clockProvider)());

  void next() => state = state.next;

  void previous() => state = state.previous;

  void reset() => state = currentMonthInAsuncion(ref.read(clockProvider)());
}

/// The filters applied outside the API (type is sent, category is local).
final movementFiltersProvider =
    NotifierProvider<MovementFiltersController, MovementFilters>(
      MovementFiltersController.new,
    );

class MovementFiltersController extends Notifier<MovementFilters> {
  @override
  MovementFilters build() => MovementFilters.none;

  void apply(MovementFilters filters) => state = filters;

  void remove(MovementFilterKey key) {
    state = switch (key) {
      MovementFilterKey.type => state.withType(null),
      MovementFilterKey.categoryId => state.withCategoryId(null),
    };
  }

  void clear() => state = MovementFilters.none;
}

/// What is typed in the search box, and the debounced value the query uses.
class MovementSearch {
  const MovementSearch({required this.input, required this.debounced});

  final String input;
  final String debounced;

  static const MovementSearch empty = MovementSearch(input: '', debounced: '');
}

final movementSearchProvider =
    NotifierProvider<MovementSearchController, MovementSearch>(
      MovementSearchController.new,
    );

/// Debounces the search box so a request is issued per pause, not per
/// keystroke. The pending timer is cancelled on dispose, so leaving the
/// screen mid-word cannot fire a query into a disposed provider.
class MovementSearchController extends Notifier<MovementSearch> {
  Timer? _timer;

  @override
  MovementSearch build() {
    ref.onDispose(() => _timer?.cancel());
    return MovementSearch.empty;
  }

  void type(String input) {
    state = MovementSearch(input: input, debounced: state.debounced);
    _timer?.cancel();
    _timer = Timer(ref.read(searchDebounceProvider), () {
      final trimmed = state.input.trim();
      if (trimmed != state.debounced) {
        state = MovementSearch(input: state.input, debounced: trimmed);
      }
    });
  }

  void clear() {
    _timer?.cancel();
    state = MovementSearch.empty;
  }
}

/// The movements for one list key.
///
/// Every distinct key is its own provider instance, so changing month, type
/// or search disposes the previous one and its [CancelToken] aborts the
/// request that is no longer wanted. That is what keeps a slow earlier
/// response from overwriting a faster later one.
final transactionsProvider = FutureProvider.autoDispose
    .family<List<Transaction>, TransactionsListKey>((ref, key) async {
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);

      final response = await ref
          .read(transactionsApiProvider)
          .list(
            key.householdId,
            query: ListTransactionsQuery(
              from: key.month.firstDay,
              to: key.month.lastDay,
              type: key.type,
              search: key.search.isEmpty ? null : key.search,
            ),
            cancelToken: cancelToken,
          );
      return response.transactions;
    });

/// Every movement of the household, unfiltered — the input the form's
/// "recientes"/"favoritos" chips and the last-used exchange rate are derived
/// from. Kept separate from [transactionsProvider] so opening the form does
/// not disturb the list's own query.
final allTransactionsProvider = FutureProvider.autoDispose
    .family<List<Transaction>, String>((ref, householdId) async {
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);
      final response = await ref
          .read(transactionsApiProvider)
          .list(householdId, cancelToken: cancelToken);
      return response.transactions;
    });

final transactionProvider = FutureProvider.autoDispose
    .family<Transaction, TransactionKey>((ref, key) async {
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);
      final response = await ref
          .read(transactionsApiProvider)
          .getById(
            key.householdId,
            key.transactionId,
            cancelToken: cancelToken,
          );
      return response.transaction;
    });

/// Movement mutations plus the invalidation that follows them.
class TransactionsController {
  TransactionsController(this._ref);

  final Ref _ref;

  Future<Transaction> create(
    String householdId,
    CreateTransactionRequest request,
  ) async {
    final response = await _ref
        .read(transactionsApiProvider)
        .create(householdId, request);
    _invalidateLists(householdId);
    return response.transaction;
  }

  Future<Transaction> update(
    String householdId,
    String transactionId,
    UpdateTransactionRequest request,
  ) async {
    final response = await _ref
        .read(transactionsApiProvider)
        .update(householdId, transactionId, request);
    _invalidateLists(householdId);
    _ref.invalidate(
      transactionProvider((
        householdId: householdId,
        transactionId: transactionId,
      )),
    );
    return response.transaction;
  }

  Future<void> delete(String householdId, String transactionId) async {
    await _ref.read(transactionsApiProvider).delete(householdId, transactionId);
    _invalidateLists(householdId);
  }

  /// Invalidates every cached list, not just the visible one: a movement
  /// saved with a backdated date belongs to a month the user is not looking
  /// at, and a filtered list may or may not still match it.
  void _invalidateLists(String householdId) {
    _ref
      ..invalidate(transactionsProvider)
      ..invalidate(allTransactionsProvider(householdId));
  }
}

final transactionsControllerProvider = Provider<TransactionsController>((ref) {
  return TransactionsController(ref);
});
