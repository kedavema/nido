import 'package:flutter/widgets.dart';

/// The single elevation Nido uses, from `themeTokens.shadow.card`
/// (`0 1px 2px rgba(28, 63, 54, 0.05)`).
///
/// One shadow, not a Material elevation ramp: every raised surface in the
/// product — cards, the floating action, the confirmation receipt — sits at
/// the same height, and letting Material pick its own tinted elevations was
/// part of why the ported screens read as a different app.
class AppShadows {
  const AppShadows._();

  static const Color _cardShadowColor = Color(0x0D1C3F36); // 5% of #1C3F36

  static const List<BoxShadow> card = <BoxShadow>[
    BoxShadow(color: _cardShadowColor, offset: Offset(0, 1), blurRadius: 2),
  ];
}
