import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/errors/app_error.dart';

/// Transaction endpoints, path-for-path with the legacy client
/// (`apps/mobile/src/api/client.ts`).
class TransactionsApi {
  TransactionsApi(this._client);

  final ApiClient _client;

  String _base(String householdId) =>
      '/v1/households/${Uri.encodeComponent(householdId)}/transactions';

  /// Lists movements for [query].
  ///
  /// There is no pagination on this endpoint: whatever matches comes back in
  /// one response. Callers must surface that rather than implying a page
  /// boundary (`docs/flutter-architecture.md` §Performance).
  ///
  /// [cancelToken] is how a screen drops a superseded request when its
  /// filters change — without it a slow first response could land after a
  /// faster second one and show stale rows.
  Future<ListTransactionsResponse> list(
    String householdId, {
    ListTransactionsQuery query = ListTransactionsQuery.none,
    CancelToken? cancelToken,
  }) {
    return _client.get(
      _base(householdId),
      parse: ListTransactionsResponse.fromJson,
      query: query.toQueryParameters(),
      cancelToken: cancelToken,
    );
  }

  Future<TransactionResponse> getById(
    String householdId,
    String transactionId, {
    CancelToken? cancelToken,
  }) {
    return _client.get(
      '${_base(householdId)}/${Uri.encodeComponent(transactionId)}',
      parse: TransactionResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  /// Creates a movement.
  ///
  /// ADR 0003: when the body carries a `clientMutationId`, the API requires
  /// an `Idempotency-Key` header equal to it. Sending both from the start —
  /// even though M3 is online-only — is what makes a create whose response
  /// was lost safe to retry; the offline queue in M4 replays the very same
  /// canonical request.
  Future<TransactionResponse> create(
    String householdId,
    CreateTransactionRequest request, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate(
      _base(householdId),
      method: 'POST',
      body: request.toJson(),
      idempotencyKey: request.clientMutationId,
      parse: TransactionResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  Future<TransactionResponse> update(
    String householdId,
    String transactionId,
    UpdateTransactionRequest request, {
    CancelToken? cancelToken,
  }) {
    if (request.isEmpty) {
      // An empty patch is a no-op the server would have to answer anyway.
      throw const ValidationError();
    }
    return _client.mutate(
      '${_base(householdId)}/${Uri.encodeComponent(transactionId)}',
      method: 'PATCH',
      body: request.toJson(),
      parse: TransactionResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  /// Deletes a movement (`204`). Unlike catalog rows this is a real delete —
  /// the month's totals are recomputed without it, for both members.
  Future<void> delete(
    String householdId,
    String transactionId, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate<void>(
      '${_base(householdId)}/${Uri.encodeComponent(transactionId)}',
      method: 'DELETE',
      parse: (_) {},
      cancelToken: cancelToken,
    );
  }
}

final transactionsApiProvider = Provider<TransactionsApi>((ref) {
  return TransactionsApi(ref.watch(apiClientProvider));
});
