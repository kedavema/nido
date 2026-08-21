import '../../../core/contracts/transactions.dart';
import '../../../core/time/local_date.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/time/year_month.dart';

/// Presentation of movements, ported from
/// `apps/mobile/src/utils/movement-format.ts`.
///
/// Every amount here is read from `baseAmountPyg`, a `decimal(18,0)` column
/// value that can exceed the exact range of a `double`, so the arithmetic
/// stays on [BigInt] and the formatting stays on digit strings — no
/// `double`, no `int` (ADR 0001).

/// U+2212, not a hyphen: it aligns with digits at the same optical weight.
const String minusSign = '−';

const List<String> _weekdayAbbreviations = [
  'DOM',
  'LUN',
  'MAR',
  'MIÉ',
  'JUE',
  'VIE',
  'SÁB',
];

const List<String> _monthAbbreviations = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

const List<String> _monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/// Sunday-first index, matching the abbreviation tables above (Dart's
/// `weekday` is Monday-first with Sunday as 7).
int _weekdayIndex(LocalDate date) =>
    DateTime.utc(date.year, date.month, date.day).weekday % 7;

/// Inserts `.` thousand separators into an unsigned integer digit string.
String formatPygMagnitude(String digits) {
  final buffer = StringBuffer();
  for (var index = 0; index < digits.length; index++) {
    final remaining = digits.length - index;
    if (index > 0 && remaining % 3 == 0) {
      buffer.write('.');
    }
    buffer.write(digits[index]);
  }
  return buffer.toString();
}

/// "HOY · MIÉ 15" / "AYER · MAR 14" / "MIÉ 1 JUL" — MOV-01 day-group heading.
String formatDayHeading(LocalDate date, LocalDate today) {
  final weekday = _weekdayAbbreviations[_weekdayIndex(date)];
  if (date == today) {
    return 'HOY · $weekday ${date.day}';
  }
  if (date == today.plusDays(-1)) {
    return 'AYER · $weekday ${date.day}';
  }
  return '$weekday ${date.day} ${_monthAbbreviations[date.month - 1]}';
}

/// "mié 15 jul 2026" — MOV-03's "Fecha" row.
String formatFullLocalDate(LocalDate date) {
  final weekday = _weekdayAbbreviations[_weekdayIndex(date)].toLowerCase();
  final month = _monthAbbreviations[date.month - 1].toLowerCase();
  return '$weekday ${date.day} $month ${date.year}';
}

/// The same label without the year, for surfaces where the surrounding
/// context already fixes it (the legacy code did this by stripping a
/// trailing ` yyyy` off the full label).
String formatLocalDateWithoutYear(LocalDate date) {
  final weekday = _weekdayAbbreviations[_weekdayIndex(date)].toLowerCase();
  final month = _monthAbbreviations[date.month - 1].toLowerCase();
  return '$weekday ${date.day} $month';
}

/// "9:12" — 24h clock in the household timezone.
String formatOccurredAtTime(DateTime instant) {
  final local = asuncionWallClock(instant);
  return '${local.hour}:${local.minute.toString().padLeft(2, '0')}';
}

/// "hoy · mié 15 jul, 9:12" — MOV-03's hero timestamp.
String formatMovementTimestamp(Transaction transaction, LocalDate today) {
  final time = formatOccurredAtTime(transaction.occurredAt);
  final date = formatLocalDateWithoutYear(transaction.localDate);
  if (transaction.localDate == today) {
    return 'hoy · $date, $time';
  }
  if (transaction.localDate == today.plusDays(-1)) {
    return 'ayer · $date, $time';
  }
  return '$date, $time';
}

/// "hoy" / "ayer" / "1 jul" — compact date caption for a receipt row.
String formatRecentMovementDateLabel(LocalDate date, LocalDate today) {
  if (date == today) {
    return 'hoy';
  }
  if (date == today.plusDays(-1)) {
    return 'ayer';
  }
  return '${date.day} ${_monthAbbreviations[date.month - 1].toLowerCase()}';
}

/// A movement's amount as shown in a list or detail: "−Gs. 386.500" for an
/// expense, "+Gs. 9.500.000" for an income.
({String text, bool isPositive}) formatTransactionAmount(
  Transaction transaction,
) {
  final isPositive = transaction.type == TransactionType.income;
  final sign = isPositive ? '+' : minusSign;
  return (
    text:
        '${sign}Gs. ${formatPygMagnitude(transaction.baseAmountPyg.toWire())}',
    isPositive: isPositive,
  );
}

/// Net of a day's movements (income minus expense) in base PYG.
BigInt sumDailyNetBaseAmountPyg(Iterable<Transaction> transactions) {
  var total = BigInt.zero;
  for (final transaction in transactions) {
    final units = transaction.baseAmountPyg.units;
    total =
        transaction.type == TransactionType.income
            ? total + units
            : total - units;
  }
  return total;
}

/// "−Gs. 1.111.365" / "+Gs. 17.700.000" — a day-group subtotal, which unlike
/// a single movement may legitimately be negative.
({String text, bool isPositive}) formatSignedPygAmount(BigInt amount) {
  final isPositive = amount >= BigInt.zero;
  final magnitude = (isPositive ? amount : -amount).toString();
  final sign = isPositive ? '+' : minusSign;
  return (
    text: '${sign}Gs. ${formatPygMagnitude(magnitude)}',
    isPositive: isPositive,
  );
}

/// "45,90" (2 fraction digits) or "7.350" (0) — Spanish decimal comma, no
/// rounding: [value] is a canonical wire decimal and is only re-punctuated.
String formatDecimalEs(String value, int fractionDigits) {
  final separator = value.indexOf('.');
  final integerPart = separator == -1 ? value : value.substring(0, separator);
  final fractionPart = separator == -1 ? '' : value.substring(separator + 1);
  final grouped = formatPygMagnitude(integerPart);
  if (fractionDigits <= 0) {
    return grouped;
  }
  final padded = fractionPart.padRight(fractionDigits, '0');
  return '$grouped,${padded.substring(0, fractionDigits)}';
}

/// A day's movements plus its net, as the list renders them.
class DayGroup {
  const DayGroup({
    required this.localDate,
    required this.transactions,
    required this.netBaseAmountPyg,
  });

  final LocalDate localDate;
  final List<Transaction> transactions;
  final BigInt netBaseAmountPyg;
}

/// Groups movements by `localDate` (newest day first), each day newest
/// movement first.
List<DayGroup> groupTransactionsByDay(Iterable<Transaction> transactions) {
  final byDate = <String, List<Transaction>>{};
  for (final transaction in transactions) {
    byDate
        .putIfAbsent(transaction.localDate.toWire(), () => [])
        .add(transaction);
  }

  final keys = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
  return [
    for (final key in keys)
      DayGroup(
        localDate: LocalDate.parseWire(key),
        transactions: [...byDate[key]!]
          ..sort((a, b) => b.occurredAt.compareTo(a.occurredAt)),
        netBaseAmountPyg: sumDailyNetBaseAmountPyg(byDate[key]!),
      ),
  ];
}

/// "Julio 2026" — the month selector header.
String formatMonthLabel(YearMonth month) =>
    '${_monthNames[month.month - 1]} ${month.year}';

/// "julio" — the month with no year, for copy that already sits in one.
String formatMonthNameOnly(YearMonth month) =>
    _monthNames[month.month - 1].toLowerCase();
