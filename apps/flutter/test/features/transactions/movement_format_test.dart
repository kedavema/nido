import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/time/local_date.dart';
import 'package:nido/core/time/year_month.dart';
import 'package:nido/features/transactions/domain/movement_format.dart';
import 'package:nido/testing/finance_fakes.dart';

final LocalDate today = LocalDate(2026, 8, 15);

void main() {
  group('formatPygMagnitude', () {
    test('groups thousands from the right', () {
      expect(formatPygMagnitude('0'), '0');
      expect(formatPygMagnitude('999'), '999');
      expect(formatPygMagnitude('1000'), '1.000');
      expect(formatPygMagnitude('386500'), '386.500');
      expect(formatPygMagnitude('9500000'), '9.500.000');
      // decimal(18,0) can hold more than a double can count.
      expect(
        formatPygMagnitude('999999999999999999'),
        '999.999.999.999.999.999',
      );
    });
  });

  group('day headings', () {
    test('today and yesterday are named, older days are dated', () {
      expect(formatDayHeading(today, today), 'HOY · SÁB 15');
      expect(formatDayHeading(LocalDate(2026, 8, 14), today), 'AYER · VIE 14');
      expect(formatDayHeading(LocalDate(2026, 7, 1), today), 'MIÉ 1 JUL');
    });

    test('crossing a month boundary still resolves "ayer"', () {
      final firstOfMonth = LocalDate(2026, 8, 1);
      expect(
        formatDayHeading(LocalDate(2026, 7, 31), firstOfMonth),
        'AYER · VIE 31',
      );
    });
  });

  group('date labels', () {
    test('the full local date reads in lowercase Spanish', () {
      expect(formatFullLocalDate(LocalDate(2026, 7, 15)), 'mié 15 jul 2026');
      expect(formatLocalDateWithoutYear(LocalDate(2026, 7, 15)), 'mié 15 jul');
    });

    test('the recent-movement caption collapses to hoy/ayer', () {
      expect(formatRecentMovementDateLabel(today, today), 'hoy');
      expect(
        formatRecentMovementDateLabel(LocalDate(2026, 8, 14), today),
        'ayer',
      );
      expect(
        formatRecentMovementDateLabel(LocalDate(2026, 7, 1), today),
        '1 jul',
      );
    });

    test('times are read in America/Asuncion, never the device zone', () {
      // 18:30Z is 15:30 in Asunción (UTC-3).
      expect(formatOccurredAtTime(DateTime.utc(2026, 8, 15, 18, 30)), '15:30');
      // Crossing back over midnight UTC lands on the previous local day.
      expect(formatOccurredAtTime(DateTime.utc(2026, 8, 16, 1, 5)), '22:05');
    });

    test('the hero timestamp names the day and drops the year', () {
      expect(
        formatMovementTimestamp(
          buildTransaction(occurredAt: '2026-08-15T12:12:00.000Z'),
          today,
        ),
        'hoy · sáb 15 ago, 9:12',
      );
      expect(
        formatMovementTimestamp(
          buildTransaction(
            localDate: '2026-08-14',
            occurredAt: '2026-08-14T12:12:00.000Z',
          ),
          today,
        ),
        'ayer · vie 14 ago, 9:12',
      );
    });
  });

  group('amounts', () {
    test('an expense is negative and an income positive, in base PYG', () {
      final expense = formatTransactionAmount(buildTransaction());
      expect(expense.text, '−Gs. 150.000');
      expect(expense.isPositive, isFalse);

      final income = formatTransactionAmount(
        buildTransaction(
          type: TransactionType.income,
          amount: '9500000',
          categoryId: incomeRootId,
        ),
      );
      expect(income.text, '+Gs. 9.500.000');
      expect(income.isPositive, isTrue);
    });

    test('a USD movement is still shown at its base-PYG value', () {
      // Rows report in the household's base currency; the original USD
      // amount goes in the subtitle, not here.
      final usd = formatTransactionAmount(
        buildTransaction(
          currency: Currency.usd,
          amount: '10.01',
          fxRateToBase: '7350',
        ),
      );
      expect(usd.text, '−Gs. 73.574');
    });

    test('a day subtotal nets income against expense on BigInt', () {
      final net = sumDailyNetBaseAmountPyg([
        buildTransaction(id: _id(1)),
        buildTransaction(
          id: _id(2),
          type: TransactionType.income,
          amount: '9500000',
          categoryId: incomeRootId,
        ),
      ]);

      expect(net, BigInt.parse('9350000'));
      expect(formatSignedPygAmount(net).text, '+Gs. 9.350.000');
      expect(
        formatSignedPygAmount(BigInt.parse('-1111365')).text,
        '−Gs. 1.111.365',
      );
      expect(formatSignedPygAmount(BigInt.zero).isPositive, isTrue);
    });

    test('formatDecimalEs re-punctuates without rounding', () {
      expect(formatDecimalEs('45.9', 2), '45,90');
      expect(formatDecimalEs('7350', 0), '7.350');
      expect(formatDecimalEs('7350.0004', 0), '7.350');
      expect(formatDecimalEs('1234567.89', 2), '1.234.567,89');
    });
  });

  group('grouping', () {
    test('days come newest first, and each day newest movement first', () {
      final groups = groupTransactionsByDay([
        buildTransaction(
          id: _id(1),
          localDate: '2026-08-14',
          occurredAt: '2026-08-14T10:00:00.000Z',
        ),
        buildTransaction(
          id: _id(2),
          localDate: '2026-08-15',
          occurredAt: '2026-08-15T09:00:00.000Z',
        ),
        buildTransaction(
          id: _id(3),
          localDate: '2026-08-15',
          occurredAt: '2026-08-15T18:00:00.000Z',
        ),
      ]);

      expect(groups.map((group) => group.localDate.toWire()), [
        '2026-08-15',
        '2026-08-14',
      ]);
      expect(groups.first.transactions.map((t) => t.id), [_id(3), _id(2)]);
      expect(groups.first.netBaseAmountPyg, BigInt.parse('-300000'));
    });

    test('an empty month groups to nothing', () {
      expect(groupTransactionsByDay(const []), isEmpty);
    });
  });

  group('month labels', () {
    test('the selector names the month and year', () {
      expect(formatMonthLabel(YearMonth(2026, 7)), 'Julio 2026');
      expect(formatMonthNameOnly(YearMonth(2026, 7)), 'julio');
    });
  });
}

String _id(int n) => '00000000-0000-4000-8000-00000000000$n';
