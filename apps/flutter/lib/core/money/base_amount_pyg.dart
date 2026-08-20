import 'currency.dart';
import 'decimal_wire.dart';
import 'fx_rate.dart';
import 'money.dart';
import 'money_errors.dart';

/// Maximum integer digits of `baseAmountPyg`, derived from its
/// `decimal(18,0)` column (`MAX_BASE_AMOUNT_PYG_INTEGER_DIGITS`).
const int maxBaseAmountPygIntegerDigits = 18;

/// A PYG-integral base amount (`BaseAmountPygSchema`): non-negative, scale 0,
/// at most [maxBaseAmountPygIntegerDigits] digits. Every movement carries one
/// regardless of its own currency.
class BaseAmountPyg implements Comparable<BaseAmountPyg> {
  const BaseAmountPyg._(this.units);

  final BigInt units;

  static BaseAmountPyg parseWire(String wire) {
    final parsed = ParsedWireDecimal.parse(wire);
    if (parsed.scale != 0) {
      throw AmountCurrencyScaleException(
        'baseAmountPyg must be integral (PYG scale 0)',
        wire,
      );
    }
    return _checked(parsed.unscaled);
  }

  static BaseAmountPyg _checked(BigInt units) {
    if (units.toString().length > maxBaseAmountPygIntegerDigits) {
      throw BaseAmountPygOverflowException(
        'Computed baseAmountPyg exceeds the decimal(18,0) range',
      );
    }
    return BaseAmountPyg._(units);
  }

  /// ADR 0001, mirrored from `computeBaseAmountPyg` in
  /// `apps/api/src/transactions/money.ts`: for PYG the base amount is the
  /// amount itself; for USD it is `amount × fxRateToPyg` with a single
  /// half-up rounding step to integral PYG (`10.01 × 7350 = 73573.50` →
  /// `73574`). Overflow beyond `decimal(18,0)` throws
  /// [BaseAmountPygOverflowException] instead of truncating.
  ///
  /// Callers must have enforced the fx-presence rule already; a `null` rate
  /// for USD here is a caller bug and throws [FxRateRequirementException].
  static BaseAmountPyg compute({
    required Money amount,
    required FxRateToPyg? fxRateToPyg,
  }) {
    if (amount.currency == Currency.pyg) {
      return _checked(amount.minorUnits);
    }
    if (fxRateToPyg == null) {
      throw FxRateRequirementException(
        'USD transactions require fxRateToPyg to compute baseAmountPyg',
      );
    }
    // amount = minorUnits / 10^2, rate = unscaled / 10^scale. The exact
    // product has scale (2 + rate.scale); one half-up division drops it to
    // integral PYG — the contract's single rounding step.
    final product = amount.minorUnits * fxRateToPyg.unscaled;
    final rounded = divideByPowerOfTenHalfUp(
      product,
      amount.currency.scale + fxRateToPyg.scale,
    );
    return _checked(rounded);
  }

  String toWire() => units.toString();

  @override
  int compareTo(BaseAmountPyg other) => units.compareTo(other.units);

  @override
  bool operator ==(Object other) =>
      other is BaseAmountPyg && other.units == units;

  @override
  int get hashCode => units.hashCode;

  @override
  String toString() => 'BaseAmountPyg(${toWire()})';
}

/// A signed PYG-integral monthly balance (`MonthlyBalanceSchema`,
/// `^-?\d+$`): `incomeTotal - expenseTotal`, negative when a household spent
/// more than it received. Distinct from [BaseAmountPyg], which is always
/// non-negative.
class MonthlyBalancePyg {
  const MonthlyBalancePyg._(this.units);

  final BigInt units;

  static final RegExp _wirePattern = RegExp(r'^-?\d+$');

  static MonthlyBalancePyg parseWire(String wire) {
    if (!_wirePattern.hasMatch(wire)) {
      throw MoneyFormatException(
        'Monthly balance must be an optionally signed integral string',
        wire,
      );
    }
    return MonthlyBalancePyg._(BigInt.parse(wire));
  }

  bool get isNegative => units.isNegative;

  String toWire() => units.toString();

  @override
  bool operator ==(Object other) =>
      other is MonthlyBalancePyg && other.units == units;

  @override
  int get hashCode => units.hashCode;

  @override
  String toString() => 'MonthlyBalancePyg(${toWire()})';
}
