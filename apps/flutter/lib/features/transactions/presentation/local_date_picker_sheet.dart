import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/time/local_date.dart';
import '../../../core/time/year_month.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_bottom_sheet.dart';
import '../../../core/widgets/month_stepper.dart';
import '../domain/movement_format.dart';

/// Picks the [LocalDate] a movement happened on.
///
/// Hand-rolled rather than Material's `showDatePicker`: that one needs
/// `flutter_localizations` to speak Spanish, and it works in `DateTime`, which
/// is exactly the ambiguous type [LocalDate] exists to keep out of financial
/// dates (FLT-007). The grid is Monday-first, like the legacy calendar.
Future<LocalDate?> showLocalDatePickerSheet({
  required BuildContext context,
  required LocalDate value,
  required LocalDate today,
}) {
  return showAppBottomSheet<LocalDate>(
    context: context,
    title: 'Elegir fecha',
    sheetKey: const Key('local_date_picker_sheet'),
    initialSize: 0.7,
    builder:
        (context, controller) => _LocalDatePickerBody(
          scrollController: controller,
          value: value,
          today: today,
        ),
  );
}

const List<String> _weekdayLabels = [
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
  'Dom',
];

class _LocalDatePickerBody extends StatefulWidget {
  const _LocalDatePickerBody({
    required this.scrollController,
    required this.value,
    required this.today,
  });

  final ScrollController scrollController;
  final LocalDate value;
  final LocalDate today;

  @override
  State<_LocalDatePickerBody> createState() => _LocalDatePickerBodyState();
}

class _LocalDatePickerBodyState extends State<_LocalDatePickerBody> {
  late YearMonth _month = YearMonth.of(widget.value);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final yesterday = widget.today.plusDays(-1);
    // Monday-first offset of the 1st: Dart's `weekday` is already 1 = Monday.
    final leading = DateTime.utc(_month.year, _month.month, 1).weekday - 1;
    final dayCount = LocalDate.daysInMonth(_month.year, _month.month);

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
      children: [
        Row(
          children: [
            Expanded(
              child: ActionButton(
                key: const Key('date_today_button'),
                label: 'Hoy',
                variant: ActionButtonVariant.secondary,
                onPressed: () => Navigator.of(context).pop(widget.today),
              ),
            ),
            const SizedBox(width: AppSpacing.cardGap),
            Expanded(
              child: ActionButton(
                key: const Key('date_yesterday_button'),
                label: 'Ayer',
                variant: ActionButtonVariant.secondary,
                onPressed: () => Navigator.of(context).pop(yesterday),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Center(
          child: MonthStepper(
            key: const Key('calendar_month_stepper'),
            label: formatMonthLabel(_month),
            onPrevious: () => setState(() => _month = _month.previous),
            onNext: () => setState(() => _month = _month.next),
          ),
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Row(
          children: [
            for (final label in _weekdayLabels)
              Expanded(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall,
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            for (var index = 0; index < leading; index++)
              const SizedBox.shrink(),
            for (var day = 1; day <= dayCount; day++)
              _DayCell(
                date: LocalDate(_month.year, _month.month, day),
                isSelected:
                    LocalDate(_month.year, _month.month, day) == widget.value,
                isToday:
                    LocalDate(_month.year, _month.month, day) == widget.today,
                onTap: (date) => Navigator.of(context).pop(date),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.cardGap),
        ActionButton(
          key: const Key('date_cancel_button'),
          label: 'Cancelar',
          variant: ActionButtonVariant.secondary,
          onPressed: () => Navigator.of(context).pop(),
        ),
        const SizedBox(height: AppSpacing.screen),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.isSelected,
    required this.isToday,
    required this.onTap,
  });

  final LocalDate date;
  final bool isSelected;
  final bool isToday;
  final void Function(LocalDate date) onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      key: Key('calendar_day_${date.toWire()}'),
      onTap: () => onTap(date),
      customBorder: const CircleBorder(),
      child: Center(
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isSelected ? AppColors.primary : Colors.transparent,
            border:
                isToday && !isSelected
                    ? Border.all(color: AppColors.primary)
                    : null,
          ),
          child: Text(
            '${date.day}',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: isSelected ? AppColors.surface : AppColors.ink,
              fontWeight: isSelected ? FontWeight.w600 : null,
            ),
          ),
        ),
      ),
    );
  }
}
