import 'package:integration_test/integration_test_driver.dart';

/// Host-side driver for `integration_test/` targets. `flutter test` does not
/// pick up `integration_test/` on its own; CI runs these via
/// `flutter drive --driver=test_driver/integration_test.dart -d web-server`
/// against chromedriver (see `.github/workflows/ci.yml`).
Future<void> main() => integrationDriver();
