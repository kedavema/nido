import '../time/local_date.dart';
import '../time/wire_instant.dart';
import '../time/year_month.dart';

/// Thin aliases so DTO parsers read declaratively; each one maps 1:1 to a
/// schema in `packages/contracts/src/identity.ts`.
DateTime parseWireInstant(String wire) => WireInstant.parseWire(wire);

LocalDate parseWireLocalDate(String wire) => LocalDate.parseWire(wire);

YearMonth parseWireMonth(String wire) => YearMonth.parseWire(wire);

final RegExp _emailShape = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// `NormalizedEmailSchema`: the server trims, lowercases and validates. A
/// response email is therefore already normalized; parsing re-checks that
/// invariant rather than re-normalizing silently.
String parseNormalizedEmail(String wire) {
  if (wire != wire.trim().toLowerCase()) {
    throw FormatException('Email is not server-normalized', wire);
  }
  if (wire.length > 254 || !_emailShape.hasMatch(wire)) {
    throw FormatException('Not a valid email', wire);
  }
  return wire;
}
