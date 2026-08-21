import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../payment_sources/presentation/payment_sources_screen.dart';

/// The result of the payment-source sheet: a source, or the explicit choice
/// of none.
///
/// A nullable return could not tell "picked «sin medio de pago»" apart from
/// "dismissed the sheet", and those must do different things to the draft.
class PaymentSourceSelection {
  const PaymentSourceSelection(this.paymentSourceId);

  final String? paymentSourceId;
}

Future<PaymentSourceSelection?> showPaymentSourcePickerSheet({
  required BuildContext context,
  required List<PaymentSource> paymentSources,
  required List<String> favoriteIds,
  required String? selectedPaymentSourceId,
}) {
  return showModalBottomSheet<PaymentSourceSelection>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) {
      final theme = Theme.of(context);
      final active = paymentSources.where((source) => source.isActive).toList();
      final favorites = [
        for (final id in favoriteIds)
          if (active.where((source) => source.id == id).firstOrNull
              case final source?)
            source,
      ];
      final others =
          active.where((source) => !favoriteIds.contains(source.id)).toList();

      Widget row(PaymentSource source) => ListTile(
        key: Key('pick_payment_source_${source.id}'),
        dense: true,
        contentPadding: EdgeInsets.zero,
        onTap:
            () => Navigator.of(context).pop(PaymentSourceSelection(source.id)),
        title: Text(source.name),
        subtitle: Text(paymentSourceTypeLabels[source.type]!),
        trailing:
            selectedPaymentSourceId == source.id
                ? const Icon(Icons.check)
                : null,
      );

      Widget sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.cardGap),
        child: Text(
          text,
          style: theme.textTheme.labelMedium?.copyWith(
            color: AppColors.inkSecondary,
          ),
        ),
      );

      return SafeArea(
        key: const Key('payment_source_picker_sheet'),
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          maxChildSize: 0.9,
          builder:
              (context, scrollController) => ListView(
                controller: scrollController,
                padding: AppSpacing.screenPadding,
                children: [
                  Text('Pagado con', style: theme.textTheme.titleMedium),
                  Text(
                    'Para este movimiento',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.inkSecondary,
                    ),
                  ),
                  if (active.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: AppSpacing.cardGap),
                      child: InlineNotice(
                        message:
                            'Todavía no hay medios de pago activos. Podés '
                            'guardar el movimiento sin uno.',
                      ),
                    ),
                  if (favorites.isNotEmpty) ...[
                    sectionLabel('FAVORITOS'),
                    for (final source in favorites) row(source),
                  ],
                  if (others.isNotEmpty) ...[
                    sectionLabel('OTROS MEDIOS'),
                    for (final source in others) row(source),
                  ],
                  const Divider(),
                  ListTile(
                    key: const Key('pick_payment_source_none'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    onTap:
                        () => Navigator.of(
                          context,
                        ).pop(const PaymentSourceSelection(null)),
                    title: const Text('Sin medio de pago'),
                    trailing:
                        selectedPaymentSourceId == null
                            ? const Icon(Icons.check)
                            : null,
                  ),
                ],
              ),
        ),
      );
    },
  );
}
