import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nido/app/app.dart';
import 'package:nido/app/router/app_router.dart';
import 'package:nido/app/router/app_routes.dart';
import 'package:nido/core/api/api_providers.dart';
import 'package:nido/core/auth/session_controller.dart';
import 'package:nido/core/ids/uuid_v4.dart';
import 'package:nido/features/categories/data/categories_api.dart';
import 'package:nido/features/household/data/households_api.dart';
import 'package:nido/features/payment_sources/data/payment_sources_api.dart';
import 'package:nido/features/transactions/data/transactions_api.dart';
import 'package:nido/testing/finance_fakes.dart';
import 'package:nido/testing/session_fakes.dart';

/// M3 E2E on a real web runtime: the movement flows end to end, and the
/// legacy Expo URLs still resolve after a direct refresh.
///
/// The API is faked (there is no server in a headless drive) but everything
/// above it is real — router, providers, cancellation, the money types. The
/// run against the live API with real credentials is a separately reported
/// manual check.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const mutationId = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

  ({Widget app, FakeTransactionsApi transactions, GoRouter Function() router})
  build(String location) {
    final auth = FakeAuthClient(initialIdentity: testIdentity);
    final households =
        FakeHouseholdsApi()
          ..onGetMe =
              (() async => buildProfile(households: [buildHousehold()]));
    final transactions = FakeTransactionsApi()..transactions = [];
    GoRouter? created;

    return (
      transactions: transactions,
      router: () => created!,
      app: ProviderScope(
        overrides: [
          authClientProvider.overrideWithValue(auth),
          householdsApiProvider.overrideWithValue(households),
          categoriesApiProvider.overrideWithValue(FakeCategoriesApi()),
          paymentSourcesApiProvider.overrideWithValue(FakePaymentSourcesApi()),
          transactionsApiProvider.overrideWithValue(transactions),
          clockProvider.overrideWithValue(
            () => DateTime.utc(2026, 8, 15, 21, 4),
          ),
          idGeneratorProvider.overrideWithValue(() => mutationId),
          routerProvider.overrideWith((ref) {
            final refresh = ValueNotifier(0);
            ref
              ..onDispose(refresh.dispose)
              ..listen(sessionControllerProvider, (_, _) => refresh.value++);
            return created = createRouter(
              initialLocation: location,
              refreshListenable: refresh,
              redirect:
                  (matched) => redirectPathForSession(
                    ref.read(sessionControllerProvider),
                    matched,
                  ),
            );
          }),
        ],
        child: const NidoApp(),
      ),
    );
  }

  group('M3 core financial flows', () {
    testWidgets('creating a movement puts it in the month it belongs to', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final harness = build(AppRoutes.transactions);

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('transactions_screen')), findsOneWidget);
      expect(find.text('Aún no hay movimientos en agosto'), findsOneWidget);

      await tester.tap(find.byKey(const Key('new_transaction_button')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);

      await tester.enterText(find.byKey(const Key('amount_field')), '150000');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('category_chip_$expenseRootId')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('description_field')),
        'Biggie',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('submit_transaction_button')));
      await tester.pumpAndSettle();

      // ADR 0003: the create carries its client mutation id, so a lost
      // response is safe to retry.
      expect(harness.transactions.created.single.clientMutationId, mutationId);
      expect(find.byKey(const Key('transaction_saved_screen')), findsOneWidget);

      await tester.tap(find.byKey(const Key('done_button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('transactions_screen')), findsOneWidget);
      expect(find.text('Biggie'), findsOneWidget);
      expect(find.text('−Gs. 150.000'), findsWidgets);
    });

    testWidgets('a legacy movements URL still opens the movements screen', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final harness = build('/movimientos');

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('transactions_screen')), findsOneWidget);
      expect(
        harness.router().routeInformationProvider.value.uri.toString(),
        AppRoutes.transactions,
      );
    });

    testWidgets('a legacy new-expense URL keeps its query on redirect', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final harness = build('/nuevo-gasto?type=INCOME');

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('transaction_form_screen')), findsOneWidget);
      expect(
        harness.router().routeInformationProvider.value.uri.toString(),
        '/transactions/new?type=INCOME',
      );
      expect(find.text('Nuevo ingreso'), findsWidgets);
    });

    testWidgets('the catalogs are reachable and load', (tester) async {
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final harness = build(AppRoutes.categories);

      await tester.pumpWidget(harness.app);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('categories_screen')), findsOneWidget);
      expect(find.text('Alimentación'), findsOneWidget);
    });
  });
}
