import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Canonical typography tokens for Nido.
class AppTypography {
  const AppTypography._();

  static const String displayFontFamily = 'Bricolage Grotesque';
  static const String bodyFontFamily = 'IBM Plex Sans';

  // Font sizes matching typographyScale
  static const double heroSize = 28.0;
  static const double screenTitleSize = 20.0;
  static const double cardTitleSize = 17.0;
  static const double bodySize = 15.0;
  static const double secondarySize = 13.0;
  static const double labelSize = 11.0;

  /// Builds the canonical [TextTheme] for Nido.
  static TextTheme createTextTheme() {
    return const TextTheme(
      // Hero / Large Display
      displayLarge: TextStyle(
        fontFamily: displayFontFamily,
        fontSize: heroSize,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
        letterSpacing: -0.5,
        height: 1.2,
      ),
      // Screen Title
      headlineMedium: TextStyle(
        fontFamily: displayFontFamily,
        fontSize: screenTitleSize,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        letterSpacing: -0.2,
        height: 1.25,
      ),
      // Card Title
      titleMedium: TextStyle(
        fontFamily: displayFontFamily,
        fontSize: cardTitleSize,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        letterSpacing: -0.1,
        height: 1.3,
      ),
      // Body regular
      bodyMedium: TextStyle(
        fontFamily: bodyFontFamily,
        fontSize: bodySize,
        fontWeight: FontWeight.w400,
        color: AppColors.ink,
        height: 1.4,
      ),
      // Body semibold / strong
      bodyLarge: TextStyle(
        fontFamily: bodyFontFamily,
        fontSize: bodySize,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.4,
      ),
      // Secondary text
      bodySmall: TextStyle(
        fontFamily: bodyFontFamily,
        fontSize: secondarySize,
        fontWeight: FontWeight.w400,
        color: AppColors.inkSecondary,
        height: 1.35,
      ),
      // Labels / captions
      labelSmall: TextStyle(
        fontFamily: bodyFontFamily,
        fontSize: labelSize,
        fontWeight: FontWeight.w500,
        color: AppColors.inkSecondary,
        letterSpacing: 0.2,
        height: 1.3,
      ),
      // Button text
      labelLarge: TextStyle(
        fontFamily: bodyFontFamily,
        fontSize: bodySize,
        fontWeight: FontWeight.w600,
        color: AppColors.surface,
        letterSpacing: 0.1,
      ),
    );
  }
}
