import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';
import 'pressable_scale.dart';

/// The control that opens the filter sheet (`FiltersButton` in
/// `apps/mobile/src/components/movement-filters-sheet.tsx`).
///
/// Not a chip: it opens something rather than being one of the choices, so it
/// stands at the full touch target with body-size text while the chips beside
/// it sit smaller. It tints only once a filter is actually applied — that tint
/// and the count are the two ways the row admits the list is narrowed.
class FiltersButton extends StatelessWidget {
  const FiltersButton({
    super.key,
    required this.count,
    required this.onPressed,
  });

  final int count;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = count > 0;
    final foreground = active ? AppColors.primary : AppColors.inkSecondary;

    return PressableScale(
      semanticLabel: active ? 'Filtros, $count activos' : 'Filtros',
      selected: active,
      onPressed: onPressed,
      child: Container(
        // See `NidoChip`: an alignment here would stretch the button across
        // the whole filter row.
        constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryTint : AppColors.surface,
          borderRadius: AppRadii.chipRadius,
          border: Border.all(
            color: active ? AppColors.primary : AppColors.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.tune, size: 16, color: foreground),
            const SizedBox(width: 6),
            Text(
              active ? 'Filtros · $count' : 'Filtros',
              style: theme.textTheme.bodyLarge?.copyWith(color: foreground),
            ),
          ],
        ),
      ),
    );
  }
}
