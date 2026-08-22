import '../../../core/contracts/categories.dart';
import '../../../core/contracts/patch.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/money/base_amount_pyg.dart';
import '../../../core/money/currency.dart';
import '../../../core/time/local_date.dart';
import '../../../core/time/wire_instant.dart';
import '../../categories/domain/category_tree.dart';
import 'amount_input.dart';

/// Recency window for the "recientes" category chips, per the design's own
/// stated default.
const int recentCategoryWindowDays = 90;

/// The design shows three quick chips for categories and for payment sources.
const int quickChipLimit = 3;

/// Why a draft cannot be submitted yet. Each value maps to one field, so the
/// form can point at the control that needs attention instead of showing a
/// single opaque "revisá los datos".
enum DraftProblem {
  /// Nothing typed in the amount field.
  amountMissing,

  /// Typed, but not a legal amount for this currency (half-typed, or past the
  /// `decimal(18,2)` range).
  amountInvalid,

  /// Zero. FLT-017: rejected for every movement kind, uniformly — the legacy
  /// forms disagreed with each other about this.
  amountZero,

  /// USD without an exchange rate. The contract requires one
  /// (`checkAmountCurrencyAndFxRate`), and without it `baseAmountPyg` cannot
  /// be computed at all.
  fxRateMissing,

  /// Typed, but not a legal `decimal(18,4)` rate.
  fxRateInvalid,

  /// Zero rate: it would make every USD movement worth nothing in base PYG.
  fxRateZero,

  /// No category chosen. `categoryId` is non-nullable on the wire.
  categoryMissing,

  /// An expense with no merchant. `TransactionDescriptionSchema` requires a
  /// non-empty string, and the list prints it as the row title.
  descriptionMissing,
}

/// The in-progress state of the new/edit movement form.
///
/// Holds *inputs*, not contract values: [amount] and [fxRate] are partial
/// text until they parse (see [AmountInput]). [validate] is the single place
/// that decides whether the draft is submittable, and [toCreateRequest] /
/// [toUpdateRequest] are the only ways it becomes a request — so no screen
/// can assemble a payload that skipped the checks.
class TransactionDraft {
  const TransactionDraft({
    required this.type,
    required this.amount,
    required this.fxRate,
    required this.categoryId,
    required this.paymentSourceId,
    required this.localDate,
    required this.occurredAt,
    required this.description,
    required this.notes,
  });

  /// A blank draft dated today.
  factory TransactionDraft.blank({
    required LocalDate todayLocal,
    required DateTime Function() now,
    TransactionType type = TransactionType.expense,
    Currency currency = Currency.pyg,
  }) {
    return TransactionDraft(
      type: type,
      amount: AmountInput.empty(currency),
      fxRate: const FxRateInput.empty(),
      categoryId: null,
      paymentSourceId: null,
      localDate: todayLocal,
      occurredAt: localDateToOccurredAt(
        picked: todayLocal,
        todayLocal: todayLocal,
        now: now,
      ),
      description: '',
      notes: '',
    );
  }

  /// A draft seeded from a stored movement, for the edit form.
  factory TransactionDraft.fromTransaction(Transaction transaction) {
    final rate = transaction.fxRateToPyg;
    return TransactionDraft(
      type: transaction.type,
      amount: AmountInput.fromMoney(transaction.amount),
      fxRate:
          rate == null ? const FxRateInput.empty() : FxRateInput.fromRate(rate),
      categoryId: transaction.categoryId,
      paymentSourceId: transaction.paymentSourceId,
      localDate: transaction.localDate,
      // Kept exactly as stored: re-deriving it would move the movement's
      // timestamp every time someone opened the form to fix a typo.
      occurredAt: WireInstant.toWire(transaction.occurredAt),
      description: transaction.description,
      notes: transaction.notes ?? '',
    );
  }

  final TransactionType type;
  final AmountInput amount;
  final FxRateInput fxRate;
  final String? categoryId;
  final String? paymentSourceId;
  final LocalDate localDate;

  /// Already a wire instant: built by [localDateToOccurredAt] when the date
  /// changes, so the 15:00Z backdating rule is applied exactly once.
  final String occurredAt;
  final String description;
  final String notes;

  Currency get currency => amount.currency;

  bool get isIncome => type == TransactionType.income;

  TransactionDraft copyWith({
    TransactionType? type,
    AmountInput? amount,
    FxRateInput? fxRate,
    Object? categoryId = _unchanged,
    Object? paymentSourceId = _unchanged,
    LocalDate? localDate,
    String? occurredAt,
    String? description,
    String? notes,
  }) {
    return TransactionDraft(
      type: type ?? this.type,
      amount: amount ?? this.amount,
      fxRate: fxRate ?? this.fxRate,
      categoryId:
          identical(categoryId, _unchanged)
              ? this.categoryId
              : categoryId as String?,
      paymentSourceId:
          identical(paymentSourceId, _unchanged)
              ? this.paymentSourceId
              : paymentSourceId as String?,
      localDate: localDate ?? this.localDate,
      occurredAt: occurredAt ?? this.occurredAt,
      description: description ?? this.description,
      notes: notes ?? this.notes,
    );
  }

