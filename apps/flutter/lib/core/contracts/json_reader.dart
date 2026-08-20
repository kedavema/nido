/// Strict JSON boundary reader (FLT-001/architecture §Modelos): raw
/// `Map<String, dynamic>` never leaves the parser — every DTO reads through
/// this and fails loudly, with a field path, on any contract mismatch.
class ContractViolationException extends FormatException {
  ContractViolationException(String field, String expectation)
    : super('Contract violation at `$field`: $expectation');
}

/// Wraps one decoded JSON object and exposes typed, validated readers.
class JsonReader {
  JsonReader._(this._values);

  final Map<String, Object?> _values;

  static JsonReader object(Object? json, [String field = r'$']) {
    if (json is! Map<String, Object?>) {
      throw ContractViolationException(field, 'expected a JSON object');
    }
    return JsonReader._(json);
  }

  Object? _require(String field) {
    if (!_values.containsKey(field)) {
      throw ContractViolationException(field, 'missing required field');
    }
    return _values[field];
  }

  String string(String field) {
    final value = _require(field);
    if (value is! String) {
      throw ContractViolationException(field, 'expected a string');
    }
    return value;
  }

  String? nullableString(String field) {
    final value = _require(field);
    if (value == null) {
      return null;
    }
    if (value is! String) {
      throw ContractViolationException(field, 'expected a string or null');
    }
    return value;
  }

  /// A field the contract marks `.optional()`: absent is allowed and means
  /// the same as null here.
  String? optionalString(String field) {
    final value = _values[field];
    if (value == null) {
      return null;
    }
    if (value is! String) {
      throw ContractViolationException(field, 'expected a string when present');
    }
    return value;
  }

  /// Non-money numbers only (percentages, counts). Amounts and fx rates are
  /// strings on the wire and must go through the money parsers instead.
  double number(String field) {
    final value = _require(field);
    if (value is! num) {
      throw ContractViolationException(field, 'expected a number');
    }
    return value.toDouble();
  }

  bool boolean(String field) {
    final value = _require(field);
    if (value is! bool) {
      throw ContractViolationException(field, 'expected a boolean');
    }
    return value;
  }

  /// The raw value of a required field, for nesting into another
  /// `fromJson(Object?)` parser.
  Object? raw(String field) => _require(field);

  JsonReader child(String field) => JsonReader.object(_require(field), field);

  JsonReader? nullableChild(String field) {
    final value = _require(field);
    if (value == null) {
      return null;
    }
    return JsonReader.object(value, field);
  }

  List<T> list<T>(String field, T Function(Object? element) map) {
    final value = _require(field);
    if (value is! List<Object?>) {
      throw ContractViolationException(field, 'expected an array');
    }
    return List.unmodifiable(value.map(map));
  }

  /// Parses a field with [parse], converting its [FormatException] into a
  /// [ContractViolationException] that names the field.
  T parse<T>(String field, T Function(String wire) parse) {
    final wire = string(field);
    try {
      return parse(wire);
    } on FormatException catch (error) {
      throw ContractViolationException(field, error.message);
    }
  }

  T? parseNullable<T>(String field, T Function(String wire) parse) {
    final wire = nullableString(field);
    if (wire == null) {
      return null;
    }
    try {
      return parse(wire);
    } on FormatException catch (error) {
      throw ContractViolationException(field, error.message);
    }
  }
}

final RegExp _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

/// Validates a UUID (`UuidSchema`). Returned as an opaque validated string —
/// ids are never interpreted client-side.
String parseUuid(String wire) {
  if (!_uuidPattern.hasMatch(wire)) {
    throw FormatException('Not a UUID', wire);
  }
  return wire;
}

/// Mirrors `z.string().trim().min(x).max(y)`: Zod's `.trim()` transforms
/// (trims, then validates), so this trims first and bounds-checks the
/// trimmed value, returning it — the same value the server would persist.
String parseTrimmedText(String wire, {required int min, required int max}) {
  final trimmed = wire.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw FormatException(
      'Text length must be within $min..$max after trimming',
      wire,
    );
  }
  return trimmed;
}

/// Mirrors a plain `z.string().min(x).max(y)` (no `.trim()`), e.g.
/// `displayName` — surrounding whitespace is contract-legal there.
String parseBoundedText(String wire, {required int min, required int max}) {
  if (wire.length < min || wire.length > max) {
    throw FormatException('Text length must be within $min..$max', wire);
  }
  return wire;
}
