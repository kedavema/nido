import 'package:dio/dio.dart';

import '../core/contracts/categories.dart';
import '../core/contracts/payment_sources.dart';
import '../core/contracts/transactions.dart';
import '../core/money/base_amount_pyg.dart';
import '../core/money/currency.dart';
import '../core/money/fx_rate.dart';
import '../core/money/money.dart';
import '../core/time/local_date.dart';
import '../core/time/wire_instant.dart';
import '../features/categories/data/categories_api.dart';
import '../features/payment_sources/data/payment_sources_api.dart';
import '../features/transactions/data/transactions_api.dart';

/// Builders and scriptable API doubles for the M3 financial flows.
///
/// Lives in `lib/` rather than `test/` for the same reason
/// `session_fakes.dart` does: `integration_test/` cannot import from `test/`
/// — the web compiler rejects imports outside the package root — and the
/// integration suite needs the very same doubles.

const String testHouseholdId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/// The same user `session_fakes.dart` builds, so a widget test that resolves
/// a holder or a "cargado por" name against the household members finds one.
const String testUserId = '00000000-0000-4000-8000-000000000001';

const String expenseRootId = '0f7a1c2d-3b4e-4f5a-8b6c-7d8e9f0a1b2c';
const String expenseChildId = '1a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5d';
const String archivedChildId = '3c4d5e6f-7a8b-4c9d-a0e1-f2a3b4c5d6e7';
const String incomeRootId = '2b3c4d5e-6f7a-4b8c-8d9e-0f1a2b3c4d5e';

const String cashSourceId = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a';
const String bankSourceId = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';
const String archivedSourceId = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c';

final DateTime _stamp = DateTime.utc(2026, 7, 16, 12, 5);

Category buildCategory({
  required String id,
  required String name,
  String? parentId,
  CategoryKind kind = CategoryKind.expense,
  bool isActive = true,
  int sortOrder = 0,
  String icon = 'restaurant',
  String color = '#3E6B34',
}) {
  return Category(
    id: id,
    householdId: testHouseholdId,
    kind: kind,
    parentId: parentId,
    name: name,
    icon: icon,
    color: color,
    sortOrder: sortOrder,
    isActive: isActive,
    createdAt: _stamp,
    updatedAt: _stamp,
  );
}

/// The catalog most tests use: one expense root with an active and an
/// archived child, plus one income root.
List<Category> buildCategories() => [
  buildCategory(id: expenseRootId, name: 'Alimentación'),
  buildCategory(
    id: expenseChildId,
    name: 'Supermercado',
    parentId: expenseRootId,
  ),
  buildCategory(
    id: archivedChildId,
    name: 'Delivery',
    parentId: expenseRootId,
    isActive: false,
    sortOrder: 1,
  ),
  buildCategory(
    id: incomeRootId,
    name: 'Salario',
    kind: CategoryKind.income,
    icon: 'briefcase',
    color: '#3E5C76',
  ),
];

PaymentSource buildPaymentSource({
  required String id,
  required String name,
  PaymentSourceType type = PaymentSourceType.cash,
  String? ownerUserId,
  bool isActive = true,
}) {
  return PaymentSource(
    id: id,
    householdId: testHouseholdId,
    name: name,
    type: type,
    ownerUserId: ownerUserId,
    isActive: isActive,
    createdAt: _stamp,
    updatedAt: _stamp,
  );
}

List<PaymentSource> buildPaymentSources() => [
  buildPaymentSource(id: cashSourceId, name: 'Efectivo'),
  buildPaymentSource(
    id: bankSourceId,
    name: 'Itaú Ale',
    type: PaymentSourceType.bankAccount,
    ownerUserId: testUserId,
  ),
  buildPaymentSource(
    id: archivedSourceId,
    name: 'Billetera vieja',
    type: PaymentSourceType.digitalWallet,
    isActive: false,
  ),
];

