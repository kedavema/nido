import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';

/// How a category is drawn, ported from
/// `apps/mobile/src/utils/category-appearance.ts`.
///
/// `CategoryIconSchema` accepts any string and existing rows were filled by a
/// free-text field, so a stored icon is untrusted input: it is resolved
/// through [resolveCategoryIcon] rather than looked up blindly. The legacy
/// app stored Ionicons names, which is why the keys here are Ionicons names
/// even though the glyphs are Material — renaming them would orphan every
/// category the Expo app created.
const Map<String, IconData> categoryIconGlyphs = <String, IconData>{
  // The twelve the seed uses lead the list, so every seeded category stays
  // representable in the picker grid.
  'home': Icons.home_outlined,
  'restaurant': Icons.restaurant_outlined,
  'car': Icons.directions_car_outlined,
  'medical': Icons.medical_services_outlined,
  'flash': Icons.bolt_outlined,
  'game-controller': Icons.sports_esports_outlined,
  'briefcase': Icons.work_outline,
  'laptop': Icons.laptop_outlined,
  'return-down-back': Icons.keyboard_return_outlined,
  'pricetag': Icons.sell_outlined,
  'add-circle': Icons.add_circle_outline,
  'ellipsis-horizontal': Icons.more_horiz,
  // The rest cover what households actually add.
  'cart': Icons.shopping_cart_outlined,
  'shirt': Icons.checkroom_outlined,
  'school': Icons.school_outlined,
  'paw': Icons.pets_outlined,
  'airplane': Icons.flight_outlined,
  'gift': Icons.card_giftcard_outlined,
  'barbell': Icons.fitness_center_outlined,
  'book': Icons.menu_book_outlined,
  'cash': Icons.payments_outlined,
  'card': Icons.credit_card_outlined,
  'water': Icons.water_drop_outlined,
  'wifi': Icons.wifi_outlined,
};

/// The names the category form offers, in the order the picker shows them.
final List<String> categoryIconOptions = categoryIconGlyphs.keys.toList(
  growable: false,
);

const String fallbackCategoryIcon = 'pricetag';

/// Guards a stored icon before it is drawn. An unknown name falls back
/// instead of rendering a missing glyph, and — unlike the legacy behaviour of
/// writing the fallback into the draft — the stored value is left alone, so
/// an unrelated save cannot overwrite a name a future version might know.
IconData resolveCategoryIcon(String icon) =>
    categoryIconGlyphs[icon] ?? categoryIconGlyphs[fallbackCategoryIcon]!;

/// Parses a `#RRGGBB` category colour. The contract guarantees the shape, so
/// an unparseable value here means a parser was bypassed; it degrades to the
/// neutral ink instead of throwing inside a build.
Color categoryColor(String hex) {
  final digits = hex.startsWith('#') ? hex.substring(1) : hex;
  final value = int.tryParse(digits, radix: 16);
  if (value == null || digits.length != 6) {
    return AppColors.inkSecondary;
  }
  return Color(0xFF000000 | value);
}

/// The category avatar background: the colour at ~15% over the card. Every
/// surface that draws one composes it this way, and the swatch palette was
/// contrast-checked against exactly this tint, so the two move together.
Color categoryTint(Color color) => color.withAlpha(0x26);

/// The colours the form offers. Six seed colours fail the contrast gate and
/// are absent from this palette — [optionsWithCurrent] is what keeps such a
/// category's own colour selectable so opening the form and saving cannot
/// silently change it.
final List<String> categoryColorOptions = [
  for (final color in AppColors.categorySwatches)
    '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase()}',
];

/// Keeps a category's current value selectable even when it is not one of the
/// offered options.
List<String> optionsWithCurrent(List<String> options, String current) {
  return options.any((option) => option.toUpperCase() == current.toUpperCase())
      ? options
      : [current, ...options];
}
