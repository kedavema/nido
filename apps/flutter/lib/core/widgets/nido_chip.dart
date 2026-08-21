import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';
import 'pressable_scale.dart';

/// The solid single-select chip used for categories, kinds and payment
/// sources (`Chip` in `expense-form-fields.tsx`).
///
/// Not Material's `ChoiceChip`: that one is a low-contrast tint on both states,
/// and these rows need the selected chip to read as chosen at a glance, from
/// across a form, on a phone held at arm's length.
class NidoChip extends StatelessWidget {
  const NidoChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PressableScale(
      semanticLabel: label,
      selected: selected,
      onPressed: onPressed,
      child: Container(
        constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : AppColors.surface,
          borderRadius: AppRadii.chipRadius,
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.borderStrong,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 16,
                color: selected ? AppColors.surface : AppColors.ink,
              ),
              const SizedBox(width: 6),
            ],
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 160),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.surface : AppColors.ink,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The lighter outlined chip, for groups where the selection is a filter
/// rather than a commitment.
class SoftChip extends StatelessWidget {
  const SoftChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
    this.onRemove,
    this.removeKey,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  /// Renders a trailing `×`. A visible filter that cannot be undone from
  /// where it is shown is a trap.
  final VoidCallback? onRemove;

  /// Key for that `×`, so a caller can address it directly.
  final Key? removeKey;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PressableScale(
      semanticLabel: label,
      selected: selected,
      onPressed: onPressed,
      child: Container(
        constraints: const BoxConstraints(minHeight: 36),
        padding: EdgeInsets.only(left: 14, right: onRemove == null ? 14 : 6),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryTint : AppColors.surface,
          borderRadius: AppRadii.chipRadius,
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.borderStrong,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.primary : AppColors.ink,
                ),
              ),
            ),
            if (onRemove case final remove?)
              IconButton(
                key: removeKey,
                onPressed: remove,
                icon: const Icon(Icons.close),
                iconSize: 16,
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
                color: selected ? AppColors.primary : AppColors.inkSecondary,
                tooltip: 'Quitar $label',
              ),
          ],
        ),
      ),
    );
  }
}

/// The wrapping row every chip group sits in.
class ChipRow extends StatelessWidget {
  const ChipRow({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: children,
    );
  }
}
