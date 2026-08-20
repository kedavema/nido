import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';

/// Visual tone of an [InlineNotice].
enum NoticeTone { info, success, error, warning }

/// Small tinted box for inline feedback (the Flutter port of the legacy
/// `InlineNotice`): loading/error/empty states render through this instead
/// of raw backend strings.
class InlineNotice extends StatelessWidget {
  const InlineNotice({
    super.key,
    required this.message,
    this.tone = NoticeTone.info,
  });

  final String message;
  final NoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      NoticeTone.info => (AppColors.primaryTint, AppColors.primary),
      NoticeTone.success => (AppColors.successBackground, AppColors.success),
      NoticeTone.error => (AppColors.dangerBackground, AppColors.danger),
      NoticeTone.warning => (AppColors.warningBackground, AppColors.warning),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.cardGap),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadii.buttonRadius,
      ),
      child: Text(
        message,
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: foreground),
      ),
    );
  }
}
