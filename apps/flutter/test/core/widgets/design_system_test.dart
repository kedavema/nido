import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/theme/app_colors.dart';
import 'package:nido/app/theme/app_spacing.dart';
import 'package:nido/app/theme/app_theme.dart';
import 'package:nido/app/theme/app_typography.dart';
import 'package:nido/core/errors/app_error.dart';
import 'package:nido/core/widgets/action_button.dart';
import 'package:nido/core/widgets/amount_field.dart';
import 'package:nido/core/widgets/app_screen.dart';
import 'package:nido/core/widgets/confirm_dialog.dart';
import 'package:nido/core/widgets/filters_button.dart';
import 'package:nido/core/widgets/form_fields.dart';
import 'package:nido/core/widgets/inline_notice.dart';
import 'package:nido/core/widgets/month_stepper.dart';
import 'package:nido/core/widgets/nido_card.dart';
import 'package:nido/core/widgets/nido_chip.dart';
import 'package:nido/core/widgets/screen_header.dart';
import 'package:nido/core/widgets/sync_status_pill.dart';

Widget host(Widget child) => MaterialApp(
  theme: AppTheme.createLightTheme(),
  home: Scaffold(body: child),
);

void main() {
  group('ActionButton', () {
    testWidgets('a null callback disables it and dims it', (tester) async {
      await tester.pumpWidget(
        host(const ActionButton(label: 'Guardar', onPressed: null)),
      );

      expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 0.55);
      expect(
        tester
            .getSemantics(find.byType(ActionButton))
            .hasFlag(SemanticsFlag.isEnabled),
        isFalse,
      );
    });

    testWidgets('a loading button keeps its size and refuses taps', (
      tester,
    ) async {
      var taps = 0;
      await tester.pumpWidget(
        host(
          ActionButton(
            label: 'Guardar',
            loading: true,
            onPressed: () => taps++,
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Guardar'), findsNothing);

      await tester.tap(find.byType(ActionButton));
      await tester.pump();
      expect(taps, 0);
    });

    testWidgets('each variant paints its own surface', (tester) async {
      for (final (variant, background) in [
        (ActionButtonVariant.primary, AppColors.primary),
        (ActionButtonVariant.secondary, AppColors.surface),
        (ActionButtonVariant.danger, AppColors.dangerBackground),
      ]) {
        await tester.pumpWidget(
          host(ActionButton(label: 'X', variant: variant, onPressed: () {})),
        );
        final decoration =
            tester
                    .widgetList<Container>(find.byType(Container))
                    .firstWhere((c) => c.decoration is BoxDecoration)
                    .decoration!
                as BoxDecoration;
        expect(decoration.color, background, reason: '$variant');
      }
    });

    testWidgets('a tap runs the callback exactly once', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        host(ActionButton(label: 'Guardar', onPressed: () => taps++)),
      );

      await tester.tap(find.byType(ActionButton));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });

  group('NidoChip', () {
    testWidgets('the selected chip inverts, so it reads at a glance', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          Row(
            children: [
              NidoChip(label: 'Uno', selected: true, onPressed: () {}),
              NidoChip(label: 'Dos', selected: false, onPressed: () {}),
            ],
          ),
        ),
      );

      final decorations =
          tester
              .widgetList<Container>(find.byType(Container))
              .map((c) => c.decoration)
              .whereType<BoxDecoration>()
              .toList();

      expect(decorations.first.color, AppColors.primary);
      expect(decorations.last.color, AppColors.surface);
    });

    testWidgets('a SoftChip can be removed from where it is shown', (
      tester,
    ) async {
      var removed = 0;
      await tester.pumpWidget(
        host(
          SoftChip(
            label: 'Gastos',
            selected: true,
            onPressed: () {},
            onRemove: () => removed++,
            removeKey: const Key('remove'),
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('remove')));
      await tester.pump();
      expect(removed, 1);
    });
  });

  group('FiltersButton', () {
    testWidgets('names the count only once a filter is applied', (
      tester,
    ) async {
      await tester.pumpWidget(host(FiltersButton(count: 0, onPressed: () {})));
      expect(find.text('Filtros'), findsOneWidget);

      await tester.pumpWidget(host(FiltersButton(count: 2, onPressed: () {})));
      expect(find.text('Filtros · 2'), findsOneWidget);
    });

    testWidgets('tints only while the list is actually narrowed', (
      tester,
    ) async {
      BoxDecoration decorationOf() =>
          tester.widget<Container>(find.byType(Container)).decoration!
              as BoxDecoration;

      await tester.pumpWidget(host(FiltersButton(count: 0, onPressed: () {})));
      expect(decorationOf().color, AppColors.surface);

      await tester.pumpWidget(host(FiltersButton(count: 1, onPressed: () {})));
      expect(decorationOf().color, AppColors.primaryTint);
    });

    testWidgets('stands at the full touch target, unlike the chips', (
      tester,
    ) async {
      await tester.pumpWidget(host(FiltersButton(count: 0, onPressed: () {})));

      expect(
        tester.getSize(find.byType(FiltersButton)).height,
        greaterThanOrEqualTo(AppSpacing.touchTarget),
      );
    });
  });

  group('chips size to their content', () {
    // A `Container` with an `alignment` expands to fill bounded constraints,
    // and a `Wrap` hands its children exactly that — which stretched every
    // chip and the filters button across the whole row.
    Future<double> widthIn(WidgetTester tester, Widget chip) async {
      await tester.pumpWidget(
        host(SizedBox(width: 800, child: ChipRow(children: [chip]))),
      );
      return tester.getSize(find.byWidget(chip)).width;
    }

    testWidgets('a NidoChip is as wide as its label, not the row', (
      tester,
    ) async {
      final width = await widthIn(
        tester,
        NidoChip(label: 'Alimentación', selected: true, onPressed: () {}),
      );

      expect(width, lessThan(300));
    });

    testWidgets('a SoftChip is as wide as its label', (tester) async {
      final width = await widthIn(
        tester,
        SoftChip(label: 'Gastos', selected: false, onPressed: () {}),
      );

      expect(width, lessThan(300));
    });

    testWidgets('the filters button is as wide as its label', (tester) async {
      final width = await widthIn(
        tester,
        FiltersButton(count: 2, onPressed: () {}),
      );

      expect(width, lessThan(300));
    });

    testWidgets('several chips share one row instead of stacking', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          SizedBox(
            width: 800,
            child: ChipRow(
              children: [
                NidoChip(
                  key: const Key('a'),
                  label: 'Uno',
                  selected: false,
                  onPressed: () {},
                ),
                NidoChip(
                  key: const Key('b'),
                  label: 'Dos',
                  selected: false,
                  onPressed: () {},
                ),
              ],
            ),
          ),
        ),
      );

      final first = tester.getRect(find.byKey(const Key('a')));
      final second = tester.getRect(find.byKey(const Key('b')));
      expect(second.left, greaterThan(first.right - 1));
      expect(second.top, first.top);
    });
  });

  group('typography', () {
    testWidgets('the brand faces are the ones the theme names', (tester) async {
      await tester.pumpWidget(
        host(
          Builder(
            builder: (context) {
              final text = Theme.of(context).textTheme;
              // A family Flutter cannot resolve silently falls back to
              // Roboto, which is exactly the regression this guards.
              expect(text.displayLarge?.fontFamily, 'Bricolage Grotesque');
              expect(text.titleMedium?.fontFamily, 'Bricolage Grotesque');
              expect(text.bodyMedium?.fontFamily, 'IBM Plex Sans');
              expect(text.bodySmall?.fontFamily, 'IBM Plex Sans');
              return const SizedBox.shrink();
            },
          ),
        ),
      );
    });

    testWidgets('the amount readout uses the display face at 44', (
      tester,
    ) async {
      final controller = TextEditingController(text: '386.500');
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        host(
          AmountField(controller: controller, prefix: 'Gs.', onChanged: (_) {}),
        ),
      );

      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.style?.fontSize, AppTypography.amountSize);
      expect(field.style?.fontFamily, AppTypography.displayFontFamily);
      expect(find.text('Gs.'), findsOneWidget);
    });
  });

  group('AmountField', () {
    testWidgets('reports every keystroke so the draft can sanitize it', (
      tester,
    ) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);
      final seen = <String>[];

      await tester.pumpWidget(
        host(
          AmountField(
            controller: controller,
            prefix: 'Gs.',
            onChanged: seen.add,
          ),
        ),
      );

      await tester.enterText(find.byType(TextField), '150000');
      expect(seen, ['150000']);
    });

    testWidgets('a PYG keyboard offers no decimal separator', (tester) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        host(
          AmountField(controller: controller, prefix: 'Gs.', onChanged: (_) {}),
        ),
      );

      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.keyboardType.toString(), isNot(contains('decimal: true')));
    });
  });

  group('InlineNotice', () {
    testWidgets('each tone gets its own pair, and announces itself', (
      tester,
    ) async {
      for (final (tone, background) in [
        (NoticeTone.info, AppColors.primaryTint),
        (NoticeTone.success, AppColors.successBackground),
        (NoticeTone.error, AppColors.dangerBackground),
        (NoticeTone.warning, AppColors.warningBackground),
      ]) {
        await tester.pumpWidget(
          host(InlineNotice(message: 'algo', tone: tone)),
        );
        final decoration =
            tester.widget<Container>(find.byType(Container)).decoration!
                as BoxDecoration;
        expect(decoration.color, background, reason: '$tone');
      }

      // A failure that appears after an action has to reach a screen reader
      // without the user going looking for it.
      expect(
        tester
            .getSemantics(find.text('algo'))
            .hasFlag(SemanticsFlag.isLiveRegion),
        isTrue,
      );
    });
  });

  group('MonthStepper', () {
    testWidgets('steps in both directions and shows the label', (tester) async {
      var back = 0;
      var forward = 0;

      await tester.pumpWidget(
        host(
          MonthStepper(
            label: 'Agosto 2026',
            onPrevious: () => back++,
            onNext: () => forward++,
          ),
        ),
      );

      expect(find.text('Agosto 2026'), findsOneWidget);
      await tester.tap(find.byKey(const Key('previous_month_button')));
      await tester.tap(find.byKey(const Key('next_month_button')));
      await tester.pump();

      expect(back, 1);
      expect(forward, 1);
    });

    testWidgets('the label is optional where the title already says it', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(MonthStepper(onPrevious: () {}, onNext: () {})),
      );

      expect(find.byKey(const Key('month_label')), findsNothing);
    });
  });

  group('ScreenHeader / FormHeader', () {
    testWidgets('a trailing control sits beside the title, not under it', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const ScreenHeader(
            title: 'Movimientos',
            trailing: SizedBox(key: Key('trailing'), width: 40, height: 40),
          ),
        ),
      );

      final title = tester.getRect(find.text('Movimientos'));
      final trailing = tester.getRect(find.byKey(const Key('trailing')));
      expect(trailing.left, greaterThan(title.left));
      expect(trailing.top, lessThan(title.bottom));
    });

    testWidgets('the dismiss affordance is offered only when it can act', (
      tester,
    ) async {
      await tester.pumpWidget(host(const FormHeader(title: 'Nuevo gasto')));
      expect(find.byKey(const Key('form_header_dismiss')), findsNothing);

      var dismissed = 0;
      await tester.pumpWidget(
        host(FormHeader(title: 'Nuevo gasto', onDismiss: () => dismissed++)),
      );
      await tester.tap(find.byKey(const Key('form_header_dismiss')));
      await tester.pump();
      expect(dismissed, 1);
    });
  });

  group('SyncStatusPill', () {
    testWidgets('one visual language for "did this reach the server"', (
      tester,
    ) async {
      for (final (tone, text) in [
        (SyncStatusTone.synced, '✓ Sincronizado'),
        (SyncStatusTone.pending, '⟳ Pendiente de sincronizar'),
      ]) {
        await tester.pumpWidget(host(SyncStatusPill(tone: tone)));
        expect(find.text(text), findsOneWidget);
      }
    });
  });

  group('destructive confirmation', () {
    Future<void> open(
      WidgetTester tester, {
      required Future<void> Function() onConfirm,
    }) async {
      await tester.pumpWidget(
        host(
          Builder(
            builder:
                (context) => ActionButton(
                  label: 'Abrir',
                  onPressed:
                      () => showDestructiveConfirmDialog(
                        context: context,
                        title: '¿Eliminar esto?',
                        message: 'Se elimina para los dos.',
                        confirmLabel: 'Eliminar',
                        onConfirm: onConfirm,
                      ),
                ),
          ),
        ),
      );
      await tester.tap(find.text('Abrir'));
      await tester.pumpAndSettle();
    }

    testWidgets('confirming runs the action and closes', (tester) async {
      var ran = 0;
      await open(tester, onConfirm: () async => ran++);

      expect(find.text('¿Eliminar esto?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirm_dialog_confirm')));
      await tester.pumpAndSettle();

      expect(ran, 1);
      expect(find.text('¿Eliminar esto?'), findsNothing);
    });

    testWidgets('a failure reports in place and keeps the sheet open', (
      tester,
    ) async {
      await open(
        tester,
        onConfirm: () async => throw const UnavailableError(statusCode: 500),
      );

      await tester.tap(find.byKey(const Key('confirm_dialog_confirm')));
      await tester.pumpAndSettle();

      // The row is still there, and the user has to know it never went.
      expect(find.text('¿Eliminar esto?'), findsOneWidget);
      expect(
        find.text('Nido no pudo conectarse con el servicio. Intentá de nuevo.'),
        findsOneWidget,
      );
    });

    testWidgets('cancelling neither runs nor reports', (tester) async {
      var ran = 0;
      await open(tester, onConfirm: () async => ran++);

      await tester.tap(find.byKey(const Key('confirm_dialog_cancel')));
      await tester.pumpAndSettle();

      expect(ran, 0);
      expect(find.text('¿Eliminar esto?'), findsNothing);
    });
  });

  group('AppScreen shells', () {
    testWidgets('a floating action never scrolls with the content', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.createLightTheme(),
          home: AppScreen(
            floatingAction: const SizedBox(
              key: Key('fab'),
              width: 120,
              height: 48,
            ),
            children: [
              for (var index = 0; index < 40; index++)
                SizedBox(height: 60, child: Text('fila $index')),
            ],
          ),
        ),
      );

      final before = tester.getRect(find.byKey(const Key('fab')));
      await tester.drag(find.text('fila 0'), const Offset(0, -400));
      await tester.pumpAndSettle();

      expect(tester.getRect(find.byKey(const Key('fab'))), before);
    });

    testWidgets('the form footer stays pinned below the fields', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.createLightTheme(),
          home: AppFormScreen(
            footer: const SizedBox(key: Key('footer'), height: 48),
            children: [
              for (var index = 0; index < 30; index++)
                SizedBox(height: 60, child: Text('campo $index')),
            ],
          ),
        ),
      );

      final footer = tester.getRect(find.byKey(const Key('footer')));
      await tester.drag(find.text('campo 0'), const Offset(0, -300));
      await tester.pumpAndSettle();

      expect(tester.getRect(find.byKey(const Key('footer'))), footer);
    });
  });

  group('form fields', () {
    testWidgets('a field shows its label, control and error together', (
      tester,
    ) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        host(
          NidoFormField(
            label: 'Nombre',
            error: 'Escribí algo',
            child: NidoTextField(controller: controller, hasError: true),
          ),
        ),
      );

      expect(find.text('Nombre'), findsOneWidget);
      expect(find.text('Escribí algo'), findsOneWidget);
    });

    testWidgets('a section offers "ver todas" without adding a chip', (
      tester,
    ) async {
      var opened = 0;
      await tester.pumpWidget(
        host(
          FormSection(
            label: 'Categoría',
            sublabel: 'recientes',
            onSeeAll: () => opened++,
            child: const ChipRow(children: []),
          ),
        ),
      );

      expect(find.text('Categoría · recientes'), findsOneWidget);
      await tester.tap(find.byKey(const Key('see_all_Categoría')));
      await tester.pump();
      expect(opened, 1);
    });
  });

  group('NidoCard', () {
    testWidgets('carries the one elevation Nido uses', (tester) async {
      await tester.pumpWidget(
        host(const NidoCard(children: [Text('contenido')])),
      );

      final decoration =
          tester.widget<Container>(find.byType(Container)).decoration!
              as BoxDecoration;
      expect(decoration.color, AppColors.surface);
      expect(decoration.boxShadow, isNotEmpty);
    });
  });
}
