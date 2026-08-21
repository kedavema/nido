import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';

/// The field vocabulary every Nido form speaks: a semibold secondary-size
/// label, the control, and an inline error underneath
/// (`expense-form-fields.tsx`).

/// Label + control + optional inline error, for a single control.
///
/// Named `Nido…` because Material already exports a `FormField`, and a screen
/// importing both would have to disambiguate at every call site.
class NidoFormField extends StatelessWidget {
  const NidoFormField({
    super.key,
    required this.label,
    required this.child,
    this.error,
  });

  final String label;
  final Widget child;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        FieldLabel(label),
        const SizedBox(height: AppSpacing.sm),
        child,
        if (error case final message?) ...[
          const SizedBox(height: AppSpacing.sm),
          FieldError(message),
        ],
      ],
    );
  }
}

/// A labelled group of chips.
///
/// [onSeeAll] renders "Ver todas ›" in the header rather than as another chip,
/// so the row only ever holds choices.
class FormSection extends StatelessWidget {
  const FormSection({
    super.key,
    required this.label,
    required this.child,
    this.sublabel,
    this.onSeeAll,
    this.seeAllLabel = 'Ver todas ›',
    this.error,
  });

  final String label;
  final String? sublabel;
  final Widget child;
  final VoidCallback? onSeeAll;
  final String seeAllLabel;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: FieldLabel(
                sublabel == null ? label : '$label · $sublabel',
              ),
            ),
            if (onSeeAll case final callback?)
              TextButton(
                key: Key('see_all_$label'),
                onPressed: callback,
                child: Text(
                  seeAllLabel,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        child,
        if (error case final message?) ...[
          const SizedBox(height: AppSpacing.sm),
          FieldError(message),
        ],
      ],
    );
  }
}

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
        color: AppColors.ink,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class FieldError extends StatelessWidget {
  const FieldError(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Text(
        message,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: AppColors.danger,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

/// The bordered text input the token set describes: 44 tall, `borderStrong`
/// outline, `button` radius, white fill — no floating label, no filled
/// Material underline, because the label already sits above it.
class NidoTextField extends StatelessWidget {
  const NidoTextField({
    super.key,
    required this.controller,
    this.hintText,
    this.onChanged,
    this.onSubmitted,
    this.maxLength,
    this.maxLines = 1,
    this.autofocus = false,
    this.keyboardType,
    this.inputFormatters,
    this.textAlign = TextAlign.start,
    this.hasError = false,
    this.semanticLabel,
  });

  final TextEditingController controller;
  final String? hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final int? maxLength;
  final int? maxLines;
  final bool autofocus;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextAlign textAlign;
  final bool hasError;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return TextField(
      controller: controller,
      autofocus: autofocus,
      maxLength: maxLength,
      maxLines: maxLines,
      minLines: 1,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textAlign: textAlign,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      style: theme.textTheme.bodyMedium,
      decoration: InputDecoration(
        // The counter would add a whole line under every bounded field for a
        // limit nobody is near.
        counterText: '',
        hintText: hintText,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
        constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(
            color: hasError ? AppColors.danger : AppColors.borderStrong,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadii.buttonRadius,
          borderSide: BorderSide(
            color: hasError ? AppColors.danger : AppColors.primary,
            width: 1.5,
          ),
        ),
      ),
    );
  }
}

/// A field-shaped button that opens a picker: same box as [NidoTextField],
/// with a chevron instead of a caret.
class PickerField extends StatelessWidget {
  const PickerField({
    super.key,
    required this.value,
    required this.onPressed,
    this.leading,
  });

  final String value;
  final VoidCallback onPressed;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: AppColors.surface,
      borderRadius: AppRadii.buttonRadius,
      child: InkWell(
        onTap: onPressed,
        borderRadius: AppRadii.buttonRadius,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: AppRadii.buttonRadius,
            border: Border.all(color: AppColors.borderStrong),
          ),
          child: Row(
            children: [
              if (leading case final widget?) ...[
                widget,
                const SizedBox(width: AppSpacing.sm),
              ],
              Expanded(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium,
                ),
              ),
              const Icon(
                Icons.expand_more,
                size: 16,
                color: AppColors.inkSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
