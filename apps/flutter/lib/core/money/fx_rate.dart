import 'decimal_wire.dart';
import 'money_errors.dart';

/// Maximum integer digits of `fxRateToBase`, derived from its `decimal(18,4)`
/// column (`MAX_FX_RATE_INTEGER_DIGITS` in `packages/contracts`).
const int maxFxRateIntegerDigits = 14;

/// An exact exchange rate to PYG, held as `unscaled / 10^scale` (FLT-006).
///
/// The Zod contract (`FxRateToBaseSchema`) bounds only the integer digits —
/// it does not cap the fractional digits even though the column is
/// `decimal(18,4)` — so this type preserves whatever scale the wire carried
/// and round-trips it exactly ("7350.0400" stays "7350.0400").
class FxRateToPyg {
  const FxRateToPyg._(this.unscaled, this.scale);

  final BigInt unscaled;
  final int scale;

  static FxRateToPyg parseWire(String wire) {
    final parsed = ParsedWireDecimal.parse(wire);
    if (parsed.exceedsIntegerDigits(maxFxRateIntegerDigits)) {
      throw AmountRangeException(
        'fxRateToBase must not exceed the decimal(18,4) range '
        '(max $maxFxRateIntegerDigits integer digits)',
        wire,
      );
    }
    return FxRateToPyg._(parsed.unscaled, parsed.scale);
  }

  /// Canonical wire form. Preserves the parsed scale, including trailing
  /// zeros, so a value read from the API is re-sent byte-identical (required
  /// by the offline queue's "persist the exact canonical request" rule).
  String toWire() {
    final digits = unscaled.toString();
    if (scale == 0) {
      return digits;
    }
    final padded = digits.padLeft(scale + 1, '0');
    final splitAt = padded.length - scale;
    return '${padded.substring(0, splitAt)}.${padded.substring(splitAt)}';
  }

  @override
  bool operator ==(Object other) {
    return other is FxRateToPyg &&
        other.unscaled == unscaled &&
        other.scale == scale;
  }

  @override
  int get hashCode => Object.hash(unscaled, scale);

  @override
  String toString() => 'FxRateToPyg(${toWire()})';
}
