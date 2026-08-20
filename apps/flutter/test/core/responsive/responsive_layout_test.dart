import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/responsive/responsive_breakpoints.dart';
import 'package:nido/core/responsive/responsive_layout.dart';

void main() {
  group('ResponsiveBreakpoints', () {
    test('classifies widths correctly into BreakpointSize', () {
      expect(ResponsiveBreakpoints.fromWidth(320), BreakpointSize.compact);
      expect(ResponsiveBreakpoints.fromWidth(599), BreakpointSize.compact);
      expect(ResponsiveBreakpoints.fromWidth(600), BreakpointSize.medium);
      expect(ResponsiveBreakpoints.fromWidth(839), BreakpointSize.medium);
      expect(ResponsiveBreakpoints.fromWidth(840), BreakpointSize.expanded);
      expect(ResponsiveBreakpoints.fromWidth(1440), BreakpointSize.expanded);
    });
  });

  group('ResponsiveLayout', () {
    testWidgets('renders compact builder on compact space (<600dp)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(400, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ResponsiveLayout(
              compact: (context, bp) => const Text('COMPACT_VIEW'),
              medium: (context, bp) => const Text('MEDIUM_VIEW'),
              expanded: (context, bp) => const Text('EXPANDED_VIEW'),
            ),
          ),
        ),
      );

      expect(find.text('COMPACT_VIEW'), findsOneWidget);
      expect(find.text('MEDIUM_VIEW'), findsNothing);
      expect(find.text('EXPANDED_VIEW'), findsNothing);
    });

    testWidgets('renders medium builder on medium space (600..839dp)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(720, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ResponsiveLayout(
              compact: (context, bp) => const Text('COMPACT_VIEW'),
              medium: (context, bp) => const Text('MEDIUM_VIEW'),
              expanded: (context, bp) => const Text('EXPANDED_VIEW'),
            ),
          ),
        ),
      );

      expect(find.text('MEDIUM_VIEW'), findsOneWidget);
      expect(find.text('COMPACT_VIEW'), findsNothing);
      expect(find.text('EXPANDED_VIEW'), findsNothing);
    });

    testWidgets('renders expanded builder on expanded space (>=840dp)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ResponsiveLayout(
              compact: (context, bp) => const Text('COMPACT_VIEW'),
              medium: (context, bp) => const Text('MEDIUM_VIEW'),
              expanded: (context, bp) => const Text('EXPANDED_VIEW'),
            ),
          ),
        ),
      );

      expect(find.text('EXPANDED_VIEW'), findsOneWidget);
      expect(find.text('COMPACT_VIEW'), findsNothing);
      expect(find.text('MEDIUM_VIEW'), findsNothing);
    });

    testWidgets('falls back to compact builder when medium/expanded omitted', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ResponsiveLayout(
              compact: (context, bp) => const Text('FALLBACK_COMPACT'),
            ),
          ),
        ),
      );

      expect(find.text('FALLBACK_COMPACT'), findsOneWidget);
    });
  });
}
