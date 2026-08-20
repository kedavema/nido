/// Domain errors mirroring `apps/api/src/transactions/money.ts` so client-side
/// validation fails with the same distinctions the backend enforces.
library;

/// The string is not a canonical decimal amount per the wire contract
/// (`DecimalAmountSchema`): digits and at most one decimal point, no sign, no
/// exponential notation, no thousands separators.
class MoneyFormatException extends FormatException {
  MoneyFormatException(super.message, [super.source]);
}

/// The amount's decimal scale does not match its currency (PYG scale 0 or
/// USD scale 2, per ADR 0001).
class AmountCurrencyScaleException extends FormatException {
  AmountCurrencyScaleException(super.message, [super.source]);
}

/// The value's integer part exceeds the bound derived from its PostgreSQL
/// column precision (see `packages/contracts/src/transactions.ts`).
class AmountRangeException extends FormatException {
  AmountRangeException(super.message, [super.source]);
}

/// `fxRateToPyg` is present for a PYG movement, or absent for a USD movement.
class FxRateRequirementException implements Exception {
  FxRateRequirementException(this.message);

  final String message;

  @override
  String toString() => 'FxRateRequirementException: $message';
}

/// A computed `baseAmountPyg` would exceed the `decimal(18,0)` column range.
class BaseAmountPygOverflowException implements Exception {
  BaseAmountPygOverflowException(this.message);

  final String message;

  @override
  String toString() => 'BaseAmountPygOverflowException: $message';
}
