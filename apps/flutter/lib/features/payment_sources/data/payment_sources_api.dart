import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/contracts/payment_sources.dart';

/// Payment-source endpoints, path-for-path with the legacy client
/// (`apps/mobile/src/api/client.ts`).
class PaymentSourcesApi {
  PaymentSourcesApi(this._client);

  final ApiClient _client;

  String _base(String householdId) =>
      '/v1/households/${Uri.encodeComponent(householdId)}/payment-sources';

  Future<ListPaymentSourcesResponse> list(
    String householdId, {
    CancelToken? cancelToken,
  }) {
    return _client.get(
      _base(householdId),
      parse: ListPaymentSourcesResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  Future<PaymentSourceResponse> create(
    String householdId,
    CreatePaymentSourceRequest request, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate(
      _base(householdId),
      method: 'POST',
      body: request.toJson(),
      parse: PaymentSourceResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  Future<PaymentSourceResponse> update(
    String householdId,
    String paymentSourceId,
    UpdatePaymentSourceRequest request, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate(
      '${_base(householdId)}/${Uri.encodeComponent(paymentSourceId)}',
      method: 'PATCH',
      body: request.toJson(),
      parse: PaymentSourceResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  /// Archives the source (`204`). A source with movements is never destroyed:
  /// it stops being offered when loading a movement and the history keeps
  /// naming it.
  Future<void> archive(
    String householdId,
    String paymentSourceId, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate<void>(
      '${_base(householdId)}/${Uri.encodeComponent(paymentSourceId)}',
      method: 'DELETE',
      parse: (_) {},
      cancelToken: cancelToken,
    );
  }
}

final paymentSourcesApiProvider = Provider<PaymentSourcesApi>((ref) {
  return PaymentSourcesApi(ref.watch(apiClientProvider));
});
