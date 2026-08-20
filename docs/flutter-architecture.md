# Arquitectura objetivo de Flutter

Estado: propuesta inicial derivada de la auditoría  
Aplica a: Android, iOS y Web desde una sola codebase  
No autoriza: eliminar Expo, reescribir backend ni ampliar el alcance funcional

## Principios

1. Preservar comportamiento antes de mejorarlo.
2. PostgreSQL/API siguen siendo la fuente de verdad.
3. Feature-first; capas internas solo cuando aclaran dependencias.
4. Estado async explícito y acotado por feature.
5. Dinero y fechas son value objects, no primitives ambiguos.
6. UI compartida por capacidad y espacio, no por `kIsWeb` disperso.
7. Offline conserva inicialmente el alcance actual: solo alta de movimiento.
8. Android/Web alcanzan paridad; iOS tiene gates greenfield adicionales.
9. Expo y Flutter coexistirán hasta verificar paridad funcional del frontend.
10. Dependencias pequeñas, justificadas y multiplataforma.

## Ubicación y convivencia

Durante el rewrite, Flutter vivirá en `apps/flutter`. `apps/mobile` continuará siendo la referencia
ejecutable Android/PWA. Esto permite migración vertical, comparación y rollback sin mezclar ambos
runtimes.

No se renombrará ni borrará `apps/mobile` hasta que:

- las features aplicables estén `VERIFIED`;
- Android y Web pasen su matriz de validación;
- iOS complete sus gates greenfield;
- no haya bugs bloqueantes;
- service worker, auth y deep links tengan plan de corte probado.

## Estructura propuesta

```text
apps/flutter/
  lib/
    app/
      bootstrap/
      router/
      theme/
      responsive/
    core/
      api/
      auth/
      errors/
      money/
      time/
      storage/
      widgets/
    features/
      authentication/
      household/
      invitations/
      categories/
      payment_sources/
      transactions/
      dashboard/
      offline_queue/
      recurring_expenses/
      expected_income/
      budgets/
      reports/
      notifications/
  test/
  integration_test/
```

No se crean `accounts`, `imports`, `bank_sync` ni `settings` porque no existen como features
actuales. Payment sources no se renombra “accounts”: no tiene saldo, moneda ni ledger.

`notifications` puede comenzar como un spike/adapter vacío de UI, porque hoy no hay una feature
usable que portar. Solo se implementará tras decidir backend/canales Flutter.

### Estructura interna de una feature

La forma máxima, no obligatoria:

```text
transactions/
  data/
    transaction_api.dart
    transaction_dto.dart
    transaction_repository.dart
  domain/
    transaction.dart
    transaction_filters.dart
    transaction_form.dart
  presentation/
    controllers/
    screens/
    widgets/
```

Reglas:

- Una API simple puede ser el repository concreto; no se exige interface con una implementación.
- Un flujo puede llamar al repository desde su controller; no se exige un “use case” pass-through.
- `domain/` se justifica para invariantes, cálculos y tipos compartidos dentro de la feature.
- DTO y domain model pueden ser el mismo tipo si no filtran conceptos de transporte a la UI.
- Se extraen widgets cuando aparecen varias veces o contienen una unidad visual/testable real.
- No se crean barrels globales que oculten dependencias entre features.

## Bootstrap y dependencias

El bootstrap construirá un `ProviderScope` con overrides de entorno para:

- Firebase Auth;
- API client;
- clock/timezone;
- connectivity;
- secure storage;
- queue store;
- summary cache;
- UUID generator;
- development logger redactado.

Producción no debe depender de service locators estáticos. Tests podrán sustituir cada dependencia
sin inicializar Firebase, red o DB real.

## Estado con Riverpod

Riverpod es apropiado porque el producto combina sesión, estados async parametrizados por hogar y
mes, invalidación entre features, dependencias reemplazables y flows offline. Permite expresar esas
relaciones sin `BuildContext`, modelar loading/error/data y probar controllers de forma aislada.

Patrón:

- providers pequeños para dependencias estables;
- `AsyncNotifier` para lifecycle async de una pantalla/feature;
- families para `householdId`, mes, id y filtros;
- providers derivados para cálculos puros y selecciones estrechas;
- estado efímero puramente visual en widgets cuando no es lógica de negocio;
- invalidación dirigida después de mutaciones;
- nunca un `AppStateProvider` o `CatalogProvider` con todo el producto.

Ejemplos conceptuales:

```text
authSessionProvider
activeHouseholdProvider
monthlySummaryProvider(householdId, yearMonth)
transactionsProvider(householdId, filters)
transactionFormControllerProvider(optionalTransactionId)
syncQueueProvider
```

