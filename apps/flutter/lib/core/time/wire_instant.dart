import 'local_date.dart';

/// Wire codec for instants (`IsoDateTimeSchema`: ISO-8601 with an explicit
/// offset). Instants are held as UTC [DateTime]s and are a different concept
/// from [LocalDate] — a timestamp is never reused as a financial date
/// (FLT-007).
class WireInstant {
  WireInstant._();

  /// Offset (`Z` or `±hh:mm`/`±hhmm`) is required, matching
  /// `z.iso.datetime({ offset: true })` — a naive datetime is ambiguous and
  /// rejected at the boundary.
  static final RegExp _offsetPattern = RegExp(r'(Z|[+-]\d{2}:?\d{2})$');

  static DateTime parseWire(String wire) {
    if (!_offsetPattern.hasMatch(wire)) {
      throw FormatException('Instant must carry an explicit UTC offset', wire);
    }
    final DateTime parsed;
    try {
      parsed = DateTime.parse(wire);
    } on FormatException {
      throw FormatException('Not an ISO-8601 instant', wire);
    }
    return parsed.toUtc();
  }

  /// Serializes to the exact shape the legacy client emits
  /// (`Date#toISOString`): UTC, milliseconds always present, `Z` suffix.
  /// Sub-millisecond precision is truncated — the wire never carries it.
  static String toWire(DateTime instant) {
    final utc = instant.toUtc();
    String pad(int value, [int width = 2]) =>
        value.toString().padLeft(width, '0');
    return '${pad(utc.year, 4)}-${pad(utc.month)}-${pad(utc.day)}'
        'T${pad(utc.hour)}:${pad(utc.minute)}:${pad(utc.second)}'
        '.${pad(utc.millisecond, 3)}Z';
  }
}

/// Turns a user-picked local date into the `occurredAt` instant to submit,
/// preserving the legacy rule (`localDateToOccurredAt` in
/// `apps/mobile/src/utils/expense-form.ts`): picking today submits the real
/// current instant; a backdated date is pinned to 15:00 UTC — solidly midday
/// in America/Asuncion regardless of historical DST offset — so the server's
/// timezone-derived `localDate` resolves back to the picked date.
String localDateToOccurredAt({
  required LocalDate picked,
  required LocalDate todayLocal,
  required DateTime Function() now,
}) {
  if (picked == todayLocal) {
    return WireInstant.toWire(now());
  }
  return '${picked.toWire()}T15:00:00.000Z';
}
