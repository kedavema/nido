import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_radii.dart';
import 'app_spacing.dart';
import 'app_theme_extension.dart';
import 'app_typography.dart';

/// Central theme configuration for Nido adhering to Material 3 and canonical tokens.
class AppTheme {
  const AppTheme._();

  /// Creates the canonical light [ThemeData].
  static ThemeData createLightTheme() {
    final textTheme = AppTypography.createTextTheme();

    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: AppColors.surface,
      primaryContainer: AppColors.primaryTint,
      onPrimaryContainer: AppColors.primary,
      secondary: AppColors.accent,
      onSecondary: AppColors.surface,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
      onSurfaceVariant: AppColors.inkSecondary,
      outline: AppColors.border,
      outlineVariant: AppColors.borderStrong,
      error: AppColors.danger,
      onError: AppColors.surface,
      errorContainer: AppColors.dangerBackground,
      onErrorContainer: AppColors.danger,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.background,
      textTheme: textTheme,
      extensions: <ThemeExtension<dynamic>>[
        NidoThemeExtension.canonical(),
      ],
      // App Bar
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: AppTypography.displayFontFamily,
          fontSize: AppTypography.screenTitleSize,
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
        ),
      ),
      // Cards
      cardTheme: const CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: AppSpacing.cardMargin,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.cardRadius,
          side: BorderSide(color: AppColors.border),
        ),
      ),
      // Filled Buttons
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.surface,
          minimumSize: const Size(44, 48),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.buttonRadius),
          textStyle: textTheme.labelLarge,
        ),
      ),
      // Outlined Buttons
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.borderStrong),
          minimumSize: const Size(44, 48),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.buttonRadius),
          textStyle: textTheme.labelLarge?.copyWith(color: AppColors.primary),
        ),
      ),
      // Text Buttons
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.base),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.buttonRadius),
          textStyle: textTheme.bodyLarge?.copyWith(color: AppColors.primary),
        ),
      ),
      // Input / Text Fields
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen, vertical: AppSpacing.cardGap),
        border: const OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(color: AppColors.border),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(color: AppColors.primary, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(color: AppColors.danger),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(color: AppColors.danger, width: 1.5),
        ),
        hintStyle: textTheme.bodySmall,
        labelStyle: textTheme.bodyMedium,
      ),
      // Chips
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceMuted,
        selectedColor: AppColors.primaryTint,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.chipRadius),
        side: BorderSide.none,
        labelStyle: textTheme.bodySmall,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.base),
      ),
      // Dividers
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),
    );
  }
}
