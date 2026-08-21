import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/auth/session_machine.dart';
import '../../core/contracts/transactions.dart';
import '../../features/authentication/presentation/session_screens.dart';
import '../../features/authentication/presentation/sign_in_screen.dart';
import '../../features/categories/presentation/categories_screen.dart';
import '../../features/household/presentation/household_home_screen.dart';
import '../../features/household/presentation/onboarding_screen.dart';
import '../../features/invitations/presentation/invitation_screen.dart';
import '../../features/payment_sources/presentation/payment_sources_screen.dart';
import '../../features/transactions/presentation/transaction_detail_screen.dart';
import '../../features/transactions/presentation/transaction_form_screen.dart';
import '../../features/transactions/presentation/transactions_list_screen.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import 'app_routes.dart';

/// Where the router must send [location] for a resolved [session], or `null`
/// to stay. Pure — it issues no requests and reads no async state, which is
/// what guarantees redirects can neither duplicate `getMe` nor oscillate:
///
/// * unresolved states (initializing / recoverable error) never redirect;
///   [SessionGate] renders them in place at the current URL;
/// * each resolved state has exactly one allowed route set and one target,
///   so successive evaluations are idempotent.
@visibleForTesting
String? redirectPathForSession(SessionState session, String location) {
  switch (destinationForSession(session)) {
    case SessionDestination.initializing:
    case SessionDestination.error:
      return null;
    case SessionDestination.signIn:
      return location == AppRoutes.signIn ? null : AppRoutes.signIn;
    case SessionDestination.onboarding:
      // The invitation screen is a legitimate stop for a user without a
      // household (the onboarding screen links to it).
      return location == AppRoutes.onboarding ||
              location == AppRoutes.invitation
          ? null
          : AppRoutes.onboarding;
    case SessionDestination.home:
      // Auth-flow routes bounce home once a household exists — including
      // right after accepting an invitation or creating the household.
      return location == AppRoutes.signIn ||
              location == AppRoutes.onboarding ||
              location == AppRoutes.invitation
          ? AppRoutes.root
          : null;
  }
}

/// Provider for the application router, re-evaluating redirects whenever the
/// session state changes (the listenable bumps; the redirect itself only
/// reads the already-resolved state).
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref
    ..onDispose(refresh.dispose)
    ..listen(sessionControllerProvider, (_, _) => refresh.value++);

  return createRouter(
    refreshListenable: refresh,
    redirect:
        (location) => redirectPathForSession(
          ref.read(sessionControllerProvider),
          location,
        ),
  );
});

/// Creates the [GoRouter]. [redirect] receives the matched location and
/// returns the target path or `null`; tests inject their own.
GoRouter createRouter({
  String initialLocation = AppRoutes.root,
  Listenable? refreshListenable,
  String? Function(String location)? redirect,
}) {
  return GoRouter(
    initialLocation: initialLocation,
    refreshListenable: refreshListenable,
    redirect:
        redirect == null
            ? null
            : (context, state) => redirect(state.matchedLocation),
    errorBuilder:
        (context, state) => NotFoundScreen(path: state.uri.toString()),
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.root,
        name: 'home',
        builder:
            (context, state) => const SessionGate(child: HouseholdHomeScreen()),
      ),
      GoRoute(
        path: AppRoutes.signIn,
        name: 'sign-in',
        builder: (context, state) => const SessionGate(child: SignInScreen()),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        name: 'onboarding',
        builder:
            (context, state) => const SessionGate(child: OnboardingScreen()),
      ),
      GoRoute(
        path: AppRoutes.invitation,
        name: 'invitation',
        builder:
            (context, state) => const SessionGate(child: InvitationScreen()),
      ),
      GoRoute(
        path: AppRoutes.transactions,
        name: 'transactions',
        builder:
            (context, state) =>
                const SessionGate(child: TransactionsListScreen()),
        routes: <RouteBase>[
          // Declared before `:id` so "new" is never read as a movement id.
          GoRoute(
            path: 'new',
            name: 'transaction-new',
            builder:
                (context, state) => SessionGate(
                  child: TransactionFormScreen(
                    initialType:
                        state.uri.queryParameters['type'] == 'INCOME'
                            ? TransactionType.income
                            : TransactionType.expense,
                  ),
                ),
          ),
          GoRoute(
            path: ':id',
            name: 'transaction-detail',
            builder:
                (context, state) => SessionGate(
                  child: TransactionDetailScreen(
                    transactionId: state.pathParameters['id']!,
                  ),
                ),
            routes: <RouteBase>[
              GoRoute(
                path: 'edit',
                name: 'transaction-edit',
                builder:
                    (context, state) => SessionGate(
                      child: TransactionFormScreen(
                        transactionId: state.pathParameters['id']!,
                      ),
                    ),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.categories,
        name: 'categories',
        builder:
            (context, state) => const SessionGate(child: CategoriesScreen()),
      ),
      GoRoute(
        path: AppRoutes.paymentSources,
        name: 'payment-sources',
        builder:
            (context, state) =>
                const SessionGate(child: PaymentSourcesScreen()),
      ),
      // Legacy Expo URLs. Each redirects to its canonical route, carrying the
      // query string so a link that encoded filters keeps them.
      GoRoute(
        path: '/movimientos',
        redirect: (context, state) => _withQuery(AppRoutes.transactions, state),
      ),
      GoRoute(
        path: '/nuevo-gasto',
        redirect:
            (context, state) => _withQuery(AppRoutes.transactionNew, state),
      ),
      GoRoute(
        path: '/movimiento/:id',
        redirect:
            (context, state) => _withQuery(
              AppRoutes.transactionDetail(state.pathParameters['id']!),
              state,
            ),
      ),
    ],
  );
}

String _withQuery(String path, GoRouterState state) {
  final query = state.uri.query;
  return query.isEmpty ? path : '$path?$query';
}

/// Explicit 404 / Unknown Route Screen.
class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key, required this.path});

  final String path;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      key: const Key('not_found_screen'),
      appBar: AppBar(title: const Text('Página no encontrada')),
      body: Center(
        child: Padding(
          padding: AppSpacing.screenPadding,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: AppSpacing.cardInsets,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: AppColors.danger,
                      size: 48,
                    ),
                    const SizedBox(height: AppSpacing.screen),
                    Text(
                      '404 — Ruta desconocida',
                      style: theme.textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'La ruta "$path" no existe o no está disponible.',
                      style: theme.textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    FilledButton(
                      key: const Key('return_home_button'),
                      onPressed: () => context.go(AppRoutes.root),
                      child: const Text('Volver al Inicio'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
