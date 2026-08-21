import 'package:flutter/material.dart';

import '../../../app/theme/app_spacing.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/contracts/transactions.dart';
import '../../categories/domain/category_appearance.dart';
import '../domain/transaction_filters.dart';

/// The movements filter sheet: kind and category.
///
/// Edits a local copy and only reports it on "Aplicar", so half-made choices
/// never reach the query — otherwise picking a kind and then a category would
/// fire two requests and briefly show a list nobody asked for.
Future<MovementFilters?> showMovementFiltersSheet({
  required BuildContext context,
  required MovementFilters filters,
  required List<Category> categories,
}) {
  return showModalBottomSheet<MovementFilters>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder:
        (context) =>
            _MovementFiltersSheet(filters: filters, categories: categories),
  );
}

class _MovementFiltersSheet extends StatefulWidget {
  const _MovementFiltersSheet({
    required this.filters,
    required this.categories,
  });

  final MovementFilters filters;
  final List<Category> categories;

  @override
  State<_MovementFiltersSheet> createState() => _MovementFiltersSheetState();
}

class _MovementFiltersSheetState extends State<_MovementFiltersSheet> {
  late MovementFilters _draft = widget.filters;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final groups = movementCategoryTree(widget.categories, _draft.categoryId);

    return SafeArea(
      key: const Key('movement_filters_sheet'),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        builder:
            (context, scrollController) => ListView(
              controller: scrollController,
              padding: AppSpacing.screenPadding,
              children: [
                Text('Filtros', style: theme.textTheme.titleMedium),
                const SizedBox(height: AppSpacing.cardGap),
                Text('Tipo', style: theme.textTheme.bodySmall),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  children: [
                    for (final type in TransactionType.values)
                      ChoiceChip(
                        key: Key('filter_type_${type.wireName}'),
                        label: Text(transactionTypeLabels[type]!),
                        selected: _draft.type == type,
                        // Tapping the selected kind clears it: the sheet has
                        // no separate "todos" chip, and a filter you cannot
                        // undo from where you set it is a trap.
                        onSelected:
                            (_) => setState(() {
                              _draft = _draft.withType(
                                _draft.type == type ? null : type,
                              );
                            }),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.cardGap),
                Text('Categoría', style: theme.textTheme.bodySmall),
                const SizedBox(height: AppSpacing.sm),
                for (final group in groups) ...[
                  _CategoryFilterRow(
                    category: group.root,
                    isSelected: _draft.categoryId == group.root.id,
                    onTap: () => _toggleCategory(group.root.id),
                  ),
                  for (final child in group.children)
                    Padding(
                      padding: const EdgeInsets.only(left: AppSpacing.xl),
                      child: _CategoryFilterRow(
                        category: child,
                        isSelected: _draft.categoryId == child.id,
                        onTap: () => _toggleCategory(child.id),
                      ),
                    ),
                ],
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: const Key('filters_clear_button'),
                        onPressed:
                            () => setState(() => _draft = MovementFilters.none),
                        child: const Text('Limpiar'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.cardGap),
                    Expanded(
                      child: FilledButton(
                        key: const Key('filters_apply_button'),
                        onPressed: () => Navigator.of(context).pop(_draft),
                        child: const Text('Aplicar'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
      ),
    );
  }

  void _toggleCategory(String categoryId) {
    setState(() {
      _draft = _draft.withCategoryId(
        _draft.categoryId == categoryId ? null : categoryId,
      );
    });
  }
}

class _CategoryFilterRow extends StatelessWidget {
  const _CategoryFilterRow({
    required this.category,
    required this.isSelected,
    required this.onTap,
  });

  final Category category;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = categoryColor(category.color);

    return ListTile(
      key: Key('filter_category_${category.id}'),
      onTap: onTap,
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        radius: 14,
        backgroundColor: categoryTint(color),
        child: Icon(resolveCategoryIcon(category.icon), size: 14, color: color),
      ),
      title: Text(
        category.isActive ? category.name : '${category.name} · Archivada',
      ),
      trailing: isSelected ? const Icon(Icons.check) : null,
    );
  }
}
