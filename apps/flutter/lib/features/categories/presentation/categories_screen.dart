import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_radii.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/active_household.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/contracts/patch.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_screen.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/form_fields.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
import '../../../core/widgets/nido_card.dart';
import '../../../core/widgets/nido_chip.dart';
import '../../../core/widgets/screen_header.dart';
import '../application/categories_providers.dart';
import '../domain/category_appearance.dart';
import '../domain/category_tree.dart';

/// MAS-03's caption. The seeded roots exist so budget and report comparisons
/// hold across households; roots are creatable and editable, so this explains
/// the tradeoff rather than asserting a restriction the screen does not
/// enforce.
const String _rootRuleNotice =
    'Las categorías raíz que vienen por defecto mantienen comparables '
    'presupuesto e informes. Podés agregar las tuyas, pero solo vos las vas a '
    'ver en tus reportes.';

/// Both defaults must be offerable by the pickers, or a new category would
/// open with an off-palette value sitting in front of the curated set as if it
/// were one of them.
const String _newRootDefaultIcon = 'pricetag';
const String _newRootDefaultColor = '#6559C3';

/// Full CRUD over the household's categories and subcategories.
class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});

  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

/// What the screen is editing, if anything. The editors take over the whole
/// body instead of appearing as a card above the list: it is the only way
/// their save action can ride above the keyboard rather than sit under it.
sealed class _Editing {
  const _Editing();
}

class _EditingExisting extends _Editing {
  const _EditingExisting(this.category);
  final Category category;
}

class _CreatingRoot extends _Editing {
  const _CreatingRoot(this.kind);
  final CategoryKind kind;
}

class _CreatingChild extends _Editing {
  const _CreatingChild(this.root);
  final Category root;
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  final Set<String> _expandedRoots = {};
  _Editing? _editing;

  @override
  Widget build(BuildContext context) {
    final householdId = ref.watch(activeHouseholdIdProvider);
    if (householdId == null) {
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }

    final editing = _editing;
    if (editing != null) {
      return _CategoryEditor(
        key: const Key('category_editor'),
        householdId: householdId,
        editing: editing,
        onDone: () => setState(() => _editing = null),
      );
    }

    final categories = ref.watch(categoriesProvider(householdId));

    final header = FormHeader(
      title: 'Categorías',
      subtitle: 'Categorías y subcategorías del hogar',
      onDismiss: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(AppRoutes.root);
        }
      },
      dismissIcon: FormDismissIcon.back,
    );

    Future<void> refresh() async {
      ref.invalidate(categoriesProvider(householdId));
      await ref.read(categoriesProvider(householdId).future);
    }

    return switch (categories) {
      AsyncData(value: final list) => AppScreen(
        key: const Key('categories_screen'),
        header: header,
        onRefresh: refresh,
        children: [
          for (final kind in CategoryKind.values)
            _KindSection(
              kind: kind,
              categories: list.where((c) => c.kind == kind).toList(),
              expandedRoots: _expandedRoots,
              onToggleRoot:
                  (rootId) => setState(() {
                    if (!_expandedRoots.remove(rootId)) {
                      _expandedRoots.add(rootId);
                    }
                  }),
              onEdit:
                  (category) =>
                      setState(() => _editing = _EditingExisting(category)),
              onCreateRoot:
                  () => setState(() => _editing = _CreatingRoot(kind)),
              onCreateChild:
                  (root) => setState(() => _editing = _CreatingChild(root)),
            ),
          const InlineNotice(
            message: _rootRuleNotice,
            tone: NoticeTone.success,
          ),
        ],
      ),
      AsyncError(error: final error) => AppScreen(
        key: const Key('categories_screen'),
        header: header,
        children: [
          InlineNotice(
            message: messageForActionError(error),
            tone: NoticeTone.error,
          ),
          ActionButton(
            key: const Key('retry_button'),
            label: 'Reintentar',
            variant: ActionButtonVariant.secondary,
            onPressed: () => ref.invalidate(categoriesProvider(householdId)),
          ),
        ],
      ),
      _ => AppScreen(
        key: const Key('categories_screen'),
        header: header,
        children: const [LoadingContent(label: 'Cargando categorías…')],
      ),
    };
  }
}

class _KindSection extends StatelessWidget {
  const _KindSection({
    required this.kind,
    required this.categories,
    required this.expandedRoots,
    required this.onToggleRoot,
    required this.onEdit,
    required this.onCreateRoot,
    required this.onCreateChild,
  });

