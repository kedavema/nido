import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/money/fx_rate.dart';
import 'package:nido/core/money/money.dart';
import 'package:nido/features/transactions/domain/amount_input.dart';

/// Vectors ported from `apps/mobile/src/utils/expense-form.test.ts`, plus the
/// ones that only matter once the draft is a type rather than a string.
void main() {
  group('AmountInput · PYG (scale 0)', () {
    const empty = AmountInput.empty(Currency.pyg);

    test('keeps digits only and strips leading zeros', () {
      expect(empty.withRaw('386.500').sanitized, '386500');
      expect(empty.withRaw('0042').sanitized, '42');
      expect(empty.withRaw('').sanitized, '');
      // A lone zero survives: it is a legal thing to have typed, and
      // rejecting it is the draft's job, not the sanitizer's.
      expect(empty.withRaw('000').sanitized, '0');
    });

    test('a comma cannot introduce a fraction a guaraní does not have', () {
      expect(empty.withRaw('45,90').sanitized, '4590');
    });

    test('groups thousands for display but sends the plain decimal', () {
      final input = empty.withRaw('386500');
      expect(input.display, '386.500');
      expect(input.wire, '386500');
      expect(
        input.money,
        Money.parseWire(currency: Currency.pyg, amount: '386500'),
      );
    });
  });

  group('AmountInput · USD (scale 2)', () {
    const empty = AmountInput.empty(Currency.usd);

    test('allows a single comma and caps the fraction at 2 digits', () {
      expect(empty.withRaw('45,905').sanitized, '45,90');
      expect(empty.withRaw('4,5,9').sanitized, '4,59');
      expect(empty.withRaw('45').sanitized, '45');
      // A leading comma reads as "zero point …".
      expect(empty.withRaw(',9').sanitized, '0,9');
    });

    test('converts the comma to the contract decimal point on the wire', () {
      expect(empty.withRaw('45,90').wire, '45.90');
      expect(empty.withRaw('45').wire, '45');
    });

    test('a half-typed amount is not yet money', () {
      final halfTyped = empty.withRaw('45,');
      expect(halfTyped.sanitized, '45,');
      expect(halfTyped.display, '45,');
      // The crux of keeping the draft separate from Money: "45," is a legal
      // thing to be looking at and an illegal thing to send.
      expect(halfTyped.wire, isNull);
      expect(halfTyped.money, isNull);
    });

    test('an amount past the decimal(18,2) range never becomes money', () {
      final tooBig = empty.withRaw('9' * 17);
      expect(tooBig.sanitized, '9' * 17);
      expect(tooBig.money, isNull);
      // One digit fewer is exactly at the column bound and does parse.
      expect(empty.withRaw('9' * 16).money, isNotNull);
    });
  });

  group('AmountInput · switching currency', () {
    test('USD → PYG drops the fraction, visibly and immediately', () {
      final usd = const AmountInput.empty(Currency.usd).withRaw('45,90');
      final pyg = usd.withCurrency(Currency.pyg);

      expect(pyg.currency, Currency.pyg);
      expect(pyg.sanitized, '45');
      expect(pyg.display, '45');
    });

    test('PYG → USD keeps every digit typed so far', () {
      final pyg = const AmountInput.empty(Currency.pyg).withRaw('386500');
      final usd = pyg.withCurrency(Currency.usd);

      expect(usd.currency, Currency.usd);
      expect(usd.sanitized, '386500');
      expect(usd.money?.toWire(), '386500.00');
    });

    test('switching to the same currency changes nothing', () {
      final input = const AmountInput.empty(Currency.usd).withRaw('45,90');
      expect(input.withCurrency(Currency.usd), input);
    });
  });

  group('AmountInput · seeding from a stored amount', () {
    test('a USD amount opens the edit form with its comma form', () {
      final input = AmountInput.fromMoney(
        Money.parseWire(currency: Currency.usd, amount: '45.9'),
      );
      expect(input.sanitized, '45,90');
      expect(input.display, '45,90');
      expect(input.wire, '45.90');
    });

    test('a PYG amount opens grouped and round-trips unchanged', () {
      final input = AmountInput.fromMoney(
        Money.parseWire(currency: Currency.pyg, amount: '9500000'),
      );
      expect(input.display, '9.500.000');
      expect(input.wire, '9500000');
    });
  });

  group('FxRateInput', () {
    const empty = FxRateInput.empty();

    test('caps the fraction at 4 digits, unlike a PYG amount', () {
      expect(empty.withRaw('7350').sanitized, '7350');
      expect(empty.withRaw('7350,00045').sanitized, '7350,0004');
      expect(empty.withRaw('7,3,50').sanitized, '7,350');
      expect(empty.withRaw(',5').sanitized, '0,5');
    });

    test('groups thousands and preserves the fraction for display', () {
      expect(empty.withRaw('7350').display, '7.350');
      expect(empty.withRaw('7350,5').display, '7.350,5');
      expect(empty.withRaw('7350,0004').display, '7.350,0004');
    });

    test(
      'round-trips a stored rate byte-for-byte, trailing zeros included',
      () {
        final input = FxRateInput.fromRate(FxRateToPyg.parseWire('7350.0400'));
        expect(input.sanitized, '7350,0400');
        expect(input.display, '7.350,0400');
        // The offline queue's "persist the exact canonical request" rule needs
        // the scale to survive the trip through the form.
        expect(input.wire, '7350.0400');
      },
    );

    test('a half-typed rate is not yet a rate', () {
      expect(empty.withRaw('7350,').rate, isNull);
      expect(empty.isEmpty, isTrue);
      expect(empty.rate, isNull);
    });
  });
}
