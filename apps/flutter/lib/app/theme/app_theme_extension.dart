import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Theme extension for Nido design tokens that fall outside standard
/// Material 3 ColorScheme.
@immutable
class NidoThemeExtension extends ThemeExtension<NidoThemeExtension> {
  const NidoThemeExtension({
    required this.primaryTint,
    required this.surfaceMuted,
    required this.borderStrong,
    required this.dangerBackground,
    required this.warningBackground,
    required this.successBackground,
    required this.chartMark,
    required this.chartTrack,
    required this.categorySwatches,
  });

  /// Canonical default tokens.
  factory NidoThemeExtension.canonical() {
    return const NidoThemeExtension(
      primaryTint: AppColors.primaryTint,
      surfaceMuted: AppColors.surfaceMuted,
      borderStrong: AppColors.borderStrong,
      dangerBackground: AppColors.dangerBackground,
      warningBackground: AppColors.warningBackground,
      successBackground: AppColors.successBackground,
      chartMark: AppColors.chartMark,
      chartTrack: AppColors.chartTrack,
      categorySwatches: AppColors.categorySwatches,
    );
  }

  final Color primaryTint;
  final Color surfaceMuted;
  final Color borderStrong;
  final Color dangerBackground;
  final Color warningBackground;
  final Color successBackground;
  final Color chartMark;
  final Color chartTrack;
  final List<Color> categorySwatches;

  @override
  NidoThemeExtension copyWith({
    Color? primaryTint,
    Color? surfaceMuted,
    Color? borderStrong,
    Color? dangerBackground,
    Color? warningBackground,
    Color? successBackground,
    Color? chartMark,
    Color? chartTrack,
    List<Color>? categorySwatches,
  }) {
    return NidoThemeExtension(
      primaryTint: primaryTint ?? this.primaryTint,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      borderStrong: borderStrong ?? this.borderStrong,
      dangerBackground: dangerBackground ?? this.dangerBackground,
      warningBackground: warningBackground ?? this.warningBackground,
      successBackground: successBackground ?? this.successBackground,
      chartMark: chartMark ?? this.chartMark,
      chartTrack: chartTrack ?? this.chartTrack,
      categorySwatches: categorySwatches ?? this.categorySwatches,
    );
  }

  @override
  NidoThemeExtension lerp(ThemeExtension<NidoThemeExtension>? other, double t) {
    if (other is! NidoThemeExtension) {
      return this;
    }
    return NidoThemeExtension(
      primaryTint: Color.lerp(primaryTint, other.primaryTint, t) ?? primaryTint,
      surfaceMuted:
          Color.lerp(surfaceMuted, other.surfaceMuted, t) ?? surfaceMuted,
      borderStrong:
          Color.lerp(borderStrong, other.borderStrong, t) ?? borderStrong,
      dangerBackground:
          Color.lerp(dangerBackground, other.dangerBackground, t) ??
          dangerBackground,
      warningBackground:
          Color.lerp(warningBackground, other.warningBackground, t) ??
          warningBackground,
      successBackground:
          Color.lerp(successBackground, other.successBackground, t) ??
          successBackground,
      chartMark: Color.lerp(chartMark, other.chartMark, t) ?? chartMark,
      chartTrack: Color.lerp(chartTrack, other.chartTrack, t) ?? chartTrack,
      categorySwatches: other.categorySwatches,
    );
  }
}
