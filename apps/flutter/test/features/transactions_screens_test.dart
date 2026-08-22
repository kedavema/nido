import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/router/app_routes.dart';
import 'package:nido/core/contracts/transactions.dart';
import 'package:nido/core/errors/app_error.dart';
import 'package:nido/core/money/currency.dart';
import 'package:nido/core/widgets/action_button.dart';
import 'package:nido/testing/finance_fakes.dart';

import 'pump_app.dart';

const String pygExpenseId = '5f1b2f0a-9c3d-4e5f-8a6b-1c2d3e4f5a6b';
const String incomeId = '00000000-0000-4000-8000-000000000031';
const String usdExpenseId = '00000000-0000-4000-8000-000000000032';

List<Transaction> mixedMonth() => [
  buildTransaction(id: pygExpenseId),
  buildTransaction(
    id: incomeId,
    type: TransactionType.income,
    amount: '9500000',
    categoryId: incomeRootId,
    paymentSourceId: null,
    description: 'Salario',
    occurredAt: '2026-08-15T12:12:00.000Z',
  ),
  buildTransaction(
    id: usdExpenseId,
    currency: Currency.usd,
    amount: '10.01',
    fxRateToBase: '7350',
    categoryId: expenseRootId,
    paymentSourceId: bankSourceId,
    localDate: '2026-08-14',
    occurredAt: '2026-08-14T15:00:00.000Z',
    description: 'Suscripción en dólares',
  ),
];

