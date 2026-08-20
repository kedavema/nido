/// Currencies supported by the Nido backend (`SUPPORTED_CURRENCY_CODES` in
/// `packages/domain-types`).
///
/// ADR 0001 / FLT-006: every amount crosses the wire as a decimal string with a
/// currency-specific scale — PYG has no fractional unit (scale 0) and USD has
/// cents (scale 2). `double` is never used for money.
enum Currency {
  pyg(wireName: 'PYG', scale: 0),
  usd(wireName: 'USD', scale: 2);

  const Currency({required this.wireName, required this.scale});

  /// Wire value used by the API (`currency` fields).
  final String wireName;

  /// Number of decimal digits in this currency's minor unit.
  final int scale;

  static Currency parseWire(String wire) {
    for (final currency in Currency.values) {
      if (currency.wireName == wire) {
        return currency;
      }
    }
    throw FormatException('Unsupported currency: $wire');
  }
}
