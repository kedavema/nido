import '../../../core/contracts/categories.dart';
import '../../../core/contracts/transactions.dart';
import '../../categories/domain/category_tree.dart';

/// What the movements list can narrow by, ported from
/// `apps/mobile/src/utils/movement-filters.ts`.
///
/// Deliberately two fields: currency and payment source were removed upstream
/// (#228) because the search box already covers merchant, note and amount,
/// and a currency filter only earns its place in a household running two
/// currencies in parallel.
class MovementFilters {
  const MovementFilters({this.type, this.categoryId});

  final TransactionType? type;
  final String? categoryId;

  static const MovementFilters none = MovementFilters();

  bool get isEmpty => type == null && categoryId == null;

  int get activeCount => (type == null ? 0 : 1) + (categoryId == null ? 0 : 1);

  MovementFilters withType(TransactionType? type) =>
      MovementFilters(type: type, categoryId: categoryId);

  MovementFilters withCategoryId(String? categoryId) =>
      MovementFilters(type: type, categoryId: categoryId);

  @override
  bool operator ==(Object other) =>
      other is MovementFilters &&
      other.type == type &&
      other.categoryId == categoryId;

  @override
  int get hashCode => Object.hash(type, categoryId);

  @override
  String toString() => 'MovementFilters(type: $type, categoryId: $categoryId)';
}

/// Which filter a visible chip stands for.
enum MovementFilterKey { type, categoryId }

class MovementFilterChip {
  const MovementFilterChip({required this.key, required this.label});

  final MovementFilterKey key;
  final String label;
}

/// Shared with the filter sheet's segmented control so one copy change
/// reaches both surfaces.
const Map<TransactionType, String> transactionTypeLabels = {
  TransactionType.expense: 'Gastos',
  TransactionType.income: 'Ingresos',
};

/// Every category id a selection should match: the category itself, plus its
/// children when it is a root.
///
/// This exists because the API matches `categoryId` exactly
/// (`transactions.service.ts`), which made selecting a root return only what
/// was filed directly on it. Applied on the client because a month's
/// transactions arrive in one unpaginated response; if that ever changes, the
/// contract needs `categoryId` to become a set.
Set<String> categoryFilterIds(String categoryId, List<Category> categories) {
  return {
    categoryId,
    for (final category in categories)
      if (category.parentId == categoryId) category.id,
  };
}

/// Applies the filters this screen resolves locally. Type and search are
/// applied by the API.
List<Transaction> applyLocalMovementFilters(
  List<Transaction> transactions,
  MovementFilters filters,
  List<Category> categories,
) {
  final categoryId = filters.categoryId;
  if (categoryId == null) {
    return transactions;
  }
  final wanted = categoryFilterIds(categoryId, categories);
  return transactions
      .where((transaction) => wanted.contains(transaction.categoryId))
      .toList(growable: false);
}

/// The applied filters, for the chips that stay visible outside the sheet. A
/// filter you cannot see is a filter you forget, and then a narrowed list
/// reads as missing data.
///
/// A selection whose category no longer exists still produces a chip —
/// labelled generically, since there is no name left to print. Dropping it
/// would leave the list narrowed with nothing on screen saying so.
List<MovementFilterChip> movementFilterChips(
  MovementFilters filters,
  List<Category> categories,
) {
  return [
    if (filters.type case final type?)
      MovementFilterChip(
        key: MovementFilterKey.type,
        label: transactionTypeLabels[type]!,
      ),
    if (filters.categoryId case final categoryId?)
      MovementFilterChip(
        key: MovementFilterKey.categoryId,
        label: categoryLabel(categoryId, categories) ?? 'Categoría filtrada',
      ),
  ];
}

/// The tree the filter sheet renders. Only active categories, except that a
/// selected-but-archived one — and its root — are kept so the row stays
/// visible and clearable from inside the sheet.
List<CategoryGroup> movementCategoryTree(
  List<Category> categories,
  String? selectedCategoryId,
) {
  String? keptParentId;
  for (final category in categories) {
    if (category.id == selectedCategoryId) {
      keptParentId = category.parentId;
    }
  }
  final visible = categories
      .where(
        (category) =>
            category.isActive ||
            category.id == selectedCategoryId ||
            category.id == keptParentId,
      )
      .toList(growable: false);
  return categoryGroups(visible);
}