  final CategoryKind kind;
  final List<Category> categories;
  final Set<String> expandedRoots;
  final void Function(String rootId) onToggleRoot;
  final void Function(Category category) onEdit;
  final VoidCallback onCreateRoot;
  final void Function(Category root) onCreateChild;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final groups = categoryGroups(categories);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          kind == CategoryKind.expense ? 'Egresos' : 'Ingresos',
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: AppSpacing.sm),
        NidoCard(
          gap: 0,
          children: [
            for (final group in groups)
              _RootAccordion(
                group: group,
                isExpanded: expandedRoots.contains(group.root.id),
                onToggle: () => onToggleRoot(group.root.id),
                onEditRoot: () => onEdit(group.root),
                onEditChild: onEdit,
                onAddChild: () => onCreateChild(group.root),
              ),
            // Rendered even with zero roots of this kind: it carries the only
            // affordance that can create the first one.
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: Key('new_root_button_${kind.wire}'),
                  onPressed: onCreateRoot,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Nueva categoría'),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _RootAccordion extends StatelessWidget {
  const _RootAccordion({
    required this.group,
    required this.isExpanded,
    required this.onToggle,
    required this.onEditRoot,
    required this.onEditChild,
    required this.onAddChild,
  });

  final CategoryGroup group;
  final bool isExpanded;
  final VoidCallback onToggle;
  final VoidCallback onEditRoot;
  final void Function(Category child) onEditChild;
  final VoidCallback onAddChild;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final root = group.root;
    final color = categoryColor(root.color);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          key: Key('category_root_${root.id}'),
          onTap: onToggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: categoryTint(color),
                  child: Icon(
                    resolveCategoryIcon(root.icon),
                    color: color,
                    size: 20,
                  ),
                ),
                const SizedBox(width: AppSpacing.cardGap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        root.isActive ? root.name : '${root.name} · Archivada',
                        style: theme.textTheme.bodyMedium,
                      ),
                      Text(
                        group.children.length == 1
                            ? '1 subcategoría'
                            : '${group.children.length} subcategorías',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                Icon(
                  isExpanded ? Icons.expand_more : Icons.chevron_right,
                  color: AppColors.inkSecondary,
                ),
              ],
            ),
          ),
        ),
        if (isExpanded) ...[
          // Editing the root lives inside the expanded body rather than on the
          // row: the row is one big tap target that toggles, so a nested
          // button there would fight it for taps.
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: Key('edit_root_${root.id}'),
              onPressed: onEditRoot,
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('Editar categoría'),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(
              left: 52,
              bottom: AppSpacing.cardGap,
            ),
            child: ChipRow(
              children: [
                for (final child in group.children)
                  SoftChip(
                    key: Key('category_child_${child.id}'),
                    label:
                        child.isActive
                            ? child.name
                            : '${child.name} · Archivada',
                    selected: false,
                    onPressed: () => onEditChild(child),
                  ),
                _DashedChip(
                  key: Key('add_child_${root.id}'),
                  label: '+ Nueva',
                  onPressed: onAddChild,
                ),
              ],
            ),
          ),
        ],
        const Divider(height: 1, color: AppColors.border),
      ],
    );
  }
}

