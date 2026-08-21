import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_spacing.dart';
import '../../app/theme/app_typography.dart';

/// The oversized amount entry that anchors every money form
/// (`AmountField` in `expense-form-fields.tsx`).
///
/// The amount is the subject of these screens, not one field among several, so
/// it gets the display face at 44 and sits on the screen's axis with its
/// currency prefix. Everything else on the form is a chip row underneath it.
class AmountField extends StatelessWidget {
  const AmountField({
    super.key,
    required this.controller,
    required this.prefix,
    required this.onChanged,
    this.label,
    this.hint,
    this.autofocus = false,
    this.decimal = false,
    this.semanticLabel = 'Monto',
  });

  final TextEditingController controller;

  /// "Gs." or "USD" — what the number is denominated in, beside it rather than
  /// inside the field, so it never scrolls away with the digits.
  final String prefix;

  final ValueChanged<String> onChanged;
  final String? label;
  final Widget? hint;
  final bool autofocus;

  /// Whether the platform keyboard should offer a decimal separator. PYG has
  /// no fractional unit, so its keyboard is digits only.
  final bool decimal;

  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label case final text?) ...[
          Text(
            text,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.base),
        ],
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                prefix,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: AppColors.inkSecondary,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            // Sized by its content rather than filling the row: a lone "0"
            // should not leave a field stretching across the screen, and a
            // seven-digit guaraní amount still has to fit.
            Flexible(
              child: IntrinsicWidth(
                child: TextField(
                  key: const Key('amount_field'),
                  controller: controller,
                  autofocus: autofocus,
                  textAlign: TextAlign.center,
                  onChanged: onChanged,
                  keyboardType: TextInputType.numberWithOptions(
                    decimal: decimal,
                  ),
                  inputFormatters: [
                    // Belt to the sanitizer's braces: keeps an IME from
                    // inserting characters the draft would silently drop.
                    FilteringTextInputFormatter.allow(
                      decimal ? RegExp(r'[\d.,]') : RegExp(r'[\d.]'),
                    ),
                  ],
                  style: const TextStyle(
                    fontFamily: AppTypography.displayFontFamily,
                    fontSize: AppTypography.amountSize,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                    height: 1.1,
                  ),
                  decoration: const InputDecoration(
                    isDense: true,
                    counterText: '',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    contentPadding: EdgeInsets.zero,
                    constraints: BoxConstraints(
                      minWidth: AppSpacing.touchTarget,
                    ),
                    hintText: '0',
                    hintStyle: TextStyle(
                      fontFamily: AppTypography.displayFontFamily,
                      fontSize: AppTypography.amountSize,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSecondary,
                      height: 1.1,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        if (hint case final widget?) ...[
          const SizedBox(height: AppSpacing.sm),
          DefaultTextStyle.merge(
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall!,
            child: widget,
          ),
        ],
      ],
    );
  }
}