void main() {
  late FinanceHarness harness;

  setUp(() {
    harness = FinanceHarness();
    harness.transactions.transactions = mixedMonth();
  });

  group('movements list', () {
    testWidgets('groups by day, newest first, with a signed subtotal', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactions);

      expect(find.byKey(const Key('transactions_screen')), findsOneWidget);
      expect(find.text('HOY · SÁB 15'), findsOneWidget);
      expect(find.text('AYER · VIE 14'), findsOneWidget);
      // 9.500.000 income − 150.000 expense.
      expect(find.text('+Gs. 9.350.000'), findsOneWidget);
      expect(find.text('−Gs. 73.574'), findsWidgets);
    });

    testWidgets('a USD row names its original amount and rate', (tester) async {
      await harness.pump(tester, AppRoutes.transactions);

      expect(find.textContaining('USD 10,01 · TC 7.350'), findsOneWidget);
    });

    testWidgets('the month range is what the API is asked for', (tester) async {
      await harness.pump(tester, AppRoutes.transactions);

      expect(harness.transactions.listQueries.first.toQueryParameters(), {
        'from': '2026-08-01',
        'to': '2026-08-31',
      });
      expect(find.text('Agosto 2026'), findsOneWidget);
    });

    testWidgets('stepping the month refetches that month only', (tester) async {
      await harness.pump(tester, AppRoutes.transactions);
      await tapAt(tester, find.byKey(const Key('previous_month_button')));

      expect(find.text('Julio 2026'), findsOneWidget);
      expect(harness.transactions.listQueries.last.toQueryParameters(), {
        'from': '2026-07-01',
        'to': '2026-07-31',
      });
    });

    testWidgets('typing issues one query per pause, not per keystroke', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactions);
      final before = harness.transactions.listCallCount;

      final field = find.byKey(const Key('transactions_search_field'));
      await tester.enterText(field, 's');
      await tester.pump(const Duration(milliseconds: 2));
      await tester.enterText(field, 'su');
      await tester.pump(const Duration(milliseconds: 2));
      await tester.enterText(field, 'sup');
      await tester.pumpAndSettle(const Duration(milliseconds: 50));

      expect(harness.transactions.listCallCount, before + 1);
      expect(harness.transactions.listQueries.last.search, 'sup');
    });

    testWidgets('the superseded search request is cancelled', (tester) async {
      await harness.pump(tester, AppRoutes.transactions);

      final field = find.byKey(const Key('transactions_search_field'));
      await tester.enterText(field, 'sup');
      await tester.pumpAndSettle(const Duration(milliseconds: 50));
      await tester.enterText(field, 'salario');
      await tester.pumpAndSettle(const Duration(milliseconds: 50));

      final tokens = harness.transactions.listTokens;
      expect(tokens.length, greaterThanOrEqualTo(3));
      // Only the newest request survives; the ones before it were aborted.
      expect(tokens[tokens.length - 2]?.isCancelled, isTrue);
      expect(tokens.last?.isCancelled, isFalse);
    });

    testWidgets('a kind filter is sent, and its chip can undo it', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactions);
      await tapAt(tester, find.byKey(const Key('open_filters_button')));
      await tapAt(tester, find.byKey(const Key('filter_type_INCOME')));
      await tapAt(tester, find.byKey(const Key('filters_apply_button')));

      expect(
        harness.transactions.listQueries.last.type,
        TransactionType.income,
      );
      expect(find.byKey(const Key('filter_chip_type')), findsOneWidget);

      await tapAt(tester, find.byKey(const Key('remove_filter_type')));
      expect(harness.transactions.listQueries.last.type, isNull);
    });

    testWidgets('a category filter is resolved locally, without a request', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactions);
      final before = harness.transactions.listCallCount;

      await tapAt(tester, find.byKey(const Key('open_filters_button')));
      await tapAt(
        tester,
        find.byKey(const Key('filter_category_$expenseRootId')),
      );
      await tapAt(tester, find.byKey(const Key('filters_apply_button')));

      // The endpoint matches categoryId exactly, so a root selection has to
      // be applied over the response — and that must not refetch.
      expect(harness.transactions.listCallCount, before);
      // The root and its child stay; the income does not.
      expect(find.text('Salario'), findsNothing);
      expect(find.text('Supermercado semanal'), findsOneWidget);
      expect(find.text('Suscripción en dólares'), findsOneWidget);
    });

    testWidgets('an empty month reads differently from an empty filter', (
      tester,
    ) async {
      harness.transactions.transactions = [];
      await harness.pump(tester, AppRoutes.transactions);

      expect(find.text('Aún no hay movimientos en agosto'), findsOneWidget);

      await tapAt(tester, find.byKey(const Key('open_filters_button')));
      await tapAt(tester, find.byKey(const Key('filter_type_INCOME')));
      await tapAt(tester, find.byKey(const Key('filters_apply_button')));

      expect(find.text('Sin resultados'), findsOneWidget);
    });

    testWidgets('the absence of pagination is stated, not hidden', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactions);
      final notice = find.byKey(const Key('no_pagination_notice'));
      await tester.ensureVisible(notice);
      await tester.pumpAndSettle();

      expect(find.textContaining('este listado no pagina'), findsOneWidget);
    });

    testWidgets('a load failure shows safe copy and retries', (tester) async {
      harness.transactions.listError = const NetworkError();
      await harness.pump(tester, AppRoutes.transactions);

      expect(
        find.text(
          'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.',
        ),
        findsOneWidget,
      );

      harness.transactions.listError = null;
      await tapAt(tester, find.byKey(const Key('retry_button')));

      expect(find.text('Supermercado semanal'), findsOneWidget);
    });
  });

  group('movement detail', () {
    testWidgets('an expense is titled and signed as one', (tester) async {
      await harness.pump(tester, AppRoutes.transactionDetail(pygExpenseId));

      expect(find.text('Detalle del gasto'), findsOneWidget);
      expect(find.text('−Gs. 150.000'), findsOneWidget);
      expect(find.text('Gasto en guaraníes'), findsOneWidget);
      expect(find.text('Alimentación · Supermercado'), findsOneWidget);
      expect(find.text('Ale · 9:05'), findsOneWidget);
    });

    // FLT-018: the legacy screen titled every movement "Detalle del gasto"
    // and printed the literal word "Ingreso" as the category, hiding both
    // what the movement was and where it was filed.
    testWidgets('an income is titled as an income and names its category', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionDetail(incomeId));

      expect(find.text('Detalle del ingreso'), findsOneWidget);
      expect(find.text('Detalle del gasto'), findsNothing);
      expect(find.text('+Gs. 9.500.000'), findsOneWidget);
      expect(find.text('Salario'), findsWidgets);
      // An income has no payment source to report.
      expect(find.text('Pagado con'), findsNothing);
    });

    testWidgets('a USD movement shows its original amount and rate', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionDetail(usdExpenseId));

      expect(find.text('Monto original'), findsOneWidget);
      expect(find.text('USD 10,01 · TC Gs. 7.350'), findsOneWidget);
    });

    testWidgets('deleting asks first and says it affects both members', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionDetail(pygExpenseId));
      await tapAt(tester, find.byKey(const Key('delete_transaction_button')));

      expect(find.text('¿Eliminar este gasto?'), findsOneWidget);
      expect(find.textContaining('Se elimina para los dos'), findsOneWidget);

      await tapAt(tester, find.byKey(const Key('confirm_dialog_cancel')));
      expect(harness.transactions.deleted, isEmpty);

      await tapAt(tester, find.byKey(const Key('delete_transaction_button')));
      await tapAt(tester, find.byKey(const Key('confirm_dialog_confirm')));

      expect(harness.transactions.deleted, [pygExpenseId]);
    });

    testWidgets('a movement that no longer exists reports it safely', (
      tester,
    ) async {
      harness.transactions.getError = const NotFoundError();
      await harness.pump(tester, AppRoutes.transactionDetail(pygExpenseId));

      expect(find.text('No encontramos lo que buscabas.'), findsOneWidget);
    });
  });

  group('movement form · create', () {
    testWidgets('opens as an expense in guaraníes, dated today', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);

      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);
      expect(find.text('Nuevo gasto'), findsWidgets);
      expect(find.textContaining('Hoy · sáb 15 ago 2026'), findsOneWidget);
      // No exchange-rate card while the movement is in guaraníes.
      expect(find.byKey(const Key('fx_rate_card')), findsNothing);
    });

    // FLT-016: the legacy form rendered USD fields when editing but offered
    // no way to choose USD, so a dollar movement could never be created.
    testWidgets('offers a currency selector and reveals the rate card', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tapAt(
        tester,
        find.byKey(const Key('currency_option_Currency.usd')),
      );

      expect(find.byKey(const Key('fx_rate_card')), findsOneWidget);
    });

    testWidgets('the save button stays disabled until the draft is valid', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      final submit = find.byKey(const Key('submit_transaction_button'));
      expect(tester.widget<ActionButton>(submit).onPressed, isNull);

      await tester.enterText(find.byKey(const Key('amount_field')), '150000');
      await tester.pumpAndSettle();
      expect(tester.widget<ActionButton>(submit).onPressed, isNull);

      await tapAt(
        tester,
        find.byKey(const Key('category_chip_$expenseRootId')),
      );
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();

      expect(tester.widget<ActionButton>(submit).onPressed, isNotNull);
    });

    // FLT-017: only some legacy forms rejected zero, and they did it with a
    // literal string compare that "0,00" walked straight past.
    testWidgets('zero is refused and says why', (tester) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tester.enterText(find.byKey(const Key('amount_field')), '0');
      await tapAt(
        tester,
        find.byKey(const Key('category_chip_$expenseRootId')),
      );
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();

      expect(
        find.text('El monto tiene que ser mayor que cero.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<ActionButton>(
              find.byKey(const Key('submit_transaction_button')),
            )
            .onPressed,
        isNull,
      );
    });

    testWidgets('a USD amount cannot be saved without an exchange rate', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tapAt(
        tester,
        find.byKey(const Key('currency_option_Currency.usd')),
      );
      await tester.enterText(find.byKey(const Key('amount_field')), '45,90');
      await tapAt(
        tester,
        find.byKey(const Key('category_chip_$expenseRootId')),
      );
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();

      final submit = find.byKey(const Key('submit_transaction_button'));
      expect(tester.widget<ActionButton>(submit).onPressed, isNull);

      await tester.enterText(find.byKey(const Key('fx_rate_field')), '7350');
      await tester.pumpAndSettle();

      // The preview uses the same single half-up rounding the server applies.
      expect(find.text('≈ Gs. 337.365'), findsOneWidget);
      expect(tester.widget<ActionButton>(submit).onPressed, isNotNull);
    });

    testWidgets('the amount field groups thousands as it is typed', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tester.enterText(find.byKey(const Key('amount_field')), '386500');
      await tester.pumpAndSettle();

      expect(find.text('386.500'), findsOneWidget);
    });

    testWidgets('saving sends the canonical request with its idempotency key', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tester.enterText(find.byKey(const Key('amount_field')), '150000');
      await tapAt(
        tester,
        find.byKey(const Key('category_chip_$expenseRootId')),
      );
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();
      await tapAt(tester, find.byKey(const Key('submit_transaction_button')));

      final request = harness.transactions.created.single;
      expect(request.toJson(), {
        'type': 'EXPENSE',
        'amount': '150000',
        'currency': 'PYG',
        'occurredAt': '2026-08-15T21:04:00.000Z',
        'categoryId': expenseRootId,
        'description': 'Biggie',
        'clientMutationId': harness.mutationId,
      });
      expect(find.byKey(const Key('transaction_saved_screen')), findsOneWidget);
    });

    testWidgets('the confirmation can start another movement', (tester) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tester.enterText(find.byKey(const Key('amount_field')), '150000');
      await tapAt(
        tester,
        find.byKey(const Key('category_chip_$expenseRootId')),
      );
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();
      await tapAt(tester, find.byKey(const Key('submit_transaction_button')));
      await tapAt(tester, find.byKey(const Key('load_another_button')));

      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);
      // A fresh draft, not the one just saved.
      expect(
        tester
            .widget<ActionButton>(
              find.byKey(const Key('submit_transaction_button')),
            )
            .onPressed,
        isNull,
      );
    });

    testWidgets('an income asks neither merchant nor payment source', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tapAt(
        tester,
        find.byKey(const Key('kind_option_TransactionType.income')),
      );

      expect(find.byKey(const Key('description_field')), findsNothing);
      expect(find.text('Pagado con'), findsNothing);
      // Only income categories are offered.
      expect(
        find.byKey(const Key('category_chip_$incomeRootId')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('category_chip_$expenseRootId')),
        findsNothing,
      );
    });

    testWidgets('a failed save keeps the draft and reports why', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.transactionNew);
      await tester.enterText(find.byKey(const Key('amount_field')), '150000');
      await tapAt(
        tester,
        find.byKey(const Key('category_chip_$expenseRootId')),
      );
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();

      harness.transactions.createError = const UnavailableError(
        statusCode: 500,
      );
      await tapAt(tester, find.byKey(const Key('submit_transaction_button')));

      expect(find.byKey(const Key('submit_error_notice')), findsOneWidget);
      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);
      expect(find.text('386.500'), findsNothing);
      expect(find.text('150.000'), findsOneWidget);
    });
  });

  group('movement form · edit', () {
    testWidgets('opens seeded from the stored movement', (tester) async {
      await harness.pump(tester, AppRoutes.transactionEdit(usdExpenseId));

      expect(find.text('Editar gasto'), findsWidgets);
      expect(find.text('10,01'), findsOneWidget);
      expect(find.text('7.350'), findsOneWidget);
      // An existing movement's kind is not something to flip.
      expect(
        find.byKey(const Key('kind_option_TransactionType.income')),
        findsNothing,
      );
    });

    testWidgets('saving patches only what the form owns', (tester) async {
      await harness.pump(tester, AppRoutes.transactionEdit(pygExpenseId));
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Supermercado quincenal',
      );
      await tester.pumpAndSettle();
      await tapAt(tester, find.byKey(const Key('submit_transaction_button')));

      final (id, request) = harness.transactions.updated.single;
      expect(id, pygExpenseId);
      expect(request.toJson(), {
        'amount': '150000',
        'currency': 'PYG',
        'fxRateToBase': null,
        'occurredAt': '2026-08-15T18:30:00.000Z',
        'categoryId': expenseChildId,
        'paymentSourceId': cashSourceId,
        'description': 'Supermercado quincenal',
        'notes': null,
      });
    });
  });
}
