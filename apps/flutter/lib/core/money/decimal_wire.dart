import 'money_errors.dart';

/// Canonical wire decimal syntax per `DecimalAmountSchema` in
/// `packages/contracts/src/transactions.ts`: `^\d+(\.\d+)?$`. No sign, no
/// exponent, no separators, no `NaN`/`Infinity`, and both sides of the point
/// must be non-empty (`"12."`, `".5"` and `""` are all rejected).
final RegExp _canonicalDecimal = RegExp(r'^\d+(\.\d+)?$');

/// A wire decimal string decomposed into exact integer arithmetic form:
/// `unscaled / 10^scale`. `unscaled` keeps trailing zeros ("7350.0400" parses
/// to unscaled 73500400, scale 4) so round-trips preserve the wire's scale.
class ParsedWireDecimal {
  ParsedWireDecimal._(this.unscaled, this.scale, this.integerDigits);

  final BigInt unscaled;
  final int scale;

  /// Digits of the integer part with leading zeros stripped (minimum "0"),
  /// used for the column-derived integer-digit bounds.
  final String integerDigits;

  static ParsedWireDecimal parse(String wire) {
    if (!_canonicalDecimal.hasMatch(wire)) {
      throw MoneyFormatException(
        'Not a canonical wire decimal (digits with at most one decimal '
        'point, no sign/exponent/separators)',
        wire,
      );
    }

    final parts = wire.split('.');
    final integerPart = parts[0];
    final fractionPart = parts.length == 2 ? parts[1] : '';
    final stripped = integerPart.replaceFirst(RegExp(r'^0+(?=\d)'), '');

    return ParsedWireDecimal._(
      BigInt.parse(integerPart + fractionPart),
      fractionPart.length,
      stripped,
    );
  }

  /// Whether the integer part exceeds `maxIntegerDigits` — the same
  /// all-nines bound `exceedsMaxIntegerDigits` uses in the Zod contracts.
  bool exceedsIntegerDigits(int maxIntegerDigits) {
    return integerDigits.length > maxIntegerDigits;
  }
}

/// Divides [dividend] by `10^[scaleToDrop]` rounding half-up once, mirroring
/// `ROUND_HALF_UP` in `apps/api/src/transactions/money.ts`. Inputs are always
/// non-negative on this wire (amounts and fx rates carry no sign).
BigInt divideByPowerOfTenHalfUp(BigInt dividend, int scaleToDrop) {
  assert(!dividend.isNegative, 'wire amounts are never negative');
  if (scaleToDrop == 0) {
    return dividend;
  }
  final divisor = BigInt.from(10).pow(scaleToDrop);
  final quotient = dividend ~/ divisor;
  final remainder = dividend.remainder(divisor);
  // Half-up: round away from zero when the remainder is at least half the
  // divisor. `remainder * 2 >= divisor` avoids any fractional intermediate.
  if (remainder * BigInt.two >= divisor) {
    return quotient + BigInt.one;
  }
  return quotient;
}
