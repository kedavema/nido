import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/contracts/payment_sources.dart';
import '../data/payment_sources_api.dart';

/// The household's payment sources, cancelled on disposal like every other
/// catalog read.
final paymentSourcesProvider = FutureProvider.autoDispose
    .family<List<PaymentSource>, String>((ref, householdId) async {
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);
      final response = await ref
          .read(paymentSourcesApiProvider)
          .list(householdId, cancelToken: cancelToken);
      return response.paymentSources;
    });

class PaymentSourcesController {
  PaymentSourcesController(this._ref);

  final Ref _ref;

  Future<PaymentSource> create(
    String householdId,
    CreatePaymentSourceRequest request,
  ) async {
    final response = await _ref
        .read(paymentSourcesApiProvider)
        .create(householdId, request);
    _ref.invalidate(paymentSourcesProvider(householdId));
    return response.paymentSource;
  }

  Future<PaymentSource> update(
    String householdId,
    String paymentSourceId,
    UpdatePaymentSourceRequest request,
  ) async {
    final response = await _ref
        .read(paymentSourcesApiProvider)
        .update(householdId, paymentSourceId, request);
    _ref.invalidate(paymentSourcesProvider(householdId));
    return response.paymentSource;
  }

  Future<void> archive(String householdId, String paymentSourceId) async {
    await _ref
        .read(paymentSourcesApiProvider)
        .archive(householdId, paymentSourceId);
    _ref.invalidate(paymentSourcesProvider(householdId));
  }
}

final paymentSourcesControllerProvider = Provider<PaymentSourcesController>((
  ref,
) {
  return PaymentSourcesController(ref);
});
