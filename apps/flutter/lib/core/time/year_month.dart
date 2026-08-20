import 'local_date.dart';

/// A calendar month with no day component (`yyyy-MM` on the wire, per
/// `MonthSchema`). The API resolves it to a local-date range itself; this
/// type centralizes the same range math for the client.
class YearMonth implements Comparable<YearMonth> {
  YearMonth(this.year, this.month) {
    if (month < 1 || month > 12) {
      throw FormatException('Month out of range: $month');
    }
  }

  final int year;
  final int month;

  static final RegExp _wirePattern = RegExp(r'^\d{4}-(0[1-9]|1[0-2])$');

  static YearMonth parseWire(String wire) {
    if (!_wirePattern.hasMatch(wire)) {
      throw FormatException('Not a yyyy-MM month', wire);
    }
    return YearMonth(
      int.parse(wire.substring(0, 4)),
      int.parse(wire.substring(5, 7)),
    );
  }

  factory YearMonth.of(LocalDate date) => YearMonth(date.year, date.month);

  LocalDate get firstDay => LocalDate(year, month, 1);

  LocalDate get lastDay =>
      LocalDate(year, month, LocalDate.daysInMonth(year, month));

  /// Adds [months] (may be negative) with pure month arithmetic; a month has
  /// no day, so no clamping happens here (see [atDayClamped]).
  YearMonth plusMonths(int months) {
    final zeroBased = year * 12 + (month - 1) + months;
    final newYear = zeroBased ~/ 12;
    final newMonth = zeroBased % 12 + 1;
    if (newYear < 0) {
      throw ArgumentError('Month arithmetic underflowed year 0: $newYear');
    }
    return YearMonth(newYear, newMonth);
  }

  YearMonth get next => plusMonths(1);

  YearMonth get previous => plusMonths(-1);

  /// The date at [day] in this month, clamped to the month's last day —
  /// the "last-day clamp" recurrence rule (Jan 31 → Feb 28/29).
  LocalDate atDayClamped(int day) {
    if (day < 1) {
      throw ArgumentError.value(day, 'day', 'must be at least 1');
    }
    final lastDayOfMonth = LocalDate.daysInMonth(year, month);
    return LocalDate(year, month, day > lastDayOfMonth ? lastDayOfMonth : day);
  }

  bool contains(LocalDate date) => date.year == year && date.month == month;

  String toWire() {
    return '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}';
  }

  @override
  int compareTo(YearMonth other) {
    if (year != other.year) {
      return year.compareTo(other.year);
    }
    return month.compareTo(other.month);
  }

  @override
  bool operator ==(Object other) {
    return other is YearMonth && other.year == year && other.month == month;
  }

  @override
  int get hashCode => Object.hash(year, month);

  @override
  String toString() => 'YearMonth(${toWire()})';
}
