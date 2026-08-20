import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/app.dart';
import 'package:nido/app/router/app_router.dart';

void main() {
  group('NidoApp bootstrap', () {
    testWidgets('boots up and renders foundation screen', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: NidoApp()));
      await tester.pumpAndSettle();

      expect(find.byType(MaterialApp), findsOneWidget);
      expect(find.byType(FoundationScreen), findsOneWidget);
      expect(find.text('Nido Foundation'), findsOneWidget);
    });
  });
}
