/// Canonical route path constants for Nido.
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
}
