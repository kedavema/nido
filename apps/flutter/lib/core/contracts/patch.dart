/// One field of a partial update (`PATCH`) request.
///
/// The `Update*RequestSchema`s in `packages/contracts` mark fields
/// `.optional()` and several of them `.nullable().optional()` — for those,
/// "absent" and "explicit null" mean different things: absent leaves the
/// stored value alone, `null` clears it. A plain `T?` field cannot express
/// that difference, so every patchable field is wrapped here instead.
class Patch<T extends Object> {
  /// The field is present in the request with [value] (possibly `null`, which
  /// clears it server-side — only legal for fields the contract marks
  /// `.nullable()`).
  const Patch.of(this.value) : isPresent = true;

  /// The field is omitted: the request carries no opinion about it.
  const Patch.absent() : value = null, isPresent = false;

  final T? value;
  final bool isPresent;

  /// Whether this patch explicitly clears the field.
  bool get clears => isPresent && value == null;

  @override
  bool operator ==(Object other) {
    return other is Patch<T> &&
        other.isPresent == isPresent &&
        other.value == value;
  }

  @override
  int get hashCode => Object.hash(isPresent, value);

  @override
  String toString() => isPresent ? 'Patch.of($value)' : 'Patch.absent()';
}
