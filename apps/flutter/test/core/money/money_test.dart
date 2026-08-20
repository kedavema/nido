import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/money/base_amount_pyg.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/money/fx_rate.dart';
import 'package:nido/core/money/money.dart';
import 'package:nido/core/money/money_errors.dart';

void main() {
  group('Money.parseWire', () {
    test('parses integral PYG into guaraní minor units', () {
      final money = Money.parseWire(currency: Currency.pyg, amount: '150000');
      expect(money.currency, Currency.pyg);
      expect(money.minorUnits, BigInt.from(150000));
      expect(money.toWire(), '150000');
    });

    test('parses USD at scale 2 into cents', () {
      final money = Money.parseWire(currency: Currency.usd, amount: '10.01');
      expect(money.minorUnits, BigInt.from(1001));
      expect(money.toWire(), '10.01');
    });

    test('normalizes 1-decimal USD to full cent scale', () {
      final money = Money.parseWire(currency: Currency.usd, amount: '10.5');
      expect(money.minorUnits, BigInt.from(1050));
      expect(money.toWire(), '10.50');
    });

    test('parses integral USD', () {
      final money = Money.parseWire(currency: Currency.usd, amount: '10');
      expect(money.minorUnits, BigInt.from(1000));
      expect(money.toWire(), '10.00');
    });

    test('parses zero for both currencies', () {
      expect(
        Money.parseWire(currency: Currency.pyg, amount: '0').isZero,
        isTrue,
      );
      expect(
        Money.parseWire(currency: Currency.usd, amount: '0.00').isZero,
        isTrue,
      );
    });

    test('accepts the largest contractual amount (16 integer digits)', () {
      final money = Money.parseWire(
        currency: Currency.usd,
        amount: '9999999999999999.99',
      );
      expect(money.toWire(), '9999999999999999.99');
    });

    test('rejects amounts exceeding 16 integer digits', () {
      expect(
        () => Money.parseWire(
          currency: Currency.pyg,
          amount: '10000000000000000',
        ),
        throwsA(isA<AmountRangeException>()),
      );
    });

    test('ignores leading zeros for the integer-digit bound', () {
      final money = Money.parseWire(
        currency: Currency.pyg,
        amount: '009999999999999999',
      );
      expect(money.toWire(), '9999999999999999');
    });

    test('rejects fractional PYG (scale 0)', () {
      for (final wire in ['10.0', '10.5', '0.1']) {
        expect(
          () => Money.parseWire(currency: Currency.pyg, amount: wire),
          throwsA(isA<AmountCurrencyScaleException>()),
          reason: wire,
        );
      }
    });

    test('rejects USD with more than 2 decimals', () {
      expect(
        () => Money.parseWire(currency: Currency.usd, amount: '10.001'),
        throwsA(isA<AmountCurrencyScaleException>()),
      );
    });

    test('rejects every non-canonical decimal syntax', () {
      for (final wire in [
        '',
        ' 10',
        '10 ',
        '-5',
        '+5',
        '1e3',
        '1E3',
        '1,000',
        'NaN',
        'Infinity',
        '.',
        '12.',
        '.5',
        '1.2.3',
        '0x10',
      ]) {
        expect(
          () => Money.parseWire(currency: Currency.usd, amount: wire),
          throwsA(isA<MoneyFormatException>()),
          reason: '`$wire` must be rejected',
        );
      }
    });
  });

  group('Money arithmetic', () {
    Money pyg(String wire) =>
        Money.parseWire(currency: Currency.pyg, amount: wire);
    Money usd(String wire) =>
        Money.parseWire(currency: Currency.usd, amount: wire);

    test('adds and subtracts exactly in minor units', () {
      expect((usd('10.05') + usd('0.95')).toWire(), '11.00');
      expect((pyg('150000') - pyg('50000')).toWire(), '100000');
    });

    test('rejects negative subtraction results (wire has no sign)', () {
      expect(
        () => pyg('100') - pyg('101'),
        throwsA(isA<AmountRangeException>()),
      );
    });

    test('rejects mixed-currency arithmetic and comparison', () {
      expect(() => pyg('1') + usd('1.00'), throwsArgumentError);
      expect(() => pyg('1').compareTo(usd('1.00')), throwsArgumentError);
    });

    test('re-checks the column bound when serializing arithmetic results', () {
      final max = pyg('9999999999999999');
      expect(
        () => (max + pyg('1')).toWire(),
        throwsA(isA<AmountRangeException>()),
      );
    });

    test('value equality and ordering', () {
      expect(usd('10.50'), usd('10.5'));
      expect(usd('10.49').compareTo(usd('10.50')), lessThan(0));
    });
  });

  group('FxRateToPyg', () {
    test('preserves the wire scale exactly, including trailing zeros', () {
      expect(FxRateToPyg.parseWire('7350').toWire(), '7350');
      expect(FxRateToPyg.parseWire('7350.0400').toWire(), '7350.0400');
      expect(FxRateToPyg.parseWire('0.0001').toWire(), '0.0001');
    });

    test('rejects rates exceeding 14 integer digits', () {
      expect(
        FxRateToPyg.parseWire('99999999999999.9999').toWire(),
        '99999999999999.9999',
      );
      expect(
        () => FxRateToPyg.parseWire('100000000000000'),
        throwsA(isA<AmountRangeException>()),
      );
    });

    test('rejects non-canonical syntax', () {
      for (final wire in ['-7350', '7,350', '7e3', '']) {
        expect(
          () => FxRateToPyg.parseWire(wire),
          throwsA(isA<MoneyFormatException>()),
          reason: wire,
        );
      }
    });
  });

  group('BaseAmountPyg.compute (ADR 0001 semantics)', () {
    Money usd(String wire) =>
        Money.parseWire(currency: Currency.usd, amount: wire);

    BaseAmountPyg compute(String amount, String fx) {
      return BaseAmountPyg.compute(
        amount: usd(amount),
        fxRateToPyg: FxRateToPyg.parseWire(fx),
      );
    }

    test('PYG base amount is the amount itself', () {
      final base = BaseAmountPyg.compute(
        amount: Money.parseWire(currency: Currency.pyg, amount: '150000'),
        fxRateToPyg: null,
      );
      expect(base.toWire(), '150000');
    });

    test('backend documentation vector: 10.01 × 7350 = 73573.50 → 73574', () {
      expect(compute('10.01', '7350').toWire(), '73574');
    });

    test('half-up boundary: exactly .50 rounds up, below .50 rounds down', () {
      expect(compute('0.01', '50').toWire(), '1'); // 0.500 → 1
      expect(compute('0.01', '49').toWire(), '0'); // 0.490 → 0
      expect(compute('0.01', '51').toWire(), '1'); // 0.510 → 1
    });

    test(
      'single rounding step: no intermediate precision loss on large inputs',
      () {
        // 16 integer digits + 2 decimals times 14 integer digits + 4 decimals
        // needs ~36 significant digits — the case the backend clones Decimal
        // with precision 50 for. BigInt arithmetic is exact by construction,
        // but overflow of decimal(18,0) must still be rejected.
        expect(
          () => compute('9999999999999999.99', '99999999999999.9999'),
          throwsA(isA<BaseAmountPygOverflowException>()),
        );
      },
    );

    test('exact large product that fits the column', () {
      // 123456789.99 × 8104.3210 = 1000533455708.546790 → half-up 1000533455709
      expect(compute('123456789.99', '8104.3210').toWire(), '1000533455709');
    });

    test('zero amount and zero rate produce zero', () {
      expect(compute('0.00', '7350').toWire(), '0');
      expect(compute('10.00', '0').toWire(), '0');
    });

    test('USD without a rate is a caller bug, not silent PYG passthrough', () {
      expect(
        () => BaseAmountPyg.compute(amount: usd('10.00'), fxRateToPyg: null),
        throwsA(isA<FxRateRequirementException>()),
      );
    });
  });

  group('BaseAmountPyg.parseWire', () {
    test('parses integral values up to 18 digits', () {
      expect(BaseAmountPyg.parseWire('0').toWire(), '0');
      expect(
        BaseAmountPyg.parseWire('999999999999999999').toWire(),
        '999999999999999999',
      );
    });

    test('rejects fractional, signed and oversized values', () {
      expect(
        () => BaseAmountPyg.parseWire('1.5'),
        throwsA(isA<AmountCurrencyScaleException>()),
      );
      expect(
        () => BaseAmountPyg.parseWire('-1'),
        throwsA(isA<MoneyFormatException>()),
      );
      expect(
        () => BaseAmountPyg.parseWire('1000000000000000000'),
        throwsA(isA<BaseAmountPygOverflowException>()),
      );
    });
  });

  group('MonthlyBalancePyg', () {
    test('accepts signed integral balances', () {
      expect(MonthlyBalancePyg.parseWire('-125000').isNegative, isTrue);
      expect(MonthlyBalancePyg.parseWire('-125000').toWire(), '-125000');
      expect(MonthlyBalancePyg.parseWire('0').isNegative, isFalse);
    });

    test('rejects non-integral or malformed balances', () {
      for (final wire in ['-', '5.0', '--5', '+5', '']) {
        expect(
          () => MonthlyBalancePyg.parseWire(wire),
          throwsA(isA<MoneyFormatException>()),
          reason: wire,
        );
      }
    });
  });
}