  /// Switching kind clears the category: an expense category is not a legal
  /// choice for an income, and leaving a stale one selected would fail on
  /// save with nothing on screen explaining why.
  TransactionDraft withType(TransactionType next) =>
      copyWith(type: next, categoryId: null);

  /// Switching currency keeps the typed digits (see
  /// [AmountInput.withCurrency]) and drops an fx rate that no longer applies
  /// — PYG must not carry one (`checkAmountCurrencyAndFxRate`).
  TransactionDraft withCurrency(Currency next) {
    return copyWith(
      amount: amount.withCurrency(next),
      fxRate: next == Currency.pyg ? const FxRateInput.empty() : fxRate,
    );
  }

  /// Picking a date re-derives `occurredAt` through the 15:00Z rule.
  TransactionDraft withLocalDate(
    LocalDate picked, {
    required LocalDate todayLocal,
    required DateTime Function() now,
  }) {
    return copyWith(
      localDate: picked,
      occurredAt: localDateToOccurredAt(
        picked: picked,
        todayLocal: todayLocal,
        now: now,
      ),
    );
  }

  /// Every reason this draft cannot be submitted, in field order. Empty means
  /// submittable.
  List<DraftProblem> validate() {
    final problems = <DraftProblem>[];

    final money = amount.money;
    if (amount.isEmpty) {
      problems.add(DraftProblem.amountMissing);
    } else if (money == null) {
      problems.add(DraftProblem.amountInvalid);
    } else if (money.isZero) {
      problems.add(DraftProblem.amountZero);
    }

    if (currency == Currency.usd) {
      final rate = fxRate.rate;
      if (fxRate.isEmpty) {
        problems.add(DraftProblem.fxRateMissing);
      } else if (rate == null) {
        problems.add(DraftProblem.fxRateInvalid);
      } else if (rate.unscaled == BigInt.zero) {
        problems.add(DraftProblem.fxRateZero);
      }
    }

    if (categoryId == null) {
      problems.add(DraftProblem.categoryMissing);
    }

    // An income has no merchant field to fill: it is named after its
    // category at submit time (see [descriptionForNewTransaction]).
    if (!isIncome && description.trim().isEmpty) {
      problems.add(DraftProblem.descriptionMissing);
    }

    return problems;
  }

  bool get isSubmittable => validate().isEmpty;

  /// The base-PYG amount this draft would persist, for the live "≈ Gs. X"
  /// preview under a USD amount.
  ///
  /// A client-side approximation only — per ADR 0001 the server is the
  /// authority — but it runs the identical single half-up rounding step, so
  /// the preview matches what gets stored. `null` while the draft is not yet
  /// valid enough to compute one.
  BaseAmountPyg? previewBaseAmountPyg() {
    final money = amount.money;
    if (money == null) {
      return null;
    }
    final rate = fxRate.rate;
    if (currency == Currency.usd && rate == null) {
      return null;
    }
    try {
      return BaseAmountPyg.compute(
        amount: money,
        fxRateToPyg: currency == Currency.usd ? rate : null,
      );
    } on FormatException {
      return null;
    }
  }

  /// Builds the create request, or throws [StateError] if the draft has not
  /// been validated — [isSubmittable] is the caller's gate.
  ///
  /// [clientMutationId] implements ADR 0003. M3 is online-only, but the key
  /// is sent from the start: it is what makes a create whose response was
  /// lost safe to retry, and that risk exists with or without a queue.
  CreateTransactionRequest toCreateRequest({
    required List<Category> categories,
    required String clientMutationId,
  }) {
    final money = amount.money;
    if (money == null || !isSubmittable) {
      throw StateError('Draft is not submittable: ${validate()}');
    }
    return CreateTransactionRequest(
      type: type,
      amount: money,
      fxRateToPyg: currency == Currency.usd ? fxRate.rate : null,
      occurredAt: occurredAt,
      categoryId: categoryId!,
      // An income carries no payment source: money did not go out *through*
      // an account, it arrived.
      paymentSourceId: isIncome ? null : paymentSourceId,
      description: descriptionForNewTransaction(
        type: type,
        typedDescription: description,
        categoryName: _categoryName(categories),
      ),
      notes: notes.trim().isEmpty ? null : notes.trim(),
      clientMutationId: clientMutationId,
    );
  }

  /// Builds the patch for an existing movement.
  ///
  /// `type` is not included: no screen offers a way to flip an existing
  /// movement between expense and income, and doing so silently would move
  /// money between two sides of the month's totals.
  ///
  /// An income being *edited* keeps its stored description — one settled from
  /// an expected income carries a real name — so unlike a create it is not
  /// renamed after its category.
  UpdateTransactionRequest toUpdateRequest() {
    final money = amount.money;
    if (money == null || !isSubmittable) {
      throw StateError('Draft is not submittable: ${validate()}');
    }
    final trimmedNotes = notes.trim();
    return UpdateTransactionRequest(
      amount: Patch.of(money),
      fxRateToPyg: Patch.of(currency == Currency.usd ? fxRate.rate : null),
      occurredAt: occurredAt,
      categoryId: categoryId,
      paymentSourceId: Patch.of(isIncome ? null : paymentSourceId),
      description: description.trim(),
      notes: Patch.of(trimmedNotes.isEmpty ? null : trimmedNotes),
    );
  }

