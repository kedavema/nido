import 'package:flutter/widgets.dart';

/// Canonical border radius tokens for Nido matching
/// apps/mobile/src/theme/tokens.ts.
class AppRadii {
  const AppRadii._();

  static const double card = 16.0;
  static const double modal = 28.0;
  static const double button = 14.0;
  static const double chip = 999.0;

  // BorderRadius helpers
  static const BorderRadius cardRadius = BorderRadius.all(
    Radius.circular(card),
  );
  static const BorderRadius modalRadius = BorderRadius.all(
    Radius.circular(modal),
  );
  static const BorderRadius buttonRadius = BorderRadius.all(
    Radius.circular(button),
  );
  static const BorderRadius chipRadius = BorderRadius.all(
    Radius.circular(chip),
  );
}
