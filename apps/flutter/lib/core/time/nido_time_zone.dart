import 'local_date.dart';
import 'year_month.dart';

/// IANA timezone every Nido household uses today (`NIDO_TIME_ZONE` in
/// `packages/domain-types`).
const String nidoTimeZoneName = 'America/Asuncion';

/// Paraguay abolished DST in October 2024 (Ley 7115/2023 kept UTC-3
/// permanently), so America/Asuncion is a fixed UTC-3 for every present and
/// future instant. Foundation encodes that single offset instead of pulling
/// a full IANA database dependency; per `docs/flutter-architecture.md` the
/// `timezone` package is only added when a real DST/IANA rule demands it
/// (historical instants before 2024 are not converted client-side — the
/// server derives `localDate`).
const Duration _asuncionOffset = Duration(hours: -3);

/// The current calendar date in America/Asuncion for a given UTC instant.
/// Pass the clock in (`clockProvider` in bootstrap) — never call
/// `DateTime.now()` at usage sites, so tests stay deterministic.
LocalDate todayInAsuncion(DateTime nowUtc) {
  final shifted = nowUtc.toUtc().add(_asuncionOffset);
  return LocalDate(shifted.year, shifted.month, shifted.day);
}

/// The current calendar month in America/Asuncion for a given UTC instant.
YearMonth currentMonthInAsuncion(DateTime nowUtc) {
  return YearMonth.of(todayInAsuncion(nowUtc));
}
