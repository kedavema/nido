import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/contracts/categories.dart';

/// Category endpoints, path-for-path with the legacy client
/// (`apps/mobile/src/api/client.ts`).
class CategoriesApi {
  CategoriesApi(this._client);

  final ApiClient _client;

  String _base(String householdId) =>
      '/v1/households/${Uri.encodeComponent(householdId)}/categories';

  Future<ListCategoriesResponse> list(
    String householdId, {
    CancelToken? cancelToken,
  }) {
    return _client.get(
      _base(householdId),
      parse: ListCategoriesResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  Future<CategoryResponse> create(
    String householdId,
    CreateCategoryRequest request, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate(
      _base(householdId),
      method: 'POST',
      body: request.toJson(),
      parse: CategoryResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  Future<CategoryResponse> update(
    String householdId,
    String categoryId,
    UpdateCategoryRequest request, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate(
      '${_base(householdId)}/${Uri.encodeComponent(categoryId)}',
      method: 'PATCH',
      body: request.toJson(),
      parse: CategoryResponse.fromJson,
      cancelToken: cancelToken,
    );
  }

  /// Archives the category. The API answers `204` and keeps the row: a
  /// category with movements is never destroyed, only deactivated, so the
  /// history stays readable.
  Future<void> archive(
    String householdId,
    String categoryId, {
    CancelToken? cancelToken,
  }) {
    return _client.mutate<void>(
      '${_base(householdId)}/${Uri.encodeComponent(categoryId)}',
      method: 'DELETE',
      parse: (_) {},
      cancelToken: cancelToken,
    );
  }
}

final categoriesApiProvider = Provider<CategoriesApi>((ref) {
  return CategoriesApi(ref.watch(apiClientProvider));
});
