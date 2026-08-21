/// Canonical route path constants for Nido.
///
/// The slugs are English while the legacy Expo runtime served Spanish ones.
/// Those old URLs are not broken: each is registered as a redirect to its
/// canonical path (see [legacyRouteRedirects] and `createRouter`), so a
/// bookmark or a link in a chat still lands on the right screen.
class AppRoutes {
  const AppRoutes._();

  /// Authenticated-with-household home.
  static const String root = '/';

  /// Google sign-in for the unauthenticated state.
  static const String signIn = '/sign-in';

  /// Household creation for an authenticated user without a household.
  static const String onboarding = '/onboarding';

  /// One-use invitation token acceptance.
  static const String invitation = '/invitation';

  /// The month's movements.
  static const String transactions = '/transactions';

  /// The new-movement form. Accepts `?type=INCOME` to open in income mode.
  static const String transactionNew = '/transactions/new';

  /// A movement's detail.
  static String transactionDetail(String id) => '/transactions/$id';

  /// A movement's edit form.
  ///
  /// A route of its own rather than the legacy `?transactionId=` query on the
  /// create form: editing has to survive a direct Web refresh, and a URL that
  /// only differs by a query parameter makes "new" and "edit" the same page
  /// in history.
  static String transactionEdit(String id) => '/transactions/$id/edit';

  /// Categories and subcategories CRUD.
  static const String categories = '/categories';

  /// Payment sources CRUD.
  static const String paymentSources = '/payment-sources';
}

/// Legacy Expo paths and the canonical route each one resolves to.
///
/// Redirect, not permanent alias: two live URLs for one screen would mean two
/// entries in history, two things to test on every change, and a service
/// worker that can cache the app under either. `:id` is carried across, and
/// `createRouter` preserves the query string so a filtered link keeps its
/// filters.
const Map<String, String> legacyRouteRedirects = <String, String>{
  '/movimientos': AppRoutes.transactions,
  '/nuevo-gasto': AppRoutes.transactionNew,
  '/movimiento/:id': '/transactions/:id',
};
