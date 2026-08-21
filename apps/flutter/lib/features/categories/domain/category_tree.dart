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

/// Resolves ids to categories in preference order, deduplicated, dropping
/// unknowns.
List<Category> _orderedByPreference(
  List<Category> pool,
  List<String?> preferred,
  List<String> rest,
) {
  final ids = <String>{...preferred.whereType<String>(), ...rest};
  return [
    for (final id in ids)
      if (_findById(pool, id) case final category?) category,
  ];
}

/// The root chips a form shows above the picker: preferred roots first (the
/// selected one, then whatever the caller ranks as recent), padded with the
/// remaining active roots so selecting a category never collapses the row to
/// a single chip.
List<Category> rootCategoryChips(
  List<Category> categories,
  List<String?> preferredRootIds,
  int limit,
) {
  final roots = categories
      .where((category) => category.isRoot && category.isActive)
      .toList(growable: false);
  final ordered = _orderedByPreference(roots, preferredRootIds, [
    for (final root in roots) root.id,
  ]);
  return ordered.take(limit).toList(growable: false);
}

/// The child chips for the selected root, with the selected child pulled to
/// the front so it stays visible even when the root has more children than
/// [limit].
List<Category> subcategoryChips(
  List<Category> categories,
  String? selectedRootId,
  String? selectedCategoryId,
  int limit,
) {
  if (selectedRootId == null) {
    return const [];
  }
  final children = categories
      .where(
        (category) => category.parentId == selectedRootId && category.isActive,
      )
      .toList(growable: false);
  final selectedChild = _findById(children, selectedCategoryId);
  final ordered = _orderedByPreference(
    children,
    [selectedChild?.id],
    [for (final child in children) child.id],
  );
  return ordered.take(limit).toList(growable: false);
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
