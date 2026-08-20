import 'package:flutter/widgets.dart';

/// Canonical spacing tokens for Nido matching apps/mobile/src/theme/tokens.ts.
class AppSpacing {
  const AppSpacing._();

  static const double base = 4.0;
  static const double sm = 8.0;
  static const double cardGap = 12.0;
  static const double screen = 16.0;
  static const double cardPadding = 16.0;
  static const double lg = 20.0;
  static const double xl = 24.0;
  static const double xxl = 32.0;

  // Common EdgeInsets
  static const EdgeInsets screenPadding = EdgeInsets.all(screen);
  static const EdgeInsets cardInsets = EdgeInsets.all(cardPadding);
  static const EdgeInsets cardMargin = EdgeInsets.only(bottom: cardGap);
}