Transaction buildTransaction({
  String id = '5f1b2f0a-9c3d-4e5f-8a6b-1c2d3e4f5a6b',
  TransactionType type = TransactionType.expense,
  String amount = '150000',
  Currency currency = Currency.pyg,
  String? fxRateToBase,
  String? baseAmountPyg,
  String localDate = '2026-08-15',
  String? occurredAt,
  String categoryId = expenseChildId,
  String? paymentSourceId = cashSourceId,
  String description = 'Supermercado semanal',
  String? notes,
}) {
  final money = Money.parseWire(currency: currency, amount: amount);
  final rate =
      fxRateToBase == null ? null : FxRateToPyg.parseWire(fxRateToBase);
  return Transaction(
    id: id,
    householdId: testHouseholdId,
    type: type,
    amount: money,
    fxRateToPyg: rate,
    baseAmountPyg:
        baseAmountPyg == null
            ? BaseAmountPyg.compute(amount: money, fxRateToPyg: rate)
            : BaseAmountPyg.parseWire(baseAmountPyg),
    occurredAt: WireInstant.parseWire(
      occurredAt ?? '${localDate}T18:30:00.000Z',
    ),
    localDate: LocalDate.parseWire(localDate),
    categoryId: categoryId,
    paymentSourceId: paymentSourceId,
    description: description,
    notes: notes,
    origin: TransactionOrigin.manual,
    createdBy: testUserId,
    updatedBy: testUserId,
    createdAt: _stamp,
    updatedAt: _stamp,
  );
}

/// Scriptable [CategoriesApi]: each endpoint is a settable closure, and calls
/// are recorded so a test can assert a screen issued exactly one.
class FakeCategoriesApi implements CategoriesApi {
  List<Category> categories = buildCategories();
  Object? listError;

  int listCalls = 0;
  final List<CreateCategoryRequest> created = [];
  final List<(String, UpdateCategoryRequest)> updated = [];
  final List<String> archived = [];

  Future<Category> Function(CreateCategoryRequest request)? onCreate;
  Future<void> Function(String categoryId)? onArchive;

  @override
  Future<ListCategoriesResponse> list(
    String householdId, {
    CancelToken? cancelToken,
  }) async {
    listCalls++;
    if (listError case final error?) {
      throw error;
    }
    return ListCategoriesResponse(categories: categories);
  }

  @override
  Future<CategoryResponse> create(
    String householdId,
    CreateCategoryRequest request, {
    CancelToken? cancelToken,
  }) async {
    created.add(request);
    final category =
        await onCreate?.call(request) ??
        buildCategory(
          id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          name: request.name,
          parentId: request.parentId,
          kind: request.kind,
          icon: request.icon,
          color: request.color,
        );
    categories = [...categories, category];
    return CategoryResponse(category: category);
  }

  @override
  Future<CategoryResponse> update(
    String householdId,
    String categoryId,
    UpdateCategoryRequest request, {
    CancelToken? cancelToken,
  }) async {
    updated.add((categoryId, request));
    final existing = categories.firstWhere((item) => item.id == categoryId);
    final next = buildCategory(
      id: existing.id,
      name: request.name ?? existing.name,
      parentId:
          request.parentId.isPresent
              ? request.parentId.value
              : existing.parentId,
      kind: existing.kind,
      isActive: request.isActive ?? existing.isActive,
      sortOrder: request.sortOrder ?? existing.sortOrder,
      icon: request.icon ?? existing.icon,
      color: request.color ?? existing.color,
    );
    categories = [
      for (final item in categories)
        if (item.id == categoryId) next else item,
    ];
    return CategoryResponse(category: next);
  }

  @override
  Future<void> archive(
    String householdId,
    String categoryId, {
    CancelToken? cancelToken,
  }) async {
    archived.add(categoryId);
    if (onArchive case final handler?) {
      await handler(categoryId);
    }
  }
}

/// Scriptable [PaymentSourcesApi].
class FakePaymentSourcesApi implements PaymentSourcesApi {
  List<PaymentSource> paymentSources = buildPaymentSources();
  Object? listError;

  int listCalls = 0;
  final List<CreatePaymentSourceRequest> created = [];
  final List<(String, UpdatePaymentSourceRequest)> updated = [];
  final List<String> archived = [];

  Future<void> Function(String paymentSourceId)? onArchive;

  @override
  Future<ListPaymentSourcesResponse> list(
    String householdId, {
    CancelToken? cancelToken,
  }) async {
    listCalls++;
    if (listError case final error?) {
      throw error;
    }
    return ListPaymentSourcesResponse(paymentSources: paymentSources);
  }

  @override
  Future<PaymentSourceResponse> create(
    String householdId,
    CreatePaymentSourceRequest request, {
    CancelToken? cancelToken,
  }) async {
    created.add(request);
    final source = buildPaymentSource(
      id: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
      name: request.name,
      type: request.type,
      ownerUserId: request.ownerUserId,
    );
    paymentSources = [...paymentSources, source];
    return PaymentSourceResponse(paymentSource: source);
  }

