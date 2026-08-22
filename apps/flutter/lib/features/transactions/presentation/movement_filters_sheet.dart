import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_bottom_sheet.dart';
import '../../../core/widgets/form_fields.dart';
import '../../../core/widgets/nido_chip.dart';
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
  return showAppBottomSheet<MovementFilters>(
    context: context,
    title: 'Filtros',
    subtitle: 'Para este mes',
    sheetKey: const Key('movement_filters_sheet'),
    builder:
        (context, controller) => _MovementFiltersBody(
          controller: controller,
          filters: filters,
          categories: categories,
        ),
  );
}

class _MovementFiltersBody extends StatefulWidget {
  const _MovementFiltersBody({
    required this.controller,
    required this.filters,
    required this.categories,
  });

  final ScrollController controller;
  final MovementFilters filters;
  final List<Category> categories;

  @override
  State<_MovementFiltersBody> createState() => _MovementFiltersBodyState();
}

class _MovementFiltersBodyState extends State<_MovementFiltersBody> {
  late MovementFilters _draft = widget.filters;

  void _toggleCategory(String categoryId) {
    setState(() {
      _draft = _draft.withCategoryId(
        _draft.categoryId == categoryId ? null : categoryId,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final groups = movementCategoryTree(widget.categories, _draft.categoryId);

    return Column(
      children: [
        Expanded(
          child: ListView(
            controller: widget.controller,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
            children: [
              NidoFormField(
                label: 'Tipo',
                child: ChipRow(
                  children: [
                    for (final type in TransactionType.values)
                      NidoChip(
                        key: Key('filter_type_${type.wireName}'),
                        label: transactionTypeLabels[type]!,
                        selected: _draft.type == type,
                        // Tapping the selected kind clears it: the sheet has no
                        // separate "todos" chip, and a filter you cannot undo
                        // from where you set it is a trap.
                        onPressed:
                            () => setState(() {
                              _draft = _draft.withType(
                                _draft.type == type ? null : type,
                              );
                            }),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.cardGap),
              const FieldLabel('Categoría'),
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
              const SizedBox(height: AppSpacing.screen),
            ],
          ),
        ),
        Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.cardGap,
            AppSpacing.screen,
            AppSpacing.cardGap + MediaQuery.viewPaddingOf(context).bottom,
          ),
          child: Row(
            children: [
              Expanded(
                child: ActionButton(
                  key: const Key('filters_clear_button'),
                  label: 'Limpiar',
                  variant: ActionButtonVariant.secondary,
                  onPressed:
                      () => setState(() => _draft = MovementFilters.none),
                ),
              ),
              const SizedBox(width: AppSpacing.cardGap),
              Expanded(
                child: ActionButton(
                  key: const Key('filters_apply_button'),
                  label: 'Aplicar',
                  onPressed: () => Navigator.of(context).pop(_draft),
                ),
              ),
            ],
          ),
        ),
      ],
    );
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
    final theme = Theme.of(context);
    final color = categoryColor(category.color);

    return InkWell(
      key: Key('filter_category_${category.id}'),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: categoryTint(color),
              child: Icon(
                resolveCategoryIcon(category.icon),
                size: 14,
                color: color,
              ),
            ),
            const SizedBox(width: AppSpacing.cardGap),
            Expanded(
              child: Text(
                category.isActive
                    ? category.name
                    : '${category.name} · Archivada',
                style: theme.textTheme.bodyMedium,
              ),
            ),
            if (isSelected)
              const Icon(Icons.check, size: 18, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