`AsyncValue` representa loading/error/data. Estados que requieren más detalle —por ejemplo
`stale cache + network error` o `queued/syncing/error`— usarán sealed types propios; no se reducirá
información para encajarla en un booleano.

## Routing con go_router

`go_router` se utilizará salvo que un spike de plataforma revele una incompatibilidad concreta.

Responsabilidades:

- rutas declarativas y URLs estables;
- redirect según sesión resuelta;
- onboarding cuando el usuario autenticado no pertenece a un hogar;
- deep links de movimientos y occurrences;
- refresh directo Web;
- navegación modal/sheet por composición visual, no por perder la URL;
- shells responsive con navegación distinta según ancho.

El redirect no debe disparar requests duplicadas ni oscilar entre rutas. Bootstrap expone un estado
de sesión único: initializing, unauthenticated, authenticated-without-household,
authenticated-with-household o recoverable-error.

Rutas canónicas candidatas derivadas del producto real:

```text
/sign-in
/onboarding
/invitation
/
/transactions
/transactions/new
/transactions/:id
/budget
/budget/edit
/recurring-expenses
/recurring-expenses/new
/recurring-expenses/:id
/occurrences/:id/settle
/expected-income
/expected-income/new
/expected-income/:id
/reports
/categories
/payment-sources
/household
```

Estos slugs ingleses no autorizan romper URLs existentes. El runtime actual ya expone paths
españoles y el service worker contiene `/pagar-fijo/:id`. Antes de fijar rutas finales se construirá
una tabla completa de compatibilidad. Como mínimo:

| URL legacy             | Candidata Flutter              | Regla de transición                  |
| ---------------------- | ------------------------------ | ------------------------------------ |
| `/movimientos`         | `/transactions`                | alias o redirect preservando filtros |
| `/nuevo-gasto`         | `/transactions/new`            | alias/redirect                       |
| `/movimiento/:id`      | `/transactions/:id`            | alias/redirect preservando `id`      |
| `/presupuesto`         | `/budget`                      | alias/redirect preservando `month`   |
| `/editar-presupuesto`  | `/budget/edit`                 | alias/redirect preservando `month`   |
| `/fijos`               | `/recurring-expenses`          | alias/redirect                       |
| `/pagar-fijo/:id`      | `/occurrences/:id/settle`      | alias + push/deep-link test          |
| `/ingresos`            | `/expected-income`             | alias/redirect                       |
| `/recibir-ingreso/:id` | `/expected-income/:id/receive` | alias/redirect preservando `id`      |
| `/informes`            | `/reports`                     | alias/redirect                       |

También se cubrirán `/nuevo-fijo`, `/fijo/:id`, `/nuevo-ingreso` e `/ingreso/:id`. Los tests deben
ejecutar navegación interna, link externo y refresh directo Web, conservar query strings y validar
la actualización coordinada del service worker. Solo después se elegirá si el alias legacy queda
permanente o se redirige.

## Responsive design

Se definen clases semánticas por espacio disponible, no por plataforma:

- `compact`: una columna, bottom navigation, acciones full-width;
- `medium`: contenido limitado, navigation rail o master/detail cuando aporte valor;
- `expanded`: sidebar/rail persistente, grids y paneles simultáneos.

Los umbrales iniciales se calibrarán con layouts reales; no son una API de dominio. Un solo
`ResponsiveScope`/helper traduce constraints a clase. Widgets reciben la clase o usan
`LayoutBuilder` localmente.

Composiciones:

| Área        | Compact                | Medium/Expanded                                |
| ----------- | ---------------------- | ---------------------------------------------- |
| Navegación  | bottom tabs            | rail/sidebar                                   |
| Dashboard   | cards verticales       | grid y paneles paralelos                       |
| Movimientos | lista + detalle pushed | master/detail si hay ancho                     |
| Formularios | una columna + footer   | formulario limitado y resumen lateral opcional |
| Catálogos   | lista + sheets         | lista/editor en paneles cuando mejore el flujo |

`kIsWeb` solo se admite para capacidades genuinas: service worker/Web Push, descarga o APIs del
navegador. Nunca para decidir si un layout es desktop.

## Design system

Foundation portará los tokens observados, no el código generado en `design/`:

- `ColorScheme` desde primary/accent/surfaces/semantic colors;
- `TextTheme` con Bricolage Grotesque e IBM Plex Sans;
- spacing/radius/touch constants acotadas;
- `ThemeExtension` solo para tokens sin equivalente Material (por ejemplo sync state/category
  swatches);
- light theme primero, porque no existe dark mode actual.

Componentes iniciales, porque existen realmente:

- app/page/form shells;
- card y action button;
- loading, error, empty, inline notice y skeleton;
- money text/amount field;
- transaction tile y pending transaction tile;
- category selector/chip;
- payment-source selector;
- local date/month controls;
- sync status;
- confirm dialog/bottom sheet.

