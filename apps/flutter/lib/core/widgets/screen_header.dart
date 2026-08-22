import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_spacing.dart';
import '../../app/theme/app_typography.dart';

/// How large a screen title reads.
enum ScreenHeaderSize {
  /// 28px — a standalone screen's title.
  hero,

  /// 20px — what the tab-level screens use.
  compact,
}

/// The title block at the top of a screen, ported from `ScreenHeader`.
///
/// [trailing] is why this exists as a component: a screen with a control
/// beside its title (a month stepper, an avatar) had nowhere to put it, so six
/// legacy screens hand-rolled their own header and drifted apart.
class ScreenHeader extends StatelessWidget {
  const ScreenHeader({
    super.key,
    required this.title,
    this.description,
    this.eyebrow,
    this.leading,
    this.trailing,
    this.size = ScreenHeaderSize.hero,
  });

  final String title;
  final String? description;
  final String? eyebrow;
  final Widget? leading;
  final Widget? trailing;
  final ScreenHeaderSize size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hero = size == ScreenHeaderSize.hero;

    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (eyebrow case final text?) ...[
          Text(
            text.toUpperCase(),
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.accent,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.base),
        ],
        Semantics(
          header: true,
          child: Text(
            title,
            style:
                hero
                    ? theme.textTheme.displayLarge
                    : theme.textTheme.headlineMedium,
          ),
        ),
        if (description case final text?) ...[
          const SizedBox(height: AppSpacing.base),
          Text(
            text,
            // A compact header scales as a whole: leaving the subtitle at body
            // size made it larger than the title's own step down.
            style:
                hero ? theme.textTheme.bodyMedium : theme.textTheme.bodySmall,
          ),
        ],
      ],
    );

    if (leading == null && trailing == null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.base),
        child: copy,
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.base),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (leading case final widget?) ...[
            widget,
            const SizedBox(width: AppSpacing.cardGap),
          ],
          // The copy takes the slack so a long title wraps rather than pushing
          // a trailing control off the edge.
          Expanded(child: copy),
          if (trailing case final widget?) ...[
            const SizedBox(width: AppSpacing.cardGap),
            widget,
          ],
        ],
      ),
    );
  }
}

/// The back affordance for a pushed screen's [ScreenHeader].
class HeaderBackButton extends StatelessWidget {
  const HeaderBackButton({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: const Key('header_back_button'),
      onPressed: onPressed,
      tooltip: 'Volver',
      iconSize: 20,
      color: AppColors.ink,
      icon: const Icon(Icons.chevron_left),
    );
  }
}

/// Which escape affordance a [FormHeader] shows.
enum FormDismissIcon {
  /// `×` — "leave this editor", for a screen that took over to edit something.
  close,

  /// `‹` — "return to where I came from", for a pushed route.
  back,
}

/// The fixed header a form or a pushed screen carries.
///
/// Fixed rather than scrolling on purpose: the dismiss affordance has to stay
/// reachable while the keyboard is up.
class FormHeader extends StatelessWidget implements PreferredSizeWidget {
  const FormHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.onDismiss,
    this.dismissIcon = FormDismissIcon.close,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onDismiss;
  final FormDismissIcon dismissIcon;
  final Widget? trailing;

  static const double _buttonSize = 40;

  @override
  Size get preferredSize => Size.fromHeight(subtitle == null ? 72 : 92);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, label) = switch (dismissIcon) {
      FormDismissIcon.close => (Icons.close, 'Cerrar'),
      FormDismissIcon.back => (Icons.chevron_left, 'Volver'),
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.cardGap,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (onDismiss case final dismiss?) ...[
            Material(
              color: AppColors.surface,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: const Key('form_header_dismiss'),
                onTap: dismiss,
                child: SizedBox(
                  width: _buttonSize,
                  height: _buttonSize,
                  child: Icon(icon, size: 20, color: AppColors.ink),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.cardGap),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.headlineMedium),
                ),
                if (subtitle case final text?)
                  Text(text, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          if (trailing case final widget?) ...[
            const SizedBox(width: AppSpacing.cardGap),
            widget,
          ],
        ],
      ),
    );
  }
}

/// The uppercase caption that introduces a block inside a card.
class SectionEyebrow extends StatelessWidget {
  const SectionEyebrow(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: AppColors.inkSecondary,
        letterSpacing: 0.4,
        fontFamily: AppTypography.bodyFontFamily,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}
