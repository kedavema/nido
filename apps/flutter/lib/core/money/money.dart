import 'currency.dart';
import 'decimal_wire.dart';
import 'money_errors.dart';

/// Maximum integer digits of an `amount`, derived from its `decimal(18,2)`
/// column (`MAX_AMOUNT_INTEGER_DIGITS` in `packages/contracts`).
const int maxAmountIntegerDigits = 16;

/// An exact monetary amount: a currency plus minor units held as [BigInt]
/// (FLT-006). PYG minor unit = 1 guaraní (scale 0); USD minor unit = 1 cent
/// (scale 2). Immutable, never negative (the wire contract admits no sign),
/// never a `double`.
class Money implements Comparable<Money> {
  const Money._(this.currency, this.minorUnits);

  final Currency currency;
  final BigInt minorUnits;

  /// Parses a wire amount (`AmountSchema` + the currency-scale cross-field
  /// rule from `checkAmountCurrencyAndFxRate`): canonical decimal syntax,
  /// PYG integral / USD at most 2 decimals, and at most
  /// [maxAmountIntegerDigits] integer digits.
  static Money parseWire({required Currency currency, required String amount}) {
    final parsed = ParsedWireDecimal.parse(amount);

    if (parsed.scale > currency.scale) {
      throw AmountCurrencyScaleException(
        currency == Currency.pyg
            ? 'PYG amounts must be integral (scale 0)'
            : 'USD amounts must have at most 2 decimals (scale 2)',
        amount,
      );
    }
    if (parsed.exceedsIntegerDigits(maxAmountIntegerDigits)) {
      throw AmountRangeException(
        'amount must not exceed the decimal(18,2) range '
        '(max $maxAmountIntegerDigits integer digits)',
        amount,
      );
    }

    // Normalize to the currency's full scale: USD "10.5" -> 1050 cents.
    final rescale = BigInt.from(10).pow(currency.scale - parsed.scale);
    return Money._(currency, parsed.unscaled * rescale);
  }

  /// Builds a [Money] directly from minor units (e.g. from arithmetic).
  /// Rejects negatives — the wire contract cannot represent them.
  factory Money.ofMinorUnits(Currency currency, BigInt minorUnits) {
    if (minorUnits.isNegative) {
      throw AmountRangeException(
        'Money cannot be negative on the wire contract',
        minorUnits.toString(),
      );
    }
    return Money._(currency, minorUnits);
  }

  bool get isZero => minorUnits == BigInt.zero;

  Money operator +(Money other) {
    _requireSameCurrency(other);
    return Money._(currency, minorUnits + other.minorUnits);
  }

  /// Subtraction never crosses zero: wire amounts are unsigned, so a negative
  /// result is a caller bug, not a representable value.
  Money operator -(Money other) {
    _requireSameCurrency(other);
    final result = minorUnits - other.minorUnits;
    if (result.isNegative) {
      throw AmountRangeException(
        'Money subtraction would produce a negative amount',
        result.toString(),
      );
    }
    return Money._(currency, result);
  }

  void _requireSameCurrency(Money other) {
    if (currency != other.currency) {
      throw ArgumentError(
        'Cannot combine ${currency.wireName} with ${other.currency.wireName}',
      );
    }
  }

  /// Serializes back to the canonical wire form, re-checking the column
  /// bound so arithmetic overflow cannot silently leave the client. PYG
  /// emits an integral string ("150000"); USD always emits 2 decimals
  /// ("10.50"), which the backend's `USD_SCALE_REGEX` accepts.
  String toWire() {
    final digits = minorUnits.toString();
    final String wire;
    if (currency.scale == 0) {
      wire = digits;
    } else {
      final padded = digits.padLeft(currency.scale + 1, '0');
      final splitAt = padded.length - currency.scale;
      wire = '${padded.substring(0, splitAt)}.${padded.substring(splitAt)}';
    }
    final parsed = ParsedWireDecimal.parse(wire);
    if (parsed.exceedsIntegerDigits(maxAmountIntegerDigits)) {
      throw AmountRangeException(
        'amount must not exceed the decimal(18,2) range '
        '(max $maxAmountIntegerDigits integer digits)',
        wire,
      );
    }
    return wire;
  }

  @override
  int compareTo(Money other) {
    _requireSameCurrency(other);
    return minorUnits.compareTo(other.minorUnits);
  }

  @override
  bool operator ==(Object other) {
    return other is Money &&
        other.currency == currency &&
        other.minorUnits == minorUnits;
  }

  @override
  int get hashCode => Object.hash(currency, minorUnits);

  @override
  String toString() => 'Money(${currency.wireName} ${toWire()})';
}
