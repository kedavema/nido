import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/time/local_date.dart';
import '../../../core/time/year_month.dart';
import '../domain/movement_format.dart';

/// Picks the [LocalDate] a movement happened on.
///
/// Hand-rolled rather than Material's `showDatePicker`: that one needs
/// `flutter_localizations` to speak Spanish, and it works in `DateTime`,
/// which is exactly the ambiguous type [LocalDate] exists to keep out of
/// financial dates (FLT-007). The grid is Monday-first, like the legacy
/// calendar.
Future<LocalDate?> showLocalDatePickerSheet({
  required BuildContext context,
  required LocalDate value,
  required LocalDate today,
}) {
  return showModalBottomSheet<LocalDate>(
    context: context,
    showDragHandle: true,
    builder: (context) => _LocalDatePickerSheet(value: value, today: today),
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

class _LocalDatePickerSheet extends StatefulWidget {
  const _LocalDatePickerSheet({required this.value, required this.today});

  final LocalDate value;
  final LocalDate today;

  @override
  State<_LocalDatePickerSheet> createState() => _LocalDatePickerSheetState();
}

class _LocalDatePickerSheetState extends State<_LocalDatePickerSheet> {
  late YearMonth _month = YearMonth.of(widget.value);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final yesterday = widget.today.plusDays(-1);
    // Monday-first offset of the 1st: Dart's `weekday` is already 1 = Monday.
    final leading = DateTime.utc(_month.year, _month.month, 1).weekday - 1;
    final dayCount = LocalDate.daysInMonth(_month.year, _month.month);

    return SafeArea(
      key: const Key('local_date_picker_sheet'),
      child: Padding(
        padding: AppSpacing.screenPadding,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Elegir fecha', style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.cardGap),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    key: const Key('date_today_button'),
                    onPressed: () => Navigator.of(context).pop(widget.today),
                    child: const Text('Hoy'),
                  ),
                ),
                const SizedBox(width: AppSpacing.cardGap),
                Expanded(
                  child: OutlinedButton(
                    key: const Key('date_yesterday_button'),
                    onPressed: () => Navigator.of(context).pop(yesterday),
                    child: const Text('Ayer'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Row(
              children: [
                IconButton(
                  key: const Key('calendar_previous_month'),
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () => setState(() => _month = _month.previous),
                ),
                Expanded(
                  child: Text(
                    formatMonthLabel(_month),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
                IconButton(
                  key: const Key('calendar_next_month'),
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () => setState(() => _month = _month.next),
                ),
              ],
            ),
            Row(
              children: [
                for (final label in _weekdayLabels)
                  Expanded(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.inkSecondary,
                      ),
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
                        LocalDate(_month.year, _month.month, day) ==
                        widget.value,
                    isToday:
                        LocalDate(_month.year, _month.month, day) ==
                        widget.today,
                    onTap: (date) => Navigator.of(context).pop(date),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.cardGap),
            TextButton(
              key: const Key('date_cancel_button'),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancelar'),
            ),
          ],
        ),
      ),
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
            ),
          ),
        ),
      ),
    );
  }
}
