import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/time/local_date.dart';

void main() {
  group('LocalDate.parseWire', () {
    test('parses and round-trips yyyy-MM-dd', () {
      final date = LocalDate.parseWire('2026-08-15');
      expect(date.year, 2026);
      expect(date.month, 8);
      expect(date.day, 15);
      expect(date.toWire(), '2026-08-15');
    });

    test('rejects non-existent calendar dates, like the legacy validator', () {
      for (final wire in [
        '2026-02-30',
        '2025-02-29',
        '2026-04-31',
        '2026-13-01',
        '2026-00-10',
        '2026-01-00',
      ]) {
        expect(
          () => LocalDate.parseWire(wire),
          throwsFormatException,
          reason: wire,
        );
      }
    });

    test('accepts Feb 29 only on leap years', () {
      expect(LocalDate.parseWire('2024-02-29').day, 29);
      expect(() => LocalDate.parseWire('2023-02-29'), throwsFormatException);
    });

    test('rejects malformed strings', () {
      for (final wire in [
        '2026-8-15',
        '15-08-2026',
        '2026/08/15',
        '2026-08-15T00:00:00Z',
        '',
        '2026-08',
      ]) {
        expect(
          () => LocalDate.parseWire(wire),
          throwsFormatException,
          reason: wire,
        );
      }
    });
  });

  group('leap year rules', () {
    test('century years follow the 400 rule', () {
      expect(LocalDate.isLeapYear(2000), isTrue);
      expect(LocalDate.isLeapYear(1900), isFalse);
      expect(LocalDate.isLeapYear(2024), isTrue);
      expect(LocalDate.isLeapYear(2023), isFalse);
    });

    test('daysInMonth reflects leap February', () {
      expect(LocalDate.daysInMonth(2024, 2), 29);
      expect(LocalDate.daysInMonth(2023, 2), 28);
      expect(LocalDate.daysInMonth(2026, 4), 30);
      expect(LocalDate.daysInMonth(2026, 12), 31);
    });
  });

  group('plusDays', () {
    test('crosses month and year boundaries without timezone drift', () {
      expect(
        LocalDate.parseWire('2026-08-31').plusDays(1).toWire(),
        '2026-09-01',
      );
      expect(
        LocalDate.parseWire('2026-12-31').plusDays(1).toWire(),
        '2027-01-01',
      );
      expect(
        LocalDate.parseWire('2026-01-01').plusDays(-1).toWire(),
        '2025-12-31',
      );
      expect(
        LocalDate.parseWire('2024-02-28').plusDays(1).toWire(),
        '2024-02-29',
      );
    });
  });

  group('ordering and equality', () {
    test('compares by calendar position', () {
      final earlier = LocalDate.parseWire('2026-08-15');
      final later = LocalDate.parseWire('2026-09-01');
      expect(earlier.isBefore(later), isTrue);
      expect(later.isAfter(earlier), isTrue);
      expect(earlier, LocalDate(2026, 8, 15));
      expect(earlier.hashCode, LocalDate(2026, 8, 15).hashCode);
    });
  });
}
