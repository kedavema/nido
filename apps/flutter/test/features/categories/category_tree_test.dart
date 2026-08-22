import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/categories.dart';
import 'package:nido/features/categories/domain/category_appearance.dart';
import 'package:nido/features/categories/domain/category_tree.dart';
import 'package:nido/testing/finance_fakes.dart';

void main() {
  final categories = buildCategories();

  group('categoryGroups', () {
    test('hangs each child off its root and lists no orphans', () {
      final groups = categoryGroups(categories);

      expect(groups.map((group) => group.root.id), [
        expenseRootId,
        incomeRootId,
      ]);
      expect(groups.first.children.map((child) => child.id), [
        expenseChildId,
        archivedChildId,
      ]);
      expect(groups.last.children, isEmpty);
    });
  });

  group('filterCategoryGroups', () {
    test('a root match keeps all of its children', () {
      final groups = filterCategoryGroups(categories, 'aliment');

      expect(groups, hasLength(1));
      expect(groups.single.children, hasLength(2));
    });

    test('a child match keeps its parent and only the matching children', () {
      final groups = filterCategoryGroups(categories, 'super');

      expect(groups.single.root.id, expenseRootId);
      expect(groups.single.children.map((child) => child.id), [expenseChildId]);
    });

    test('search ignores accents and case, as Spanish typing requires', () {
      expect(filterCategoryGroups(categories, 'ALIMENTACIÓN'), hasLength(1));
      expect(filterCategoryGroups(categories, 'alimentacion'), hasLength(1));
      expect(normalizeSearchValue('  Ñandú Café '), 'nandu cafe');
    });

    test('an empty query is not a filter', () {
      expect(filterCategoryGroups(categories, '   '), hasLength(2));
    });

    test('no match yields no groups rather than an unfiltered list', () {
      expect(filterCategoryGroups(categories, 'zzz'), isEmpty);
    });
  });

  group('chip selection', () {
    test('a selected child resolves to the root chip that owns it', () {
      expect(selectedRootCategoryId(expenseChildId, categories), expenseRootId);
      expect(selectedRootCategoryId(expenseRootId, categories), expenseRootId);
      expect(selectedRootCategoryId(null, categories), isNull);
    });

    test('the most-used roots lead, and the rest pad the row', () {
      final chips = rootCategoryChips(
        categories,
        recentRootIds: [incomeRootId],
        selectedRootId: null,
        limit: 3,
      );

      expect(chips.map((c) => c.id), [incomeRootId, expenseRootId]);
    });

    test('selecting a root does not reshuffle the row under your finger', () {
      // The legacy behaviour led with the selection, so every tap moved the
      // next chip somewhere else.
      final unselected = rootCategoryChips(
        categories,
        recentRootIds: const [],
        selectedRootId: null,
        limit: 3,
      );
      final selected = rootCategoryChips(
        categories,
        recentRootIds: const [],
        selectedRootId: incomeRootId,
        limit: 3,
      );

      expect(selected.map((c) => c.id), unselected.map((c) => c.id));
    });

    test('a root picked from "ver todas" is promoted so it stays visible', () {
      final many = [
        for (var index = 0; index < 5; index++)
          buildCategory(
            id: '00000000-0000-4000-8000-00000000002$index',
            name: 'Raíz $index',
          ),
      ];
      final chips = rootCategoryChips(
        many,
        recentRootIds: const [],
        selectedRootId: '00000000-0000-4000-8000-000000000024',
        limit: 3,
      );

      // A selection you cannot see reads as no selection at all.
      expect(chips.first.id, '00000000-0000-4000-8000-000000000024');
      expect(chips, hasLength(3));
    });

    test('root chips never include an archived root', () {
      final withArchivedRoot = [
        ...categories,
        buildCategory(
          id: '00000000-0000-4000-8000-0000000000aa',
          name: 'Vieja',
          isActive: false,
        ),
      ];

      expect(
        rootCategoryChips(
          withArchivedRoot,
          recentRootIds: const [],
          selectedRootId: null,
          limit: 5,
        ).map((c) => c.id),
        isNot(contains('00000000-0000-4000-8000-0000000000aa')),
      );
    });

    test('subcategory chips exclude archived children', () {
      final chips = subcategoryChips(
        categories,
        expenseRootId,
        expenseChildId,
        3,
      );

      expect(chips.map((c) => c.id), [expenseChildId]);
    });

    test('no root selected means no subcategory chips', () {
      expect(subcategoryChips(categories, null, null, 3), isEmpty);
    });

    test('selecting a child leaves the row where it was', () {
      final chips = subcategoryChips(
        categories,
        expenseRootId,
        expenseChildId,
        3,
      );
      final unselected = subcategoryChips(categories, expenseRootId, null, 3);

      expect(chips.map((c) => c.id), unselected.map((c) => c.id));
    });

    test('a child past the limit is promoted so it stays visible', () {
      final many = [
        buildCategory(id: expenseRootId, name: 'Alimentación'),
        for (var index = 0; index < 5; index++)
          buildCategory(
            id: '00000000-0000-4000-8000-00000000001$index',
            name: 'Hijo $index',
            parentId: expenseRootId,
          ),
      ];
      final chips = subcategoryChips(
        many,
        expenseRootId,
        '00000000-0000-4000-8000-000000000014',
        3,
      );

      expect(chips.first.id, '00000000-0000-4000-8000-000000000014');
      expect(chips, hasLength(3));
    });
  });

  group('nextRequiredCategoryId', () {
    test('re-tapping the selected child falls back to its root', () {
      final child = categories.firstWhere((c) => c.id == expenseChildId);
      expect(nextRequiredCategoryId(expenseChildId, child), expenseRootId);
    });

    test('tapping a root never clears the required category', () {
      final root = categories.firstWhere((c) => c.id == expenseRootId);
      expect(nextRequiredCategoryId(expenseRootId, root), expenseRootId);
    });

    test('tapping an unselected child selects it', () {
      final child = categories.firstWhere((c) => c.id == expenseChildId);
      expect(nextRequiredCategoryId(expenseRootId, child), expenseChildId);
    });
  });

  group('categoryLabel', () {
    test('a child reads as "root · child" and a root as itself', () {
      expect(
        categoryLabel(expenseChildId, categories),
        'Alimentación · Supermercado',
      );
      expect(categoryLabel(expenseRootId, categories), 'Alimentación');
    });

    test('an unknown id is null so the caller decides what to say', () {
      expect(
        categoryLabel('00000000-0000-4000-8000-0000000000ff', categories),
        isNull,
      );
    });
  });

  group('nextRootSortOrder', () {
    test('appends past the highest root of that kind', () {
      // A new root left at the column default of 0 would sort ahead of every
      // seeded root and hijack any "first active root" default.
      expect(nextRootSortOrder(categories, CategoryKind.expense), 1);
      expect(nextRootSortOrder(const [], CategoryKind.income), 1);
    });

    test('counts only roots of the requested kind', () {
      final withHighIncomeRoot = [
        ...categories,
        buildCategory(
          id: '00000000-0000-4000-8000-0000000000bb',
          name: 'Extras',
          kind: CategoryKind.income,
          sortOrder: 9,
        ),
      ];

      expect(nextRootSortOrder(withHighIncomeRoot, CategoryKind.expense), 1);
      expect(nextRootSortOrder(withHighIncomeRoot, CategoryKind.income), 10);
    });
  });

  group('appearance', () {
    test('an unknown stored icon falls back instead of drawing nothing', () {
      expect(resolveCategoryIcon('restaurant'), isNotNull);
      expect(
        resolveCategoryIcon('a-name-ionicons-had-and-material-does-not'),
        categoryIconGlyphs[fallbackCategoryIcon],
      );
    });

    test('a colour outside the palette stays selectable', () {
      const offPalette = '#123456';
      expect(
        optionsWithCurrent(categoryColorOptions, offPalette).first,
        offPalette,
      );
      // An offered colour is not duplicated at the front.
      expect(
        optionsWithCurrent(categoryColorOptions, categoryColorOptions.first),
        categoryColorOptions,
      );
    });

    test('a malformed colour degrades instead of throwing inside a build', () {
      expect(categoryColor('nope'), isNotNull);
      expect(categoryColor('#3E6B34').toARGB32(), 0xFF3E6B34);
    });
  });
}
