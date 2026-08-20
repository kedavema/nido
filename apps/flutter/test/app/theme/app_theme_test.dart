import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/theme/app_colors.dart';
import 'package:nido/app/theme/app_radii.dart';
import 'package:nido/app/theme/app_spacing.dart';
import 'package:nido/app/theme/app_theme.dart';
import 'package:nido/app/theme/app_theme_extension.dart';
import 'package:nido/app/theme/app_typography.dart';

void main() {
  group('AppTheme and Design Tokens', () {
    final theme = AppTheme.createLightTheme();

    test('configures Material 3 with canonical light ColorScheme', () {
      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.light);
      expect(theme.colorScheme.primary, AppColors.primary);
      expect(theme.colorScheme.primary.toARGB32(), 0xFF1C4F47);
      expect(theme.colorScheme.secondary, AppColors.accent);
      expect(theme.colorScheme.secondary.toARGB32(), 0xFFB4632F);
      expect(theme.colorScheme.surface, AppColors.surface);
      expect(theme.colorScheme.surface.toARGB32(), 0xFFFFFFFF);
      expect(theme.colorScheme.error, AppColors.danger);
      expect(theme.colorScheme.error.toARGB32(), 0xFFB3372E);
      expect(theme.scaffoldBackgroundColor, AppColors.background);
      expect(theme.scaffoldBackgroundColor.toARGB32(), 0xFFF6F4EF);
    });

    test('configures typography scale and font families correctly', () {
      expect(AppTypography.displayFontFamily, 'Bricolage Grotesque');
      expect(AppTypography.bodyFontFamily, 'IBM Plex Sans');
      expect(AppTypography.heroSize, 28.0);
      expect(AppTypography.screenTitleSize, 20.0);
      expect(AppTypography.cardTitleSize, 17.0);
      expect(AppTypography.bodySize, 15.0);
      expect(AppTypography.secondarySize, 13.0);
      expect(AppTypography.labelSize, 11.0);

      expect(theme.textTheme.displayLarge?.fontFamily, 'Bricolage Grotesque');
      expect(theme.textTheme.bodyMedium?.fontFamily, 'IBM Plex Sans');
    });

    test(
      'provides NidoThemeExtension with category swatches and chart marks',
      () {
        final ext = theme.extension<NidoThemeExtension>();
        expect(ext, isNotNull);
        expect(ext!.primaryTint, AppColors.primaryTint);
        expect(ext.chartMark, AppColors.chartMark);
        expect(ext.chartTrack, AppColors.chartTrack);
        expect(ext.categorySwatches.length, 9);
        expect(ext.categorySwatches.first.toARGB32(), 0xFF3E5C76);
      },
    );

    test('verifies canonical spacing and radii constants', () {
      expect(AppSpacing.base, 4.0);
      expect(AppSpacing.cardGap, 12.0);
      expect(AppSpacing.screen, 16.0);
      expect(AppSpacing.cardPadding, 16.0);
      expect(AppSpacing.lg, 20.0);
      expect(AppSpacing.xl, 24.0);
      expect(AppSpacing.xxl, 32.0);

      expect(AppRadii.card, 16.0);
      expect(AppRadii.modal, 28.0);
      expect(AppRadii.button, 14.0);
      expect(AppRadii.chip, 999.0);
    });
  });
}
