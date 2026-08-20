import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/time/local_date.dart';
import 'package:nido/core/time/nido_time_zone.dart';
import 'package:nido/core/time/wire_instant.dart';
import 'package:nido/core/time/year_month.dart';

void main() {
  group('WireInstant', () {
    test('parses UTC instants and keeps them UTC', () {
      final instant = WireInstant.parseWire('2026-08-15T18:30:00.000Z');
      expect(instant.isUtc, isTrue);
      expect(instant, DateTime.utc(2026, 8, 15, 18, 30));
    });

    test('parses explicit offsets by converting to UTC', () {
      final instant = WireInstant.parseWire('2026-08-15T15:30:00.000-03:00');
      expect(instant, DateTime.utc(2026, 8, 15, 18, 30));
    });

    test(
      'rejects naive datetimes (offset required, like IsoDateTimeSchema)',
      () {
        expect(
          () => WireInstant.parseWire('2026-08-15T18:30:00.000'),
          throwsFormatException,
        );
        expect(
          () => WireInstant.parseWire('2026-08-15'),
          throwsFormatException,
        );
        expect(
          () => WireInstant.parseWire('not a date Z'),
          throwsFormatException,
        );
      },
    );

    test('serializes exactly like the legacy Date#toISOString', () {
      expect(
        WireInstant.toWire(DateTime.utc(2026, 8, 15, 18, 30)),
        '2026-08-15T18:30:00.000Z',
      );
      expect(
        WireInstant.toWire(DateTime.utc(2026, 1, 2, 3, 4, 5, 6)),
        '2026-01-02T03:04:05.006Z',
      );
    });

    test('round-trips through parse and serialize', () {
      const wire = '2026-08-15T18:30:00.123Z';
      expect(WireInstant.toWire(WireInstant.parseWire(wire)), wire);
    });
  });

  group('localDateToOccurredAt (legacy 15:00Z rule)', () {
    final today = LocalDate.parseWire('2026-08-20');

    test('today submits the real current instant', () {
      final now = DateTime.utc(2026, 8, 20, 14, 22, 33, 444);
      expect(
        localDateToOccurredAt(picked: today, todayLocal: today, now: () => now),
        '2026-08-20T14:22:33.444Z',
      );
    });

    test('a backdated date is pinned to 15:00 UTC', () {
      expect(
        localDateToOccurredAt(
          picked: LocalDate.parseWire('2026-08-01'),
          todayLocal: today,
          now: () => fail('now() must not be consulted for backdated entries'),
        ),
        '2026-08-01T15:00:00.000Z',
      );
    });
  });

  group('America/Asuncion fixed offset (-03:00, DST abolished 2024)', () {
    test('the calendar day flips at 03:00 UTC', () {
      expect(
        todayInAsuncion(DateTime.utc(2026, 8, 20, 2, 59)),
        LocalDate.parseWire('2026-08-19'),
      );
      expect(
        todayInAsuncion(DateTime.utc(2026, 8, 20, 3, 0)),
        LocalDate.parseWire('2026-08-20'),
      );
    });

    test('month boundaries follow the shifted day', () {
      expect(
        currentMonthInAsuncion(DateTime.utc(2026, 9, 1, 1, 0)),
        YearMonth.parseWire('2026-08'),
      );
      expect(
        currentMonthInAsuncion(DateTime.utc(2026, 9, 1, 3, 0)),
        YearMonth.parseWire('2026-09'),
      );
    });
  });
}
