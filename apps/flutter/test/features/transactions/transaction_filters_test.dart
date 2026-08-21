import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/features/transactions/domain/transaction_filters.dart';
import 'package:nido/testing/finance_fakes.dart';

void main() {
  final categories = buildCategories();

  group('MovementFilters', () {
    test('counts only what is set', () {
      expect(MovementFilters.none.activeCount, 0);
      expect(MovementFilters.none.isEmpty, isTrue);
      expect(
        const MovementFilters(type: TransactionType.expense).activeCount,
        1,
      );
      expect(
        const MovementFilters(
          type: TransactionType.expense,
          categoryId: expenseRootId,
        ).activeCount,
        2,
      );
    });

    test('removing one filter leaves the other alone', () {
      const both = MovementFilters(
        type: TransactionType.expense,
        categoryId: expenseRootId,
      );
      expect(both.withType(null).categoryId, expenseRootId);
      expect(both.withCategoryId(null).type, TransactionType.expense);
    });

    test('equal filters are equal, so a query key does not churn', () {
      expect(
        const MovementFilters(type: TransactionType.income),
        const MovementFilters(type: TransactionType.income),
      );
    });
  });

  group('categoryFilterIds', () {
    test('a root matches itself and every child, since the API does not', () {
      expect(categoryFilterIds(expenseRootId, categories), {
        expenseRootId,
        expenseChildId,
        archivedChildId,
      });
    });

    test('a child matches only itself', () {
      expect(categoryFilterIds(expenseChildId, categories), {expenseChildId});
    });
  });

  group('applyLocalMovementFilters', () {
    final transactions = [
      buildTransaction(id: _id(1), categoryId: expenseRootId),
      buildTransaction(id: _id(2), categoryId: expenseChildId),
      buildTransaction(id: _id(3), categoryId: incomeRootId),
    ];

    test('no category filter returns the list untouched', () {
      expect(
        applyLocalMovementFilters(
          transactions,
          MovementFilters.none,
          categories,
        ),
        transactions,
      );
    });

    test('a root filter keeps the movements filed on its children', () {
      final filtered = applyLocalMovementFilters(
        transactions,
        const MovementFilters(categoryId: expenseRootId),
        categories,
      );

      expect(filtered.map((t) => t.id), [_id(1), _id(2)]);
    });

    test('a child filter is exact', () {
      final filtered = applyLocalMovementFilters(
        transactions,
        const MovementFilters(categoryId: expenseChildId),
        categories,
      );

      expect(filtered.map((t) => t.id), [_id(2)]);
    });
  });

  group('movementFilterChips', () {
    test('names the kind and the full category path', () {
      final chips = movementFilterChips(
        const MovementFilters(
          type: TransactionType.expense,
          categoryId: expenseChildId,
        ),
        categories,
      );

      expect(chips.map((chip) => chip.label), [
        'Gastos',
        'Alimentación · Supermercado',
      ]);
      expect(chips.map((chip) => chip.key), [
        MovementFilterKey.type,
        MovementFilterKey.categoryId,
      ]);
    });

    test('a category that no longer exists still produces a chip', () {
      // Dropping it would leave the list narrowed with nothing on screen
      // saying so — the exact failure the chips exist to prevent.
      final chips = movementFilterChips(
        const MovementFilters(
          categoryId: '00000000-0000-4000-8000-0000000000ff',
        ),
        categories,
      );

      expect(chips.single.label, 'Categoría filtrada');
    });
  });

  group('movementCategoryTree', () {
    test('shows only active categories by default', () {
      final groups = movementCategoryTree(categories, null);
      final expenseGroup = groups.firstWhere(
        (group) => group.root.id == expenseRootId,
      );

      expect(expenseGroup.children.map((child) => child.id), [expenseChildId]);
    });

    test('keeps a selected archived category so it can be cleared', () {
      final groups = movementCategoryTree(categories, archivedChildId);
      final expenseGroup = groups.firstWhere(
        (group) => group.root.id == expenseRootId,
      );

      expect(expenseGroup.children.map((child) => child.id), [
        expenseChildId,
        archivedChildId,
      ]);
    });
  });
}

String _id(int n) => '00000000-0000-4000-8000-00000000000$n';