  @override
  Future<PaymentSourceResponse> update(
    String householdId,
    String paymentSourceId,
    UpdatePaymentSourceRequest request, {
    CancelToken? cancelToken,
  }) async {
    updated.add((paymentSourceId, request));
    final existing = paymentSources.firstWhere(
      (item) => item.id == paymentSourceId,
    );
    final next = buildPaymentSource(
      id: existing.id,
      name: request.name ?? existing.name,
      type: request.type ?? existing.type,
      ownerUserId:
          request.ownerUserId.isPresent
              ? request.ownerUserId.value
              : existing.ownerUserId,
      isActive: request.isActive ?? existing.isActive,
    );
    paymentSources = [
      for (final item in paymentSources)
        if (item.id == paymentSourceId) next else item,
    ];
    return PaymentSourceResponse(paymentSource: next);
  }

  @override
  Future<void> archive(
    String householdId,
    String paymentSourceId, {
    CancelToken? cancelToken,
  }) async {
    archived.add(paymentSourceId);
    if (onArchive case final handler?) {
      await handler(paymentSourceId);
    }
  }
}

/// Scriptable [TransactionsApi].
///
/// [listQueries] records the query of every list call in order, which is how
/// the filter tests assert that a superseded request was cancelled rather
/// than merely ignored: a cancelled call still appears here, but its
/// [CancelToken] is cancelled.
class FakeTransactionsApi implements TransactionsApi {
  List<Transaction> transactions = [buildTransaction()];
  Object? listError;
  Object? getError;
  Object? createError;
  Object? updateError;

  final List<ListTransactionsQuery> listQueries = [];
  final List<CancelToken?> listTokens = [];
  final List<CreateTransactionRequest> created = [];
  final List<(String, UpdateTransactionRequest)> updated = [];
  final List<String> deleted = [];

  /// Completes each list call only when the test says so, so two overlapping
  /// requests can be resolved out of order.
  Future<void> Function(ListTransactionsQuery query)? gateList;

  int get listCallCount => listQueries.length;

  @override
  Future<ListTransactionsResponse> list(
    String householdId, {
    ListTransactionsQuery query = ListTransactionsQuery.none,
    CancelToken? cancelToken,
  }) async {
    listQueries.add(query);
    listTokens.add(cancelToken);
    if (gateList case final gate?) {
      await gate(query);
    }
    if (listError case final error?) {
      throw error;
    }
    return ListTransactionsResponse(transactions: transactions);
  }

  @override
  Future<TransactionResponse> getById(
    String householdId,
    String transactionId, {
    CancelToken? cancelToken,
  }) async {
    if (getError case final error?) {
      throw error;
    }
    return TransactionResponse(
      transaction: transactions.firstWhere((item) => item.id == transactionId),
    );
  }

  @override
  Future<TransactionResponse> create(
    String householdId,
    CreateTransactionRequest request, {
    CancelToken? cancelToken,
  }) async {
    if (createError case final error?) {
      throw error;
    }
    created.add(request);
    final transaction = buildTransaction(
      id: '6a2c3d1b-0e4f-4a5b-9c7d-2e3f4a5b6c7d',
      type: request.type,
      amount: request.amount.toWire(),
      currency: request.amount.currency,
      fxRateToBase: request.fxRateToPyg?.toWire(),
      categoryId: request.categoryId,
      paymentSourceId: request.paymentSourceId,
      description: request.description,
      notes: request.notes,
    );
    transactions = [...transactions, transaction];
    return TransactionResponse(transaction: transaction);
  }

  @override
  Future<TransactionResponse> update(
    String householdId,
    String transactionId,
    UpdateTransactionRequest request, {
    CancelToken? cancelToken,
  }) async {
    if (updateError case final error?) {
      throw error;
    }
    updated.add((transactionId, request));
    return TransactionResponse(
      transaction: transactions.firstWhere((item) => item.id == transactionId),
    );
  }

  @override
  Future<void> delete(
    String householdId,
    String transactionId, {
    CancelToken? cancelToken,
  }) async {
    deleted.add(transactionId);
    transactions = [
      for (final item in transactions)
        if (item.id != transactionId) item,
    ];
  }
}
