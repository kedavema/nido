import '../../../core/contracts/categories.dart';

/// The root/child tree every category surface renders, ported from
/// `apps/mobile/src/utils/category-selection.ts`. The taxonomy is exactly two
/// levels, so a group's children are its whole descendant set.
class CategoryGroup {
  const CategoryGroup({required this.root, required this.children});

  final Category root;
  final List<Category> children;
}

/// Accent-insensitive, case-insensitive comparison key for search.
String normalizeSearchValue(String value) {
  const accented = 'áàäâãéèëêíìïîóòöôõúùüûñç';
  const plain = 'aaaaaeeeeiiiiooooouuuunc';
  final lowered = value.trim().toLowerCase();
  final buffer = StringBuffer();
  for (final rune in lowered.runes) {
    final character = String.fromCharCode(rune);
    final index = accented.indexOf(character);
    buffer.write(index == -1 ? character : plain[index]);
  }
  return buffer.toString();
}

/// Builds the tree in the order the API returned (`sortOrder`, then name) —
/// the curated order every other category surface shows.
List<CategoryGroup> categoryGroups(List<Category> categories) {
  return [
    for (final root in categories.where((category) => category.isRoot))
      CategoryGroup(
        root: root,
        children: categories
            .where((category) => category.parentId == root.id)
            .toList(growable: false),
      ),
  ];
}

/// Filters the tree without losing context: a root match keeps all of its
/// children, while a child-only match keeps its parent and only the matching
/// children.
List<CategoryGroup> filterCategoryGroups(
  List<Category> categories,
  String search,
) {
  final query = normalizeSearchValue(search);
  final groups = categoryGroups(categories);
  if (query.isEmpty) {
    return groups;
  }

  final result = <CategoryGroup>[];
  for (final group in groups) {
    if (normalizeSearchValue(group.root.name).contains(query)) {
      result.add(group);
      continue;
    }
    final children = group.children
        .where((child) => normalizeSearchValue(child.name).contains(query))
        .toList(growable: false);
    if (children.isNotEmpty) {
      result.add(CategoryGroup(root: group.root, children: children));
    }
  }
  return result;
}

Category? _findById(List<Category> categories, String? id) {
  if (id == null) {
    return null;
  }
  for (final category in categories) {
    if (category.id == id) {
      return category;
    }
  }
  return null;
}

/// Resolves a selected subcategory to the root chip that owns it.
String? selectedRootCategoryId(
  String? selectedCategoryId,
  List<Category> categories,
) {
  final selected = _findById(categories, selectedCategoryId);
  return selected?.parentId ?? selected?.id;
}

/// Orders [pool] for a quick-chip row and cuts it to [limit].
///
/// [ranked] is a stable ordering derived from history (most-used first); the
/// rest follow in the order the API returned. The selected id is deliberately
/// NOT promoted to the front: a row that rearranges itself the instant you tap
/// it moves the next chip under your finger, and the legacy behaviour of
/// always leading with the selection made every pick feel like the list had
/// shuffled.
///
/// It IS promoted when it would otherwise fall outside the visible window,
/// because a selection you cannot see reads as no selection at all. That
/// happens once, when something is picked from "Ver todas" that was not among
/// the quick chips, and the row then stays put while you keep tapping.
List<T> orderedChips<T>({
  required List<T> pool,
  required String Function(T item) idOf,
  required List<String> ranked,
  required String? selectedId,
  required int limit,
}) {
  final byId = {for (final item in pool) idOf(item): item};
  final ordered = <T>[
    for (final id in ranked)
      if (byId[id] case final item?) item,
    for (final item in pool)
      if (!ranked.contains(idOf(item))) item,
  ];

  final visible = ordered.take(limit).toList(growable: false);
  if (selectedId == null || visible.any((item) => idOf(item) == selectedId)) {
    return visible;
  }
  final selected = byId[selectedId];
  if (selected == null) {
    return visible;
  }
  return [
    selected,
    ...ordered.where((item) => idOf(item) != selectedId),
  ].take(limit).toList(growable: false);
}

/// The root chips a form shows above the picker: the household's most-used
/// roots first, padded with the remaining active ones so the row never
/// collapses to a single chip. See [orderedChips] for why the selected root
/// does not jump to the front.
List<Category> rootCategoryChips(
  List<Category> categories, {
  required List<String> recentRootIds,
  required String? selectedRootId,
  required int limit,
}) {
  return orderedChips(
    pool: categories
        .where((category) => category.isRoot && category.isActive)
        .toList(growable: false),
    idOf: (category) => category.id,
    ranked: recentRootIds,
    selectedId: selectedRootId,
    limit: limit,
  );
}

/// The child chips for the selected root, in the catalog's own order. The
/// selected child only moves when it would otherwise be past [limit].
List<Category> subcategoryChips(
  List<Category> categories,
  String? selectedRootId,
  String? selectedCategoryId,
  int limit,
) {
  if (selectedRootId == null) {
    return const [];
  }
  return orderedChips(
    pool: categories
        .where(
          (category) =>
              category.parentId == selectedRootId && category.isActive,
        )
        .toList(growable: false),
    idOf: (category) => category.id,
    ranked: const [],
    selectedId: selectedCategoryId,
    limit: limit,
  );
}

/// Categories are required, subcategories are optional. Tapping an already
/// selected child removes only that child and falls back to its root; tapping
/// a root never clears the required category into an invalid state.
String nextRequiredCategoryId(String? currentCategoryId, Category selected) {
  final parentId = selected.parentId;
  if (parentId != null && currentCategoryId == selected.id) {
    return parentId;
  }
  return selected.id;
}

/// "Alimentación · Supermercado" for a subcategory, or just "Alimentación"
/// for a root. `null` when the id names no known category — the caller
/// decides what to say instead, since a filtered-out or deleted category
/// must still be visible as *something*.
String? categoryLabel(String categoryId, List<Category> categories) {
  final category = _findById(categories, categoryId);
  if (category == null) {
    return null;
  }
  final parentId = category.parentId;
  if (parentId == null) {
    return category.name;
  }
  final parent = _findById(categories, parentId);
  return parent == null ? category.name : '${parent.name} · ${category.name}';
}

/// The next `sortOrder` for a new root of [kind].
///
/// The seed assigns one per root and `listCategories` orders by it, so a new
/// root left at the column default of 0 would sort ahead of every seeded root
/// and silently become the default any "first active root" rule picks.
/// Appending past the current maximum keeps it out of that position.
int nextRootSortOrder(List<Category> categories, CategoryKind kind) {
  var maximum = 0;
  for (final category in categories) {
    if (category.isRoot && category.kind == kind) {
      maximum = category.sortOrder > maximum ? category.sortOrder : maximum;
    }
  }
  return maximum + 1;
}
