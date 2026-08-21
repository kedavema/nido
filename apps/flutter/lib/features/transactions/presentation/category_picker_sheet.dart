import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_bottom_sheet.dart';
import '../../../core/widgets/form_fields.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../categories/domain/category_appearance.dart';
import '../../categories/domain/category_tree.dart';

/// Picks the category a movement is filed under.
///
/// [onCreateSubcategory] lets someone add the subcategory they were looking
/// for without abandoning a half-filled form; it returns the created category
/// so the sheet can select it immediately.
Future<Category?> showCategoryPickerSheet({
  required BuildContext context,
  required List<Category> categories,
  required String? selectedCategoryId,
  required String subtitle,
  required Future<Category> Function(Category root, String name)
  onCreateSubcategory,
}) {
  return showAppBottomSheet<Category>(
    context: context,
    title: 'Categoría',
    subtitle: subtitle,
    sheetKey: const Key('category_picker_sheet'),
    builder:
        (context, controller) => _CategoryPickerBody(
          scrollController: controller,
          categories: categories,
          selectedCategoryId: selectedCategoryId,
          onCreateSubcategory: onCreateSubcategory,
        ),
  );
}

class _CategoryPickerBody extends StatefulWidget {
  const _CategoryPickerBody({
    required this.scrollController,
    required this.categories,
    required this.selectedCategoryId,
    required this.onCreateSubcategory,
  });

  final ScrollController scrollController;
  final List<Category> categories;
  final String? selectedCategoryId;
  final Future<Category> Function(Category root, String name)
  onCreateSubcategory;

  @override
  State<_CategoryPickerBody> createState() => _CategoryPickerBodyState();
}

class _CategoryPickerBodyState extends State<_CategoryPickerBody> {
  final TextEditingController _search = TextEditingController();
  final TextEditingController _newChild = TextEditingController();
  Category? _creatingUnder;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    _newChild.dispose();
    super.dispose();
  }

  Future<void> _createChild(Category root) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final created = await widget.onCreateSubcategory(root, _newChild.text);
      if (mounted) {
        Navigator.of(context).pop(created);
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = messageForActionError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = filterCategoryGroups(widget.categories, _search.text);

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
      children: [
        NidoTextField(
          key: const Key('category_search_field'),
          controller: _search,
          hintText: 'Buscar categoría…',
          onChanged: (_) => setState(() {}),
        ),
        if (_error case final message?) ...[
          const SizedBox(height: AppSpacing.cardGap),
          InlineNotice(message: message, tone: NoticeTone.error),
        ],
        const SizedBox(height: AppSpacing.sm),
        if (groups.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.cardGap),
            child: InlineNotice(
              message:
                  'Ninguna categoría coincide. Probá con otra palabra o creá '
                  'una desde Categorías.',
            ),
          ),
        for (final group in groups) ...[
          _CategoryOption(
            category: group.root,
            isSelected: widget.selectedCategoryId == group.root.id,
            onTap: () => Navigator.of(context).pop(group.root),
          ),
          for (final child in group.children)
            Padding(
              padding: const EdgeInsets.only(left: AppSpacing.xl),
              child: _CategoryOption(
                category: child,
                isSelected: widget.selectedCategoryId == child.id,
                onTap: () => Navigator.of(context).pop(child),
              ),
            ),
          if (_creatingUnder?.id == group.root.id)
            Padding(
              padding: const EdgeInsets.only(
                left: AppSpacing.xl,
                bottom: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: NidoTextField(
                      key: const Key('new_subcategory_field'),
                      controller: _newChild,
                      autofocus: true,
                      maxLength: 100,
                      hintText: 'Nombre de la subcategoría',
                      onChanged: (_) => setState(() {}),
                      onSubmitted:
                          (_) =>
                              _newChild.text.trim().isEmpty || _saving
                                  ? null
                                  : _createChild(group.root),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ActionButton(
                    key: const Key('save_subcategory_button'),
                    label: 'Crear',
                    loading: _saving,
                    onPressed:
                        _newChild.text.trim().isEmpty || _saving
                            ? null
                            : () => _createChild(group.root),
                  ),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.only(left: AppSpacing.xl),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: Key('add_subcategory_${group.root.id}'),
                  onPressed:
                      () => setState(() {
                        _creatingUnder = group.root;
                        _newChild.clear();
                        _error = null;
                      }),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Nueva subcategoría'),
                ),
              ),
            ),
        ],
        const SizedBox(height: AppSpacing.screen),
      ],
    );
  }
}

class _CategoryOption extends StatelessWidget {
  const _CategoryOption({
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
      key: Key('pick_category_${category.id}'),
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
              child: Text(category.name, style: theme.textTheme.bodyMedium),
            ),
            if (isSelected)
              const Icon(Icons.check, size: 18, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
