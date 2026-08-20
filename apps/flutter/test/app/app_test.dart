import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/app.dart';

void main() {
  group('NidoApp bootstrap', () {
    testWidgets(
      'a build without Firebase configuration boots into a recoverable '
      'error naming the missing keys instead of crashing',
      (tester) async {
        await tester.pumpWidget(const ProviderScope(child: NidoApp()));
        await tester.pumpAndSettle();

        expect(find.byType(MaterialApp), findsOneWidget);
        expect(find.byKey(const Key('session_error_screen')), findsOneWidget);
        expect(find.textContaining('FIREBASE_API_KEY'), findsOneWidget);
        // Auth never initialized, so signing out is not offered.
        expect(find.byKey(const Key('session_sign_out_button')), findsNothing);
      },
    );
  });
}
