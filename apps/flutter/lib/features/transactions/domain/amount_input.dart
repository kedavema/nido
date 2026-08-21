import '../../../core/money/currency.dart';
import '../../../core/money/fx_rate.dart';
import '../../../core/money/money.dart';
import 'movement_format.dart';

/// A partially-typed amount, kept deliberately separate from [Money]
/// (`docs/flutter-architecture.md` §Dinero: "UI conserva borradores parciales
/// como un tipo de input, separado de `Money` válido").
///
/// "45," and "" are legal things to have typed and illegal things to send, so
/// they live here as text and only become a [Money] once they parse. The
/// sanitizers are ported from `apps/mobile/src/utils/expense-form.ts` and
/// keep its exact behaviour: PYG accepts digits only (scale 0), USD accepts a
/// single Spanish decimal comma capped at 2 fraction digits (scale 2).
class AmountInput {
  const AmountInput._(this.currency, this.sanitized);

  /// A blank draft in [currency].
  const AmountInput.empty(this.currency) : sanitized = '';

  /// The currency the typed digits are denominated in.
  final Currency currency;

  /// The sanitized text as displayed, without thousands separators: digits
  /// for PYG, digits and at most one comma for USD.
  final String sanitized;

  bool get isEmpty => sanitized.isEmpty;

  /// Accepts raw keystrokes (or a paste) and keeps only what this currency
  /// can represent.
  AmountInput withRaw(String raw) =>
      AmountInput._(currency, _sanitize(raw, currency));

  /// Switches currency, re-sanitizing what was already typed rather than
  /// discarding it. Going USD → PYG drops the fraction, because a guaraní has
  /// no fractional unit; that loss is visible in the field immediately rather
  /// than at submit time.
  AmountInput withCurrency(Currency next) {
    if (next == currency) {
      return this;
    }
    final carried =
        next == Currency.pyg ? sanitized.split(',').first : sanitized;
    return AmountInput._(next, _sanitize(carried, next));
  }

  /// Restores a draft from a stored wire amount (opening the edit form).
  factory AmountInput.fromMoney(Money money) {
    return AmountInput._(
      money.currency,
      _sanitize(money.toWire().replaceFirst('.', ','), money.currency),
    );
  }

  /// The canonical wire decimal, or `null` while the draft is not one yet.
  String? get wire {
    if (sanitized.isEmpty) {
      return null;
    }
    final wire =
        currency == Currency.pyg ? sanitized : sanitized.replaceFirst(',', '.');
    // "45," and "," reach here as "45." and "." — typed, not yet a number.
    return wire.endsWith('.') || wire == '.' ? null : wire;
  }

  /// The validated amount, or `null` when the draft is empty, half-typed, or
  /// outside the contract's range. A non-null value is safe to send.
  Money? get money {
    final wire = this.wire;
    if (wire == null) {
      return null;
    }
    try {
      return Money.parseWire(currency: currency, amount: wire);
    } on FormatException {
      return null;
    }
  }

  /// "386.500" / "45,90" — grouped thousands for the big amount readout.
  String get display {
    if (sanitized.isEmpty) {
      return '';
    }
    return _formatGrouped(sanitized);
  }

  @override
  bool operator ==(Object other) =>
      other is AmountInput &&
      other.currency == currency &&
      other.sanitized == sanitized;

  @override
  int get hashCode => Object.hash(currency, sanitized);

  @override
  String toString() => 'AmountInput(${currency.wireName} $sanitized)';
}

/// A partially-typed exchange rate.
///
/// Deliberately not an [AmountInput] in PYG: `fxRateToBase` is a
/// `decimal(18,4)` column, so reusing the PYG sanitizer would silently strip
/// the comma and every fraction digit a user typed or a stored rate carried.
class FxRateInput {
  const FxRateInput._(this.sanitized);

  const FxRateInput.empty() : sanitized = '';

  final String sanitized;

  bool get isEmpty => sanitized.isEmpty;

  FxRateInput withRaw(String raw) =>
      FxRateInput._(_sanitizeDecimal(raw, maxFractionDigits: 4));

  /// Restores a draft from a stored rate, preserving its scale exactly (the
  /// wire form of `7350.0400` must survive a round-trip unchanged).
  factory FxRateInput.fromRate(FxRateToPyg rate) =>
      FxRateInput._(rate.toWire().replaceFirst('.', ','));

  String? get wire {
    if (sanitized.isEmpty) {
      return null;
    }
    final wire = sanitized.replaceFirst(',', '.');
    return wire.endsWith('.') || wire == '.' ? null : wire;
  }

  FxRateToPyg? get rate {
    final wire = this.wire;
    if (wire == null) {
      return null;
    }
    try {
      return FxRateToPyg.parseWire(wire);
    } on FormatException {
      return null;
    }
  }

  /// "7.350" / "7.350,0004".
  String get display => sanitized.isEmpty ? '' : _formatGrouped(sanitized);

  @override
  bool operator ==(Object other) =>
      other is FxRateInput && other.sanitized == sanitized;

  @override
  int get hashCode => sanitized.hashCode;

  @override
  String toString() => 'FxRateInput($sanitized)';
}

String _sanitize(String raw, Currency currency) {
  return currency == Currency.pyg
      ? _sanitizeIntegerDigits(raw)
      : _sanitizeDecimal(raw, maxFractionDigits: currency.scale);
}

/// Digits only, with leading zeros dropped — "0042" is 42, and "000" is 0.
String _sanitizeIntegerDigits(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^\d]'), '');
  return _stripLeadingZeros(digits);
}

/// Digits and a single Spanish decimal comma, capped at [maxFractionDigits].
String _sanitizeDecimal(String raw, {required int maxFractionDigits}) {
  final kept = raw.replaceAll(RegExp('[^0-9,]'), '');
  final firstComma = kept.indexOf(',');
  if (firstComma == -1) {
    return _stripLeadingZeros(kept);
  }
  final integerPart = _stripLeadingZeros(kept.substring(0, firstComma));
  final fractionPart = kept.substring(firstComma + 1).replaceAll(',', '');
  final capped =
      fractionPart.length > maxFractionDigits
          ? fractionPart.substring(0, maxFractionDigits)
          : fractionPart;
  // A comma typed first means "zero point …", not a bare fraction.
  return '${integerPart.isEmpty ? '0' : integerPart},$capped';
}

String _stripLeadingZeros(String digits) {
  final trimmed = digits.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  return trimmed;
}

/// Groups the integer part in thousands and leaves the fraction untouched.
String _formatGrouped(String sanitized) {
  final comma = sanitized.indexOf(',');
  if (comma == -1) {
    return formatPygMagnitude(sanitized);
  }
  final integerPart = sanitized.substring(0, comma);
  final fractionPart = sanitized.substring(comma + 1);
  final grouped = integerPart.isEmpty ? '0' : formatPygMagnitude(integerPart);
  return '$grouped,$fractionPart';
}
