import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nido/app/app.dart';
import 'package:nido/app/router/app_router.dart';
import 'package:nido/core/api/api_providers.dart';
import 'package:nido/core/auth/session_controller.dart';
import 'package:nido/core/ids/uuid_v4.dart';
import 'package:nido/features/categories/data/categories_api.dart';
import 'package:nido/features/household/data/households_api.dart';
import 'package:nido/features/payment_sources/data/payment_sources_api.dart';
import 'package:nido/features/transactions/application/transactions_providers.dart';
import 'package:nido/features/transactions/data/transactions_api.dart';
import 'package:nido/testing/finance_fakes.dart';
import 'package:nido/testing/session_fakes.dart';

/// A signed-in app wired to the M3 fakes, opened straight at a location.
class FinanceHarness {
  FinanceHarness({DateTime? now})
    : now = now ?? DateTime.utc(2026, 8, 15, 21, 4);

  final auth = FakeAuthClient(initialIdentity: testIdentity);
  final households =
      FakeHouseholdsApi()
        ..onGetMe = (() async => buildProfile(households: [buildHousehold()]));
  final categories = FakeCategoriesApi();
  final paymentSources = FakePaymentSourcesApi();
  final transactions = FakeTransactionsApi();
  final DateTime now;

  /// Pinned so an assertion can name the exact `clientMutationId` a create
  /// will carry (ADR 0003).
  String mutationId = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

  GoRouter? _router;

  /// The URL the app is showing — what a browser address bar would read.
  String get currentLocation =>
      _router!.routeInformationProvider.value.uri.toString();

  /// Tall enough that a whole form is laid out at once. The default 800×600
  /// surface unmounts fields below the fold, and a test that has to scroll
  /// before every `enterText` is testing the scroll view, not the form.
  static const Size surfaceSize = Size(900, 2400);

  /// Opens at [location] with the session redirect left out.
  ///
  /// A screen test should not also depend on the redirect — that has its own
  /// coverage in `app_router_test.dart` — and without this every one of them
  /// would bounce to `/` while the fake session resolves.
  Future<void> pump(WidgetTester tester, String location) =>
      _pump(tester, location, withSessionRedirect: false);

  /// Opens at [location] with the whole real router, session redirect
  /// included — for tests about routing itself.
  Future<void> pumpWithRealRedirects(WidgetTester tester, String location) =>
      _pump(tester, location, withSessionRedirect: true);

  Future<void> _pump(
    WidgetTester tester,
    String location, {
    required bool withSessionRedirect,
  }) async {
    await tester.binding.setSurfaceSize(surfaceSize);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authClientProvider.overrideWithValue(auth),
          householdsApiProvider.overrideWithValue(households),
          categoriesApiProvider.overrideWithValue(categories),
          paymentSourcesApiProvider.overrideWithValue(paymentSources),
          transactionsApiProvider.overrideWithValue(transactions),
          clockProvider.overrideWithValue(() => now),
          idGeneratorProvider.overrideWithValue(() => mutationId),
          searchDebounceProvider.overrideWithValue(
            const Duration(milliseconds: 10),
          ),
          routerProvider.overrideWith((ref) {
            final refresh = ValueNotifier(0);
            ref
              ..onDispose(refresh.dispose)
              ..listen(sessionControllerProvider, (_, _) => refresh.value++);
            return _router = createRouter(
              initialLocation: location,
              refreshListenable: withSessionRedirect ? refresh : null,
              redirect:
                  withSessionRedirect
                      ? (matched) => redirectPathForSession(
                        ref.read(sessionControllerProvider),
                        matched,
                      )
                      : null,
            );
          }),
        ],
        child: const NidoApp(),
      ),
    );
    await tester.pumpAndSettle();
  }
}

/// Scrolls [finder] into view before tapping it.
Future<void> tapAt(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}
