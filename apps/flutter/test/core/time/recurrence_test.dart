import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/time/local_date.dart';
import 'package:nido/core/time/recurrence.dart';

// Same vectors as packages/domain-types/test/index.spec.ts, so both runtimes
// keep the docs/system-design.md §6.4 semantics in lockstep.
void main() {
  LocalDate date(String wire) => LocalDate.parseWire(wire);

  group('calculateOccurrenceDueDate', () {
    test('index 0 returns firstDueDate itself, regardless of frequency', () {
      final first = date('2026-01-10');
      for (final frequency in FrequencyKind.values) {
        expect(
          calculateOccurrenceDueDate(
            firstDueDate: first,
            frequency: frequency,
            occurrenceIndex: 0,
            intervalMonths: frequency == FrequencyKind.everyNMonths ? 3 : null,
          ),
          first,
          reason: frequency.wireName,
        );
      }
    });

    test('rejects ONE_TIME past index 0 and negative indexes', () {
      expect(
        () => calculateOccurrenceDueDate(
          firstDueDate: date('2026-01-10'),
          frequency: FrequencyKind.oneTime,
          occurrenceIndex: 1,
        ),
        throwsRangeError,
      );
      expect(
        () => calculateOccurrenceDueDate(
          firstDueDate: date('2026-01-10'),
          frequency: FrequencyKind.monthly,
          occurrenceIndex: -1,
        ),
        throwsRangeError,
      );
    });

    test('MONTHLY advances one calendar month per index (§6.4 example)', () {
      final first = date('2026-01-10');
      expect(
        calculateOccurrenceDueDate(
          firstDueDate: first,
          frequency: FrequencyKind.monthly,
          occurrenceIndex: 1,
        ),
        date('2026-02-10'),
      );
      expect(
        calculateOccurrenceDueDate(
          firstDueDate: first,
          frequency: FrequencyKind.monthly,
          occurrenceIndex: 6,
        ),
        date('2026-07-10'),
      );
    });

    test('YEARLY advances one calendar year per index', () {
      final first = date('2026-05-15');
      expect(
        calculateOccurrenceDueDate(
          firstDueDate: first,
          frequency: FrequencyKind.yearly,
          occurrenceIndex: 3,
        ),
        date('2029-05-15'),
      );
    });

    test(
      'EVERY_N_MONTHS advances intervalMonths per index, from the anchor',
      () {
        final first = date('2026-01-31');
        expect(
          calculateOccurrenceDueDate(
            firstDueDate: first,
            frequency: FrequencyKind.everyNMonths,
            occurrenceIndex: 1,
            intervalMonths: 3,
          ),
          date('2026-04-30'), // April has 30 days
        );
        // Anchor day returns in a longer month — never cumulative drift.
        expect(
          calculateOccurrenceDueDate(
            firstDueDate: first,
            frequency: FrequencyKind.everyNMonths,
            occurrenceIndex: 2,
            intervalMonths: 3,
          ),
          date('2026-07-31'),
        );
      },
    );

    test('requires a positive integer intervalMonths for EVERY_N_MONTHS', () {
      for (final interval in [null, 0, -3]) {
        expect(
          () => calculateOccurrenceDueDate(
            firstDueDate: date('2026-01-31'),
            frequency: FrequencyKind.everyNMonths,
            occurrenceIndex: 1,
            intervalMonths: interval,
          ),
          throwsRangeError,
          reason: '$interval',
        );
      }
    });

    test('clamps day 31 to Feb 29 in leap years and Feb 28 otherwise', () {
      expect(
        calculateOccurrenceDueDate(
          firstDueDate: date('2024-01-31'),
          frequency: FrequencyKind.monthly,
          occurrenceIndex: 1,
        ),
        date('2024-02-29'),
      );
      expect(
        calculateOccurrenceDueDate(
          firstDueDate: date('2026-01-31'),
          frequency: FrequencyKind.monthly,
          occurrenceIndex: 1,
        ),
        date('2026-02-28'),
      );
    });

    test(
      'YEARLY Feb 29 anchor clamps to Feb 28 off-leap and returns on leap',
      () {
        final first = date('2024-02-29');
        expect(
          calculateOccurrenceDueDate(
            firstDueDate: first,
            frequency: FrequencyKind.yearly,
            occurrenceIndex: 1,
          ),
          date('2025-02-28'),
        );
        expect(
          calculateOccurrenceDueDate(
            firstDueDate: first,
            frequency: FrequencyKind.yearly,
            occurrenceIndex: 4,
          ),
          date('2028-02-29'),
        );
      },
    );
  });

  group('FrequencyKind wire parsing', () {
    test('round-trips every domain kind and rejects unknowns', () {
      for (final kind in FrequencyKind.values) {
        expect(FrequencyKind.parseWire(kind.wireName), kind);
      }
      expect(() => FrequencyKind.parseWire('WEEKLY'), throwsFormatException);
    });
  });
}
