import 'local_date.dart';
import 'year_month.dart';

/// `FREQUENCY_KINDS` in `packages/domain-types`.
enum FrequencyKind {
  oneTime('ONE_TIME'),
  monthly('MONTHLY'),
  yearly('YEARLY'),
  everyNMonths('EVERY_N_MONTHS');

  const FrequencyKind(this.wireName);

  final String wireName;

  static FrequencyKind parseWire(String wire) {
    for (final kind in FrequencyKind.values) {
      if (kind.wireName == wire) {
        return kind;
      }
    }
    throw FormatException('Unknown frequency kind: $wire');
  }
}

/// Due date of the Nth occurrence (0-based) of a recurring item, ported from
/// `calculateOccurrenceDueDate` in `packages/domain-types/src/frequency.ts`
/// (docs/system-design.md §6.4): dates are calculated forward from
/// [firstDueDate]'s anchor day — never cumulatively — and when the anchor day
/// doesn't exist in the destination month (day 31 in February, Feb 29 in a
/// non-leap year) the month's last calendar day is used instead. A later
/// occurrence in a longer month returns to the anchor day.
///
/// Index 0 always returns [firstDueDate] itself, regardless of frequency.
/// [intervalMonths] is required (positive integer) only for
/// [FrequencyKind.everyNMonths]; it is ignored for every other frequency.
LocalDate calculateOccurrenceDueDate({
  required LocalDate firstDueDate,
  required FrequencyKind frequency,
  required int occurrenceIndex,
  int? intervalMonths,
}) {
  if (occurrenceIndex < 0) {
    throw RangeError('occurrenceIndex must be a non-negative integer');
  }
  if (occurrenceIndex == 0) {
    return firstDueDate;
  }

  final int monthsToAdd;
  switch (frequency) {
    case FrequencyKind.oneTime:
      throw RangeError(
        'ONE_TIME frequency only has a single occurrence (index 0)',
      );
    case FrequencyKind.monthly:
      monthsToAdd = occurrenceIndex;
    case FrequencyKind.yearly:
      monthsToAdd = occurrenceIndex * 12;
    case FrequencyKind.everyNMonths:
      if (intervalMonths == null || intervalMonths < 1) {
        throw RangeError(
          'EVERY_N_MONTHS frequency requires a positive integer intervalMonths',
        );
      }
      monthsToAdd = occurrenceIndex * intervalMonths;
  }

  return YearMonth.of(
    firstDueDate,
  ).plusMonths(monthsToAdd).atDayClamped(firstDueDate.day);
}
