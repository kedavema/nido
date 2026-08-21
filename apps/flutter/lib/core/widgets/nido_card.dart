import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_shadows.dart';
import '../../app/theme/app_spacing.dart';

/// The white surface every grouped block sits on (`Card` in `m1-ui.tsx`).
///
/// Not Material's `Card`: that one brings its own elevation ramp and surface
/// tint, and Nido has exactly one raised height. The `gap` between children is
/// part of the component because every call site wanted the same 12.
class NidoCard extends StatelessWidget {
  const NidoCard({
    super.key,
    required this.children,
    this.padding = AppSpacing.cardInsets,
    this.gap = AppSpacing.cardGap,
    this.crossAxisAlignment = CrossAxisAlignment.stretch,
  }) : _single = null;

  /// A card with a single child that manages its own internal spacing (a list
  /// of rows, a tile).
  const NidoCard.single({
    super.key,
    required Widget child,
    this.padding = AppSpacing.cardInsets,
    this.crossAxisAlignment = CrossAxisAlignment.stretch,
  }) : children = const [],
       gap = 0,
       _single = child;

  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final double gap;
  final CrossAxisAlignment crossAxisAlignment;

  final Widget? _single;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadii.cardRadius,
        border: Border.fromBorderSide(BorderSide(color: AppColors.border)),
        boxShadow: AppShadows.card,
      ),
      padding: padding,
      child:
          _single ??
          Column(
            crossAxisAlignment: crossAxisAlignment,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var index = 0; index < children.length; index++) ...[
                if (index > 0) SizedBox(height: gap),
                children[index],
              ],
            ],
          ),
    );
  }
}
