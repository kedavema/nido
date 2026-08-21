import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/contracts/categories.dart';
import '../data/categories_api.dart';

/// The household's categories.
///
/// `autoDispose` plus a [CancelToken] tied to disposal is the cancellation
/// rule the architecture asks for: leaving the screen (or switching
/// household) aborts the request in flight instead of letting it land on a
/// widget that is gone.
final categoriesProvider = FutureProvider.autoDispose
    .family<List<Category>, String>((ref, householdId) async {
      final cancelToken = CancelToken();
      ref.onDispose(cancelToken.cancel);
      final response = await ref
          .read(categoriesApiProvider)
          .list(householdId, cancelToken: cancelToken);
      return response.categories;
    });

/// Category mutations. Each one invalidates [categoriesProvider] rather than
/// patching a local list: the server assigns `sortOrder` and timestamps, and
/// a partial local copy would disagree with the next real read.
class CategoriesController {
  CategoriesController(this._ref);

  final Ref _ref;

  Future<Category> create(
    String householdId,
    CreateCategoryRequest request,
  ) async {
    final response = await _ref
        .read(categoriesApiProvider)
        .create(householdId, request);
    _ref.invalidate(categoriesProvider(householdId));
    return response.category;
  }

  Future<Category> update(
    String householdId,
    String categoryId,
    UpdateCategoryRequest request,
  ) async {
    final response = await _ref
        .read(categoriesApiProvider)
        .update(householdId, categoryId, request);
    _ref.invalidate(categoriesProvider(householdId));
    return response.category;
  }

  Future<void> archive(String householdId, String categoryId) async {
    await _ref.read(categoriesApiProvider).archive(householdId, categoryId);
    _ref.invalidate(categoriesProvider(householdId));
  }
}

final categoriesControllerProvider = Provider<CategoriesController>((ref) {
  return CategoriesController(ref);
});
