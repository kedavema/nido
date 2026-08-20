import 'package:flutter/material.dart';

/// Canonical color tokens for Nido matching apps/mobile/src/theme/tokens.ts.
class AppColors {
  const AppColors._();

  // Core brand colors
  static const Color primary = Color(0xFF1C4F47);
  static const Color primaryTint = Color(0xFFE3EEE9);
  static const Color accent = Color(0xFFB4632F);
  static const Color background = Color(0xFFF6F4EF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFEDEAE2);

  // Borders
  static const Color border = Color(0xFFEAE7DF);
  static const Color borderStrong = Color(0xFFD8D4C9);

  // Text & Ink
  static const Color ink = Color(0xFF26302C);
  static const Color inkSecondary = Color(0xFF5C6862);
  static const Color tabInactive = Color(0xFF6B756F);

  // Semantic: Danger
  static const Color danger = Color(0xFFB3372E);
  static const Color dangerBackground = Color(0xFFFAE7E4);

  // Semantic: Warning
  static const Color warning = Color(0xFF8A5A00);
  static const Color warningBackground = Color(0xFFFBF0DC);

  // Semantic: Success
  static const Color success = Color(0xFF2F7D4E);
  static const Color successBackground = Color(0xFFE4F1E8);

  // Chart marks
  static const Color chartMark = Color(0xFF1C4F47);
  static const Color chartTrack = Color(0xFFEDEAE2);

  // Category swatches with proven WCAG contrast against their 15% tint
  static const List<Color> categorySwatches = [
    Color(0xFF3E5C76),
    Color(0xFF3E6B34),
    Color(0xFF7A4B6E),
    Color(0xFFA04848),
    Color(0xFF5C6862),
    Color(0xFF6559C3),
    Color(0xFF886108),
    Color(0xFF99469F),
    Color(0xFF026AB6),
  ];
}