No se crea una librería enterprise ni un charts package. Las barras actuales se pueden construir
con primitives Flutter accesibles y testeables.

## Modelos y serialización

Requisitos:

- inmutables;
- nullability explícita;
- enums exhaustivos;
- JSON parseado en frontera;
- igualdad/copy semantics predecibles;
- ningún `Map<String, dynamic>` fuera del parser/adapters.

Propuesta: Freezed + `json_serializable` para el conjunto amplio de DTOs, unions y copy/equality.
No se usará codegen para tipos triviales si Dart 3 los expresa claramente. La elección final se
confirma en foundation midiendo tamaño generado, ergonomía y compatibilidad Web.

Los DTOs Dart se contrastarán con fixtures JSON versionados generados desde Zod. Cambios en
`packages/contracts` deberán actualizar fixtures y tests Dart en el mismo cambio.

## Dinero

Modelo propuesto:

```text
Currency = PYG | USD
Money(currency, minorUnits: BigInt)
FxRateToPyg(unscaled: BigInt, scale: int)
BaseAmountPyg(units: BigInt)
```

Reglas:

- `double` está prohibido para monto, FX y agregados;
- wire permanece string decimal;
- PYG escala 0; USD escala 2;
- parser rechaza valores fuera del contrato;
- UI conserva borradores parciales como un tipo de input, separado de `Money` válido;
- USD×FX→PYG usa enteros escalados y half-up una sola vez;
- queued mutation persiste la request canónica exacta usada con su idempotency key;
- porcentajes usan rational/decimal o `double` únicamente después de aislarlos de dinero y limitar
  entrada.

Se portarán los vectores de `transactions-money` y `expense-form` a Dart, incluidos límites,
overflow, ceros y round-half-up. Los gaps contractuales de FX/zero se preservan hasta resolver sus
tickets.

## Fechas y timezone

Tipos:

- `LocalDate` para `yyyy-MM-dd`;
- `YearMonth` para `yyyy-MM`;
- `Instant`/UTC `DateTime` para timestamps;
- timezone IANA del hogar, inicialmente `America/Asuncion`.

No se usará un `DateTime` local ambiguo como fecha financiera. Un módulo central implementará:

- parse/format wire;
- today en timezone del hogar;
- rangos de mes;
- add/subtract month;
- last-day clamp;
- conversión de fecha elegida a `occurredAt` preservando la regla actual;
- labels `hoy/ayer`;
- recurrencia y tests de leap year/DST.

Editar una recurrencia no alterará `firstDueDate` sin una intención explícita: el bug legacy que hoy
desplaza el ancla temporal requiere una decisión y tests antes de definir la semántica Flutter. El
estado not-found de un ID de edición será distinto del draft nuevo para impedir una creación
accidental; el expected behavior final queda registrado en su ticket.

Se evaluará el package `timezone`; `intl` se usa para presentación. La dependencia se justificará
por reglas IANA/DST, no solo formatting.

## API

Dio es la propuesta porque la API real necesita interceptors, timeout/cancelación, clasificación de
errores y políticas distintas para GET/mutaciones. Retrofit no se añade inicialmente: el número de
endpoints es manejable y otro generador no aporta claridad hasta demostrarlo.

El cliente preserva:

- base URL nativa vs same-origin Web;
- Firebase token por request;
- timeout 15 s;
- cold-start retry único solo en GET y máximo equivalente al actual;
- cero retries automáticos de mutaciones;
- `Idempotency-Key` exacto;
- cancelación al abandonar pantalla;
- parsing/validation de responses;
- mensajes de UI independientes de strings backend;
- logs solo debug, con redacción total de Authorization, invite tokens y cuerpos financieros.

No se añade un refresh interceptor propio: Firebase SDK sigue gestionando ID Tokens.

## Offline y cache

### Fuente de verdad

- Server/PostgreSQL: datos financieros y catálogos.
- Queue local: mutaciones de alta aún no confirmadas.
- Summary cache: último snapshot para UX degradada; nunca autoridad para escribir.

### Operaciones

| Operación                         | Sin red inicial           |
| --------------------------------- | ------------------------- |
| Crear gasto/ingreso recibido      | encola con idempotencia   |
| Leer summary                      | último snapshot si existe |
| Leer otras listas                 | error/estado sin conexión |
| Editar/eliminar                   | requiere conexión         |
| Catálogos/budget/recurring/settle | requiere conexión         |

No hay resolución de conflictos general porque no hay sync general. Un 409 idempotente requiere
estado de error explícito y acción segura; nunca retry infinito.

### Store

