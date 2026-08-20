/// A calendar date with no time and no timezone (`yyyy-MM-dd` on the wire),
/// per FLT-007: a financial date is never an ambiguous local `DateTime`.
class LocalDate implements Comparable<LocalDate> {
  LocalDate(this.year, this.month, this.day) {
    if (month < 1 || month > 12) {
      throw FormatException('Month out of range: $month');
    }
    if (day < 1 || day > daysInMonth(year, month)) {
      throw FormatException('Day out of range for $year-$month: $day');
    }
  }

  final int year;
  final int month;
  final int day;

  static final RegExp _wirePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  /// Parses `yyyy-MM-dd`, rejecting both malformed strings and non-existent
  /// calendar dates (`2026-02-30`), like the legacy
  /// `isValidLocalDateString` guard.
  static LocalDate parseWire(String wire) {
    if (!_wirePattern.hasMatch(wire)) {
      throw FormatException('Not a yyyy-MM-dd local date', wire);
    }
    final year = int.parse(wire.substring(0, 4));
    final month = int.parse(wire.substring(5, 7));
    final day = int.parse(wire.substring(8, 10));
    try {
      return LocalDate(year, month, day);
    } on FormatException {
      throw FormatException('Not a real calendar date', wire);
    }
  }

  static bool isLeapYear(int year) {
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
  }

  static int daysInMonth(int year, int month) {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month == 2 && isLeapYear(year)) {
      return 29;
    }
    return lengths[month - 1];
  }

  /// Shifts by [days] (may be negative) using UTC calendar math, without
  /// device-timezone drift — the same technique as the legacy
  /// `shiftLocalDate`.
  LocalDate plusDays(int days) {
    final shifted = DateTime.utc(year, month, day).add(Duration(days: days));
    return LocalDate(shifted.year, shifted.month, shifted.day);
  }

  String toWire() {
    final mm = month.toString().padLeft(2, '0');
    final dd = day.toString().padLeft(2, '0');
    return '${year.toString().padLeft(4, '0')}-$mm-$dd';
  }

  bool isBefore(LocalDate other) => compareTo(other) < 0;

  bool isAfter(LocalDate other) => compareTo(other) > 0;

  @override
  int compareTo(LocalDate other) {
    if (year != other.year) {
      return year.compareTo(other.year);
    }
    if (month != other.month) {
      return month.compareTo(other.month);
    }
    return day.compareTo(other.day);
  }

  @override
  bool operator ==(Object other) {
    return other is LocalDate &&
        other.year == year &&
        other.month == month &&
        other.day == day;
  }

  @override
  int get hashCode => Object.hash(year, month, day);

  @override
  String toString() => 'LocalDate(${toWire()})';
}
