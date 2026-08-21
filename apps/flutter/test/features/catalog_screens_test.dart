import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/app/router/app_routes.dart';
import 'package:nido/core/errors/app_error.dart';
import 'package:nido/core/widgets/action_button.dart';
import 'package:nido/testing/finance_fakes.dart';

import 'pump_app.dart';

void main() {
  late FinanceHarness harness;

  setUp(() => harness = FinanceHarness());

  group('categories screen', () {
    testWidgets('lists both kinds with their roots and child counts', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.categories);

      expect(find.byKey(const Key('categories_screen')), findsOneWidget);
      expect(find.text('Egresos'), findsOneWidget);
      expect(find.text('Ingresos'), findsOneWidget);
      expect(find.text('Alimentación'), findsOneWidget);
      // The archived child counts: it still owns history.
      expect(find.text('2 subcategorías'), findsOneWidget);
      expect(find.text('0 subcategorías'), findsOneWidget);
      expect(harness.categories.listCalls, 1);
    });

    testWidgets('expanding a root reveals its children, archived flagged', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.categories);
      await tapAt(
        tester,
        find.byKey(const Key('category_root_$expenseRootId')),
      );

      expect(find.text('Supermercado'), findsOneWidget);
      expect(find.text('Delivery · Archivada'), findsOneWidget);
      expect(find.byKey(const Key('add_child_$expenseRootId')), findsOneWidget);
    });

    testWidgets('a root editor offers appearance; a child editor does not', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.categories);
      await tapAt(
        tester,
        find.byKey(const Key('category_root_$expenseRootId')),
      );
      await tapAt(tester, find.byKey(const Key('edit_root_$expenseRootId')));

      expect(find.text('Editar categoría'), findsOneWidget);
      expect(find.byKey(const Key('category_icon_restaurant')), findsOneWidget);

      await tapAt(tester, find.byKey(const Key('form_header_dismiss')));
      await tapAt(
        tester,
        find.byKey(const Key('category_child_$expenseChildId')),
      );

      expect(find.text('Editar subcategoría'), findsOneWidget);
      // A subcategory inherits its root's icon and colour; offering them
      // here would let the two representations drift apart.
      expect(find.byKey(const Key('category_icon_restaurant')), findsNothing);
      // It does get the parent picker a root must never have.
      expect(find.text('Raíz'), findsOneWidget);
    });

    testWidgets('saving an edit sends only the fields the form owns', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.categories);
      await tapAt(
        tester,
        find.byKey(const Key('category_root_$expenseRootId')),
      );
      await tapAt(tester, find.byKey(const Key('edit_root_$expenseRootId')));

      await tester.enterText(
        find.byKey(const Key('category_name_field')),
        'Comida',
      );
      await tester.pumpAndSettle();
      await tapAt(tester, find.byKey(const Key('save_category_button')));

      final (id, request) = harness.categories.updated.single;
      expect(id, expenseRootId);
      expect(request.toJson(), {
        'name': 'Comida',
        'icon': 'restaurant',
        'color': '#3E6B34',
        // A root keeps a null parent: coercing it to its own id would make
        // the category its own parent.
        'parentId': null,
        'isActive': true,
      });
      expect(find.byKey(const Key('categories_screen')), findsOneWidget);
    });

    testWidgets('save is disabled until the name is not blank', (tester) async {
      await harness.pump(tester, AppRoutes.categories);
      await tapAt(tester, find.byKey(const Key('new_root_button_EXPENSE')));

      final button = find.byKey(const Key('save_category_button'));
      expect(tester.widget<ActionButton>(button).onPressed, isNull);

      await tester.enterText(
        find.byKey(const Key('category_name_field')),
        '   ',
      );
      await tester.pumpAndSettle();
      expect(tester.widget<ActionButton>(button).onPressed, isNull);

      await tester.enterText(
        find.byKey(const Key('category_name_field')),
        'Mascotas',
      );
      await tester.pumpAndSettle();
      expect(tester.widget<ActionButton>(button).onPressed, isNotNull);
    });

    testWidgets('a new root is appended past the existing sort order', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.categories);
      await tapAt(tester, find.byKey(const Key('new_root_button_EXPENSE')));
      await tester.enterText(
        find.byKey(const Key('category_name_field')),
        'Mascotas',
      );
      await tester.pumpAndSettle();
      await tapAt(tester, find.byKey(const Key('save_category_button')));

      final request = harness.categories.created.single;
      expect(request.parentId, isNull);
      expect(request.sortOrder, 1);
    });

    testWidgets('archiving asks first and says what it does not destroy', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.categories);
      await tapAt(
        tester,
        find.byKey(const Key('category_root_$expenseRootId')),
      );
      await tapAt(tester, find.byKey(const Key('edit_root_$expenseRootId')));
      await tapAt(tester, find.byKey(const Key('archive_category_button')));

      expect(find.text('¿Archivar Alimentación?'), findsOneWidget);
      expect(find.textContaining('El historial ya cargado'), findsOneWidget);
      expect(harness.categories.archived, isEmpty);

      await tapAt(tester, find.byKey(const Key('confirm_dialog_cancel')));
      expect(harness.categories.archived, isEmpty);

      await tapAt(tester, find.byKey(const Key('archive_category_button')));
      await tapAt(tester, find.byKey(const Key('confirm_dialog_confirm')));

      expect(harness.categories.archived, [expenseRootId]);
    });

    testWidgets('a failed archive reports in place and keeps the row', (
      tester,
    ) async {
      harness.categories.onArchive = (_) async => throw const ConflictError();

      await harness.pump(tester, AppRoutes.categories);
      await tapAt(
        tester,
        find.byKey(const Key('category_root_$expenseRootId')),
      );
      await tapAt(tester, find.byKey(const Key('edit_root_$expenseRootId')));
      await tapAt(tester, find.byKey(const Key('archive_category_button')));
      await tapAt(tester, find.byKey(const Key('confirm_dialog_confirm')));

      expect(
        find.text(
          'La acción ya fue realizada o entra en conflicto con el estado '
          'actual.',
        ),
        findsOneWidget,
      );
      // Still open: the user has to know the archive did not happen.
      expect(find.byKey(const Key('confirm_dialog_confirm')), findsOneWidget);
    });

    testWidgets('a load failure shows safe copy and retries', (tester) async {
      harness.categories.listError = const UnavailableError(statusCode: 500);
      await harness.pump(tester, AppRoutes.categories);

      expect(
        find.text('Nido no pudo conectarse con el servicio. Intentá de nuevo.'),
        findsOneWidget,
      );

      harness.categories.listError = null;
      await tapAt(tester, find.byKey(const Key('retry_button')));

      expect(find.text('Alimentación'), findsOneWidget);
    });
  });

  group('payment sources screen', () {
    testWidgets('lists each source with its type, holder and state', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.paymentSources);

      expect(find.byKey(const Key('payment_sources_screen')), findsOneWidget);
      // Twice: the household named this source "Efectivo" and its type is
      // also labelled Efectivo.
      expect(find.text('Efectivo'), findsNWidgets(2));
      expect(find.text('Itaú Ale'), findsOneWidget);
      expect(find.text('Cuenta bancaria · Ale'), findsOneWidget);
      expect(find.text('Billetera digital · Archivado'), findsOneWidget);
      // An archived source offers no archive action.
      expect(
        find.byKey(const Key('archive_payment_source_$archivedSourceId')),
        findsNothing,
      );
    });

    testWidgets('creating one sends the chosen type and holder', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.paymentSources);
      await tapAt(tester, find.byKey(const Key('add_payment_source_button')));

      await tester.enterText(
        find.byKey(const Key('payment_source_name_field')),
        'Tarjeta Visa',
      );
      await tester.pumpAndSettle();
      await tapAt(
        tester,
        find.byKey(const Key('payment_source_type_CREDIT_CARD')),
      );
      await tapAt(tester, find.byKey(const Key('save_payment_source_button')));

      final request = harness.paymentSources.created.single;
      expect(request.toJson(), {'name': 'Tarjeta Visa', 'type': 'CREDIT_CARD'});
    });

    testWidgets('a new source offers no state control', (tester) async {
      await harness.pump(tester, AppRoutes.paymentSources);
      await tapAt(tester, find.byKey(const Key('add_payment_source_button')));

      // Nothing exists to archive yet.
      expect(
        find.byKey(const Key('payment_source_state_archived')),
        findsNothing,
      );
    });

    testWidgets('editing can clear the informative holder explicitly', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.paymentSources);
      await tapAt(
        tester,
        find.byKey(const Key('edit_payment_source_$bankSourceId')),
      );
      await tapAt(tester, find.byKey(const Key('payment_source_owner_none')));
      await tapAt(tester, find.byKey(const Key('save_payment_source_button')));

      final (id, request) = harness.paymentSources.updated.single;
      expect(id, bankSourceId);
      // Explicit null, not an omitted field: the holder is being cleared.
      expect(request.toJson()['ownerUserId'], isNull);
      expect(request.toJson().containsKey('ownerUserId'), isTrue);
    });

    testWidgets('archiving asks first and names what stays intact', (
      tester,
    ) async {
      await harness.pump(tester, AppRoutes.paymentSources);
      await tapAt(
        tester,
        find.byKey(const Key('archive_payment_source_$cashSourceId')),
      );

      expect(find.text('¿Archivar Efectivo?'), findsOneWidget);
      await tapAt(tester, find.byKey(const Key('confirm_dialog_confirm')));

      expect(harness.paymentSources.archived, [cashSourceId]);
    });

    testWidgets('an empty catalog says so instead of showing a blank card', (
      tester,
    ) async {
      harness.paymentSources.paymentSources = [];
      await harness.pump(tester, AppRoutes.paymentSources);

      expect(find.text('Todavía no hay medios de pago.'), findsOneWidget);
    });
  });
}