La elección de la tecnología de persistencia local se realizará en el módulo offline. Un spike debe comprobar:

- Android, iOS y Web;
- persistencia y cifrado apropiado;
- stores limpias e inicialización determinista (sin necesidad de bridge/drain legacy al ser datos descartables);
- transacciones y schema migrations;
- tamaño Web/Wasm/service worker;
- tests deterministas.

## Autenticación y almacenamiento seguro

- Firebase Auth Google se conserva por compatibilidad backend.
- Native guarda material de sesión mediante el storage seguro recomendado por Firebase/Flutter;
  nunca shared preferences.
- Web acepta la seguridad propia de Firebase browser persistence; no se simula “secure storage” en
  JavaScript.
- Logout consulta la cola y exige decisión explícita si hay pendientes.
- Sesión invalidada no puede reproducir silenciosamente filas de otra identidad.
- No se almacenan service-account credentials ni secretos en bundle.
- Configuración pública Firebase permanece pública; secretos backend siguen fuera del cliente.

iOS requiere configuración Firebase/Google nueva y validación real. No se asumirá que Android
config se traslada automáticamente.

## Notificaciones

Estado actual: backend soporta `ANDROID/WEB` y canales `EXPO/WEB_PUSH`; cliente no registra una
instalación de extremo a extremo. Flutter no debe fingir paridad.

Spike obligatorio:

- Android Flutter con FCM frente a conservar un puente Expo;
- iOS/APNs/FCM y extensión de enums/DB;
- Web Push y ownership del service worker Flutter;
- deep links;
- migración/deactivación de installations legacy;
- permisos y UX;
- enqueue cron/sweep actualmente incompleto;
- tests de proveedor sin datos financieros.

Esto puede requerir cambio backend; es la excepción conocida a “backend estable” y se aprobará por
decisión separada.

## Errores, seguridad y observabilidad

- Sealed app errors: unauthenticated, forbidden/not-found, validation, conflict, timeout, network,
  unavailable, unexpected.
- La UI no depende del texto inglés backend.
- Zod 400 genérico se mapea a error seguro; reglas locales mejoran feedback sin sustituir backend.
- Ningún log incluye token, credential, invite token, amount, description, notes, import content o
  payload push provider.
- Debug HTTP puede registrar method, route template, duration/status y correlation local; nunca
  query sensible/body/header auth.
- Household ID enviado por cliente nunca se considera autorización.
- Invite token en path se redacta en observabilidad y analytics.

## Performance

Primero se preserva comportamiento. Controles desde foundation:

- `const` widgets;
- `select`/providers estrechos;
- lists lazy;
- cancelación de requests obsoletas;
- no volver a cargar catálogos completos por cada panel cuando puedan compartirse dentro de la
  misma feature;
- medir antes de añadir cache;
- documentar la ausencia de paginación y no esconderla con UI.

## Testing

### Unit

- Money/FX parse, format, half-up, overflow y agregados;
- LocalDate/YearMonth/timezone/rangos/recurrence;
- validaciones y normalización de inputs;
- repositories y error mapping;
- AsyncNotifiers/controllers;
- queue/idempotencia/migraciones de store.

### Widget

- amount input y paste/locale;
- formularios de movimiento, recurrente y budget;
- loading/error/empty/stale/queued;
- responsive shell/navigation;
- transaction/category/payment-source widgets;
- confirmaciones destructivas.

### Integration

- login Google con entorno controlado y una verificación manual real separada;
- crear/editar/eliminar movimiento;
- dashboard y cambio de mes;
- búsqueda/filtros;
- offline create → reconnect → single server record;
- invitation/onboarding;
- recurring settle;
- deep link y refresh Web.

Cada vertical slice ejecuta `flutter analyze` y `flutter test`. Una feature pasa a `VERIFIED` solo
tras comparación Android/PWA y plataformas aplicables, no por compilar.

## Secuencia de entrega

1. M0 Audit: auditoría, baseline, bugs, riesgos y tracking.
2. M1 Foundation: coexistencia, toolchain, theme, responsive, routing, money/date/contracts/API.
3. M2 Identity & household: auth, onboarding, invitations y hogar.
4. M3 Core financial flows: catálogos y transaction CRUD/forms.
5. M4 Offline & dashboard: offline queue limpia y dashboard.
6. M5 Planning & recurring: fijos, ingresos esperados, budget e informes.
7. M6 Cross-platform: Android/Web parity, iOS greenfield y decisión push.
8. M7 Retirement readiness: validación total, caches/queues y cleanup plan.
9. M8 Release: corte, observabilidad y rollback.

Fechas no se inventan durante M0. Dependencias reales y estados se mantienen en Notion y
`docs/flutter-feature-parity.md`.
