import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';

/// Nido's picker sheet (`AppBottomSheet` in `app-bottom-sheet.tsx`): a titled
/// panel over a dimmed backdrop, with an explicit close button.
///
/// The close button is not decoration — it is the affordance that replaces
/// drag-to-dismiss, which is undiscoverable and unreachable one-handed on a
/// tall phone. Backdrop tap still dismisses.
///
/// [builder] gets a scroll controller so its content scrolls inside the sheet
/// rather than the sheet growing past the screen.
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required String title,
  required Widget Function(BuildContext context, ScrollController controller)
  builder,
  String? subtitle,
  Key? sheetKey,
  double initialSize = 0.75,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0x6B141C19),
    builder:
        (context) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: initialSize,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (context, controller) {
            final theme = Theme.of(context);

            return Container(
              decoration: const BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(AppRadii.modal),
                  topRight: Radius.circular(AppRadii.modal),
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                key: sheetKey,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screen,
                      AppSpacing.cardPadding,
                      AppSpacing.screen,
                      AppSpacing.cardGap,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Semantics(
                                header: true,
                                child: Text(
                                  title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.headlineMedium,
                                ),
                              ),
                              if (subtitle case final text?)
                                Text(text, style: theme.textTheme.bodySmall),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.base),
                        Material(
                          color: AppColors.surfaceMuted,
                          shape: const CircleBorder(),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            key: const Key('close_sheet_button'),
                            onTap: () => Navigator.of(context).pop(),
                            child: const SizedBox(
                              width: AppSpacing.touchTarget,
                              height: AppSpacing.touchTarget,
                              child: Icon(
                                Icons.close,
                                size: 22,
                                color: AppColors.ink,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(child: builder(context, controller)),
                ],
              ),
            );
          },
        ),
  );
}
