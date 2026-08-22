import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';

/// Whether something has reached the server yet.
enum SyncStatusTone { synced, pending, error }

/// The one amber/green/red pill that answers "did this reach the server".
///
/// A single visual language on purpose: the save confirmation and (from M4)
/// each queued row say the same thing the same way, so a colour learned in one
/// place still means the same thing in the other.
class SyncStatusPill extends StatelessWidget {
  const SyncStatusPill({super.key, required this.tone, this.label});

  final SyncStatusTone tone;

  /// Overrides the default copy for a call site that needs to interpolate.
  final String? label;

  static const Map<SyncStatusTone, String> _copy = {
    SyncStatusTone.synced: '✓ Sincronizado',
    SyncStatusTone.pending: '⟳ Pendiente de sincronizar',
    SyncStatusTone.error: '⚠ No se pudo sincronizar · tocá para reintentar',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (background, foreground) = switch (tone) {
      SyncStatusTone.synced => (AppColors.successBackground, AppColors.success),
      SyncStatusTone.pending => (
        AppColors.warningBackground,
        AppColors.warning,
      ),
      SyncStatusTone.error => (AppColors.dangerBackground, AppColors.danger),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadii.chipRadius,
      ),
      child: Text(
        label ?? _copy[tone]!,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodySmall?.copyWith(
          color: foreground,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
