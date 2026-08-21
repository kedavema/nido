import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';

/// The month back/forward pill that sits beside a screen title.
///
/// A component rather than a style because it is what forced the header fork
/// in the legacy app: `ScreenHeader` had nowhere to put a trailing control, so
/// every screen with a stepper hand-rolled its own header to hold one.
class MonthStepper extends StatelessWidget {
  const MonthStepper({
    super.key,
    required this.onPrevious,
    required this.onNext,
    this.label,
  });

  /// Omitted where the month is already the screen title, since repeating it
  /// there says nothing.
  final String? label;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadii.chipRadius,
        border: Border.all(color: AppColors.border),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            key: const Key('previous_month_button'),
            onPressed: onPrevious,
            tooltip: 'Mes anterior',
            iconSize: 16,
            visualDensity: VisualDensity.compact,
            constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            color: AppColors.ink,
            icon: const Icon(Icons.chevron_left),
          ),
          if (label case final text?)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                text,
                key: const Key('month_label'),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          IconButton(
            key: const Key('next_month_button'),
            onPressed: onNext,
            tooltip: 'Mes siguiente',
            iconSize: 16,
            visualDensity: VisualDensity.compact,
            constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            color: AppColors.ink,
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
    );
  }
}
