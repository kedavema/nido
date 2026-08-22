import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';

/// Visual tone of an [InlineNotice].
enum NoticeTone { info, success, error, warning }

/// Small tinted box for inline feedback (the Flutter port of the legacy
/// `InlineNotice`): loading/error/empty states render through this instead of
/// raw backend strings.
///
/// It is a live region, so a screen reader announces a failure that appears
/// after an action without the user having to go looking for it.
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

    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: background,
          borderRadius: AppRadii.buttonRadius,
        ),
        child: Text(
          message,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: foreground,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