/// The "add one more" affordance inside a chip row: dashed so it reads as an
/// action rather than one more option to choose from.
class _DashedChip extends StatelessWidget {
  const _DashedChip({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: onPressed,
      borderRadius: AppRadii.chipRadius,
      child: Container(
        constraints: const BoxConstraints(minHeight: 36),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          borderRadius: AppRadii.chipRadius,
          border: Border.all(color: AppColors.primary),
        ),
        child: Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

/// The create/edit form for a category, a subcategory, or a new root.
class _CategoryEditor extends ConsumerStatefulWidget {
  const _CategoryEditor({
    super.key,
    required this.householdId,
    required this.editing,
    required this.onDone,
  });

  final String householdId;
  final _Editing editing;
  final VoidCallback onDone;

  @override
  ConsumerState<_CategoryEditor> createState() => _CategoryEditorState();
}

class _CategoryEditorState extends ConsumerState<_CategoryEditor> {
  late final TextEditingController _name;
  late String _icon;
  late String _color;
  late String? _parentId;
  late bool _isActive;
  bool _saving = false;
  String? _error;

  /// A subcategory renders neither icon nor colour — its chip is name-only —
  /// and inherits both from its root at creation. Offering them would let the
  /// two representations drift apart with nothing to show for it.
  bool get _isRootForm => switch (widget.editing) {
    _EditingExisting(:final category) => category.isRoot,
    _CreatingRoot() => true,
    _CreatingChild() => false,
  };

  bool get _isCreate => widget.editing is! _EditingExisting;

  CategoryKind get _kind => switch (widget.editing) {
    _EditingExisting(:final category) => category.kind,
    _CreatingRoot(:final kind) => kind,
    _CreatingChild(:final root) => root.kind,
  };

  @override
  void initState() {
    super.initState();
    switch (widget.editing) {
      case _EditingExisting(:final category):
        _name = TextEditingController(text: category.name);
        _icon = category.icon;
        _color = category.color;
        // A root keeps `null`. Coercing it to its own id — as the legacy code
        // did to give the parent picker a non-null selection — makes the
        // category its own parent: the API rejects the save, and the picker
        // can demote a childless root into a subcategory.
        _parentId = category.parentId;
        _isActive = category.isActive;
      case _CreatingRoot():
        _name = TextEditingController();
        _icon = _newRootDefaultIcon;
        _color = _newRootDefaultColor;
        _parentId = null;
        _isActive = true;
      case _CreatingChild(:final root):
        _name = TextEditingController();
        // Inherited, not chosen: subcategories carry their root's appearance.
        _icon = root.icon;
        _color = root.color;
        _parentId = root.id;
        _isActive = true;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  String get _title => switch (widget.editing) {
    _EditingExisting(:final category) =>
      category.isRoot ? 'Editar categoría' : 'Editar subcategoría',
    _CreatingRoot() => 'Nueva categoría',
    _CreatingChild() => 'Nueva subcategoría',
  };

  String? get _subtitle => switch (widget.editing) {
    _CreatingRoot(:final kind) =>
      kind == CategoryKind.expense ? 'Egresos' : 'Ingresos',
    _CreatingChild(:final root) => 'Dentro de ${root.name}',
    _ => null,
  };

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final controller = ref.read(categoriesControllerProvider);
    try {
      switch (widget.editing) {
        case _EditingExisting(:final category):
          await controller.update(
            widget.householdId,
            category.id,
            UpdateCategoryRequest(
              name: _name.text,
              icon: _icon,
              color: _color,
              parentId: Patch.of(_parentId),
              isActive: _isActive,
            ),
          );
        case _CreatingRoot(:final kind):
          await controller.create(
            widget.householdId,
            CreateCategoryRequest(
              kind: kind,
              name: _name.text,
              icon: _icon,
              color: _color,
              sortOrder: nextRootSortOrder(
                ref.read(categoriesProvider(widget.householdId)).valueOrNull ??
                    const [],
                kind,
              ),
            ),
          );
        case _CreatingChild(:final root):
          await controller.create(
            widget.householdId,
            CreateCategoryRequest(
              kind: root.kind,
              name: _name.text,
              icon: root.icon,
              color: root.color,
              parentId: root.id,
            ),
          );
      }
      if (mounted) {
        widget.onDone();
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

  Future<void> _archive(Category category) async {
    final archived = await showDestructiveConfirmDialog(
      context: context,
      title: '¿Archivar ${category.name}?',
      message:
          'Deja de ofrecerse al cargar un movimiento. El historial ya cargado '
          'con esta categoría queda intacto y sigue contando en los totales '
          'del mes.',
      confirmLabel: 'Archivar',
      onConfirm:
          () => ref
              .read(categoriesControllerProvider)
              .archive(widget.householdId, category.id),
    );
    if (archived && mounted) {
      widget.onDone();
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.editing;
    final roots = (ref
                .watch(categoriesProvider(widget.householdId))
                .valueOrNull ??
            const <Category>[])
        .where((category) => category.isRoot && category.kind == _kind)
        .toList(growable: false);

    return AppFormScreen(
      header: FormHeader(
        title: _title,
        subtitle: _subtitle,
        onDismiss: widget.onDone,
      ),
      footer: ActionButton(
        key: const Key('save_category_button'),
        label: 'Guardar',
        loading: _saving,
        // Icon and colour come from pickers, so they are valid by
        // construction and only the name can be empty.
        onPressed: _name.text.trim().isEmpty || _saving ? null : _save,
      ),
      children: [
        NidoFormField(
          label: 'Nombre',
          child: NidoTextField(
            key: const Key('category_name_field'),
            controller: _name,
            autofocus: _isCreate,
            maxLength: 100,
            onChanged: (_) => setState(() {}),
          ),
        ),
        if (_isRootForm) ...[
          _IconPicker(
            selected: _icon,
            color: categoryColor(_color),
            onSelect: (icon) => setState(() => _icon = icon),
          ),
          _ColorPicker(
            selected: _color,
            icon: _icon,
            onSelect: (color) => setState(() => _color = color),
          ),
        ],
        // A root has no parent to reassign, and offering itself as an option
        // would let the user create a cycle.
        if (editing is _EditingExisting && !editing.category.isRoot)
          _ChoiceRow<String>(
            label: 'Raíz',
            options: [for (final root in roots) (root.id, root.name)],
            selected: _parentId,
            onSelect: (parentId) {
              // Reassigning adopts the new root's appearance, keeping the
              // inheritance true after the move rather than leaving the old
              // root's icon and colour on a child that left it.
              final next = roots.where((r) => r.id == parentId).firstOrNull;
              setState(() {
                _parentId = parentId;
                _icon = next?.icon ?? _icon;
                _color = next?.color ?? _color;
              });
            },
          ),
        if (editing is _EditingExisting)
          _ChoiceRow<bool>(
            label: 'Estado',
            options: const [(true, 'Activa'), (false, 'Archivada')],
            selected: _isActive,
            onSelect: (isActive) => setState(() => _isActive = isActive),
          ),
        if (_error case final message?)
          InlineNotice(message: message, tone: NoticeTone.error),
        if (editing is _EditingExisting && editing.category.isActive)
          ActionButton(
            key: const Key('archive_category_button'),
            label: 'Archivar',
            variant: ActionButtonVariant.danger,
            onPressed: _saving ? null : () => _archive(editing.category),
          ),
      ],
    );
  }
}

class _IconPicker extends StatelessWidget {
  const _IconPicker({
    required this.selected,
    required this.color,
    required this.onSelect,
  });

  final String selected;
  final Color color;
  final void Function(String icon) onSelect;

  @override
  Widget build(BuildContext context) {
    final options = optionsWithCurrent(categoryIconOptions, selected);

    return NidoFormField(
      label: 'Ícono',
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final icon in options)
            InkWell(
              key: Key('category_icon_$icon'),
              onTap: () => onSelect(icon),
              borderRadius: AppRadii.buttonRadius,
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color:
                      icon == selected
                          ? categoryTint(color)
                          : AppColors.surface,
                  borderRadius: AppRadii.buttonRadius,
                  border: Border.all(
                    color: icon == selected ? color : AppColors.borderStrong,
                    width: icon == selected ? 2 : 1,
                  ),
                ),
                child: Icon(resolveCategoryIcon(icon), color: color),
              ),
            ),
        ],
      ),
    );
  }
}

class _ColorPicker extends StatelessWidget {
  const _ColorPicker({
    required this.selected,
    required this.icon,
    required this.onSelect,
  });

  final String selected;
  final String icon;
  final void Function(String color) onSelect;

  @override
  Widget build(BuildContext context) {
    final options = optionsWithCurrent(categoryColorOptions, selected);

    return NidoFormField(
      label: 'Color',
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final hex in options)
            InkWell(
              key: Key('category_color_$hex'),
              onTap: () => onSelect(hex),
              borderRadius: AppRadii.buttonRadius,
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: categoryTint(categoryColor(hex)),
                  borderRadius: AppRadii.buttonRadius,
                  border: Border.all(
                    color:
                        hex.toUpperCase() == selected.toUpperCase()
                            ? categoryColor(hex)
                            : AppColors.borderStrong,
                    width: hex.toUpperCase() == selected.toUpperCase() ? 2 : 1,
                  ),
                ),
                child: Icon(
                  resolveCategoryIcon(icon),
                  color: categoryColor(hex),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ChoiceRow<T> extends StatelessWidget {
  const _ChoiceRow({
    required this.label,
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final String label;
  final List<(T, String)> options;
  final T? selected;
  final void Function(T value) onSelect;

  @override
  Widget build(BuildContext context) {
    return NidoFormField(
      label: label,
      child: ChipRow(
        children: [
          for (final (value, text) in options)
            NidoChip(
              key: Key('choice_${label}_$value'),
              label: text,
              selected: selected == value,
              onPressed: () => onSelect(value),
            ),
        ],
      ),
    );
  }
}
