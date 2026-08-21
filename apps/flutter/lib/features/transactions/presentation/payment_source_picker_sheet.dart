import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/widgets/app_bottom_sheet.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/screen_header.dart';
import '../../payment_sources/presentation/payment_sources_screen.dart';

/// The result of the payment-source sheet: a source, or the explicit choice of
/// none.
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
  return showAppBottomSheet<PaymentSourceSelection>(
    context: context,
    title: 'Pagado con',
    subtitle: 'Para este movimiento',
    sheetKey: const Key('payment_source_picker_sheet'),
    initialSize: 0.6,
    builder: (context, controller) {
      final active = paymentSources.where((source) => source.isActive).toList();
      final favorites = [
        for (final id in favoriteIds)
          if (active.where((source) => source.id == id).firstOrNull
              case final source?)
            source,
      ];
      final others =
          active.where((source) => !favoriteIds.contains(source.id)).toList();

      return ListView(
        controller: controller,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        children: [
          if (active.isEmpty)
            const InlineNotice(
              message:
                  'Todavía no hay medios de pago activos. Podés guardar el '
                  'movimiento sin uno.',
            ),
          if (favorites.isNotEmpty) ...[
            const _SectionLabel('Favoritos'),
            for (final source in favorites)
              _SourceOption(
                source: source,
                isSelected: selectedPaymentSourceId == source.id,
              ),
          ],
          if (others.isNotEmpty) ...[
            const _SectionLabel('Otros medios'),
            for (final source in others)
              _SourceOption(
                source: source,
                isSelected: selectedPaymentSourceId == source.id,
              ),
          ],
          const Divider(height: AppSpacing.lg, color: AppColors.border),
          _NoneOption(isSelected: selectedPaymentSourceId == null),
          const SizedBox(height: AppSpacing.screen),
        ],
      );
    },
  );
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(
        top: AppSpacing.cardGap,
        bottom: AppSpacing.base,
      ),
      child: SectionEyebrow(label),
    );
  }
}

class _SourceOption extends StatelessWidget {
  const _SourceOption({required this.source, required this.isSelected});

  final PaymentSource source;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      key: Key('pick_payment_source_${source.id}'),
      onTap: () => Navigator.of(context).pop(PaymentSourceSelection(source.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(source.name, style: theme.textTheme.bodyMedium),
                  Text(
                    paymentSourceTypeLabels[source.type]!,
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check, size: 18, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}

class _NoneOption extends StatelessWidget {
  const _NoneOption({required this.isSelected});

  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      key: const Key('pick_payment_source_none'),
      onTap:
          () => Navigator.of(context).pop(const PaymentSourceSelection(null)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Sin medio de pago',
                style: theme.textTheme.bodyMedium,
              ),
            ),
            if (isSelected)
              const Icon(Icons.check, size: 18, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
