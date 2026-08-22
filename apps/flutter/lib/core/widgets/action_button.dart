import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';
import 'pressable_scale.dart';

/// The three roles a call to action can have.
enum ActionButtonVariant {
  /// The one thing this screen is for.
  primary,

  /// An alternative that does not commit anything.
  secondary,

  /// Something destructive. Tinted, not solid — a red slab reads as the
  /// default action and this never is.
  danger,
}

/// Nido's call to action, ported from `ActionButton` in `m1-ui.tsx`.
///
/// Deliberately not `FilledButton`/`OutlinedButton`: Material's own shape,
/// elevation, ripple and disabled tinting fight the token set, and the loading
/// state has to keep the button's exact size so the layout does not jump when
/// a save starts.
class ActionButton extends StatelessWidget {
  const ActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = ActionButtonVariant.primary,
    this.loading = false,
    this.icon,
  });

  final String label;

  /// `null` disables the button. A loading button is also non-interactive.
  final VoidCallback? onPressed;
  final ActionButtonVariant variant;
  final bool loading;

  /// Optional glyph before the label, for a CTA whose provider or action has
  /// a recognisable mark (the Google sign-in).
  final IconData? icon;

  bool get _blocked => onPressed == null || loading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final (background, border, foreground) = switch (variant) {
      ActionButtonVariant.primary => (
        AppColors.primary,
        AppColors.primary,
        AppColors.surface,
      ),
      ActionButtonVariant.secondary => (
        AppColors.surface,
        AppColors.borderStrong,
        AppColors.primary,
      ),
      ActionButtonVariant.danger => (
        AppColors.dangerBackground,
        AppColors.danger,
        AppColors.danger,
      ),
    };

    return Opacity(
      // The legacy blocked state is a flat opacity drop, not a grey repaint:
      // a disabled primary button stays recognisably the primary button.
      opacity: _blocked ? 0.55 : 1,
      child: PressableScale(
        semanticLabel: label,
        busy: loading,
        onPressed: _blocked ? null : onPressed,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.cardPadding,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            color: background,
            borderRadius: AppRadii.buttonRadius,
            border: Border.all(color: border),
          ),
          child:
              loading
                  ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: foreground,
                    ),
                  )
                  : Row(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 18, color: foreground),
                        const SizedBox(width: AppSpacing.sm),
                      ],
                      Flexible(
                        child: Text(
                          label,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: foreground,
                          ),
                        ),
                      ),
                    ],
                  ),
        ),
      ),
    );
  }
}

/// The pill-shaped floating action, for "+ Nuevo gasto".
class ActionPill extends StatelessWidget {
  const ActionPill({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PressableScale(
      semanticLabel: label,
      onPressed: onPressed,
      child: Container(
        constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.cardGap,
        ),
        decoration: const BoxDecoration(
          color: AppColors.primary,
          borderRadius: AppRadii.chipRadius,
          boxShadow: [
            BoxShadow(
              color: Color(0x261C3F36),
              offset: Offset(0, 4),
              blurRadius: 12,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 18, color: AppColors.surface),
              const SizedBox(width: AppSpacing.sm),
            ],
            Text(
              label,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.surface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
