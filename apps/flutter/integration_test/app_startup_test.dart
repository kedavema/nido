import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nido/app/app.dart';
import 'package:nido/app/router/app_router.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Foundation E2E startup test', () {
    testWidgets('boots up Nido, displays foundation screen, and verifies core cards', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: NidoApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(FoundationScreen), findsOneWidget);
      expect(find.text('Nido Foundation'), findsOneWidget);
      expect(find.text('Paleta de Tokens Visuales'), findsOneWidget);
    });
  });
}