  String? _categoryName(List<Category> categories) {
    for (final category in categories) {
      if (category.id == categoryId) {
        return category.name;
      }
    }
    return null;
  }
}

const Object _unchanged = Object();

/// The description a newly created movement is saved with.
///
/// `TransactionDescriptionSchema` requires a non-empty string and the list
/// prints it as the row title, so it can never be blank. An expense asks for
/// it directly (the "Comercio" field); an income has no such field — it is
/// named after its category, and anything typed while the form was in expense
/// mode is discarded, having been meant for a question that no longer
/// applies.
String descriptionForNewTransaction({
  required TransactionType type,
  required String typedDescription,
  required String? categoryName,
  String fallback = 'Ingreso',
}) {
  if (type == TransactionType.income) {
    final name = categoryName?.trim() ?? '';
    return name.isEmpty ? fallback : name;
  }
  return typedDescription.trim();
}

/// The most recent USD movement's exchange rate — the client-derived "último
/// tipo de cambio usado" that pre-fills the manual rate field.
({String wire, LocalDate localDate})? mostRecentUsdRate(
  List<Transaction> transactions,
) {
  Transaction? latest;
  for (final transaction in transactions) {
    if (transaction.amount.currency != Currency.usd ||
        transaction.fxRateToPyg == null) {
      continue;
    }
    if (latest == null || transaction.occurredAt.isAfter(latest.occurredAt)) {
      latest = transaction;
    }
  }
  if (latest == null) {
    return null;
  }
  return (wire: latest.fxRateToPyg!.toWire(), localDate: latest.localDate);
}

String _rootCategoryId(String categoryId, List<Category> categories) {
  for (final category in categories) {
    if (category.id == categoryId) {
      return category.parentId ?? category.id;
    }
  }
  return categoryId;
}

/// Root category ids used within the last [windowDays] days, most-frequent
/// first, capped to [quickChipLimit]. Frequency counts per root — a
/// subcategory pick counts toward its parent — because the quick chips always
/// show root names.
List<String> recentRootCategoryIds({
  required List<Transaction> transactions,
  required List<Category> categories,
  required CategoryKind kind,
  required LocalDate todayLocal,
  int windowDays = recentCategoryWindowDays,
}) {
  final cutoff = todayLocal.plusDays(-windowDays);
  final eligible = {
    for (final category in categories)
      if (category.kind == kind && category.isActive && category.isRoot)
        category.id,
  };

  final frequency = <String, int>{};
  for (final transaction in transactions) {
    if (transaction.localDate.isBefore(cutoff)) {
      continue;
    }
    final rootId = _rootCategoryId(transaction.categoryId, categories);
    if (!eligible.contains(rootId)) {
      continue;
    }
    frequency[rootId] = (frequency[rootId] ?? 0) + 1;
  }

  return _rankedByFrequency(frequency);
}

/// Payment source ids used most often across all recorded movements, capped
/// to [quickChipLimit] — all-time frequency, per the design's own definition,
/// with no recency window unlike categories.
List<String> favoritePaymentSourceIds({
  required List<Transaction> transactions,
  required Set<String> activePaymentSourceIds,
}) {
  final frequency = <String, int>{};
  for (final transaction in transactions) {
    final id = transaction.paymentSourceId;
    if (id == null || !activePaymentSourceIds.contains(id)) {
      continue;
    }
    frequency[id] = (frequency[id] ?? 0) + 1;
  }
  return _rankedByFrequency(frequency);
}

/// Most frequent first, capped. Ties keep insertion order, which is the order
/// the ids were first seen — stable across renders of the same data, so the
/// chips do not shuffle under the user's finger.
List<String> _rankedByFrequency(Map<String, int> frequency) {
  final entries = frequency.entries.toList();
  final order = {
    for (final (index, entry) in entries.indexed) entry.key: index,
  };
  entries.sort((a, b) {
    final byCount = b.value.compareTo(a.value);
    return byCount != 0 ? byCount : order[a.key]!.compareTo(order[b.key]!);
  });
  return [for (final entry in entries.take(quickChipLimit)) entry.key];
}

/// The active payment sources a form offers as chips: the household's
/// favourites first, padded with whatever else is active so the row is never
/// empty while sources exist.
///
/// Like the category chips, the selected source does not jump to the front —
/// it is only promoted when it would otherwise be past the limit. See
/// [orderedChips].
List<PaymentSource> paymentSourceChips({
  required List<PaymentSource> paymentSources,
  required List<String> favoriteIds,
  required String? selectedId,
}) {
  return orderedChips(
    pool: paymentSources
        .where((source) => source.isActive)
        .toList(growable: false),
    idOf: (source) => source.id,
    ranked: favoriteIds,
    selectedId: selectedId,
    limit: quickChipLimit,
  );
}
