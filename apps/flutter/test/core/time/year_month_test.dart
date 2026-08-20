import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/time/local_date.dart';
import 'package:nido/core/time/year_month.dart';

void main() {
  group('YearMonth.parseWire', () {
    test('parses and round-trips yyyy-MM', () {
      final month = YearMonth.parseWire('2026-08');
      expect(month.year, 2026);
      expect(month.month, 8);
      expect(month.toWire(), '2026-08');
    });

    test('rejects malformed months (same pattern as MonthSchema)', () {
      for (final wire in [
        '2026-13',
        '2026-00',
        '2026-8',
        '2026',
        '2026-08-15',
        '',
      ]) {
        expect(
          () => YearMonth.parseWire(wire),
          throwsFormatException,
          reason: wire,
        );
      }
    });
  });

  group('month ranges', () {
    test('firstDay and lastDay bound the month', () {
      final august = YearMonth.parseWire('2026-08');
      expect(august.firstDay.toWire(), '2026-08-01');
      expect(august.lastDay.toWire(), '2026-08-31');
    });

    test('lastDay respects leap February', () {
      expect(YearMonth.parseWire('2024-02').lastDay.toWire(), '2024-02-29');
      expect(YearMonth.parseWire('2023-02').lastDay.toWire(), '2023-02-28');
    });

    test('contains matches only same year and month', () {
      final august = YearMonth.parseWire('2026-08');
      expect(august.contains(LocalDate.parseWire('2026-08-31')), isTrue);
      expect(august.contains(LocalDate.parseWire('2026-09-01')), isFalse);
      expect(august.contains(LocalDate.parseWire('2025-08-15')), isFalse);
    });
  });

  group('month arithmetic', () {
    test('plusMonths crosses year boundaries in both directions', () {
      expect(YearMonth.parseWire('2026-12').plusMonths(1).toWire(), '2027-01');
      expect(YearMonth.parseWire('2026-01').plusMonths(-1).toWire(), '2025-12');
      expect(YearMonth.parseWire('2026-08').plusMonths(18).toWire(), '2028-02');
      expect(
        YearMonth.parseWire('2026-08').plusMonths(-20).toWire(),
        '2024-12',
      );
    });

    test('next and previous are single-month shifts', () {
      expect(YearMonth.parseWire('2026-08').next.toWire(), '2026-09');
      expect(YearMonth.parseWire('2026-08').previous.toWire(), '2026-07');
    });

    test('atDayClamped applies the last-day clamp rule', () {
      expect(
        YearMonth.parseWire('2026-02').atDayClamped(31).toWire(),
        '2026-02-28',
      );
      expect(
        YearMonth.parseWire('2024-02').atDayClamped(31).toWire(),
        '2024-02-29',
      );
      expect(
        YearMonth.parseWire('2026-04').atDayClamped(31).toWire(),
        '2026-04-30',
      );
      expect(
        YearMonth.parseWire('2026-08').atDayClamped(31).toWire(),
        '2026-08-31',
      );
      expect(
        () => YearMonth.parseWire('2026-08').atDayClamped(0),
        throwsArgumentError,
      );
    });
  });

  group('ordering and equality', () {
    test('compares chronologically', () {
      expect(
        YearMonth.parseWire(
          '2026-08',
        ).compareTo(YearMonth.parseWire('2026-09')),
        lessThan(0),
      );
      expect(YearMonth.parseWire('2026-08'), YearMonth(2026, 8));
      expect(
        YearMonth.of(LocalDate.parseWire('2026-08-15')),
        YearMonth(2026, 8),
      );
    });
  });
}
