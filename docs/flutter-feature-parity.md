# Matriz de paridad Flutter

Última actualización: 2026-08-21  
Baseline legacy: `3c61b48`  
Progreso de producto: **0 / 12 features VERIFIED (0%)**

Esta matriz y la database **Flutter Features** de Notion representan el mismo estado conceptual.
La foundation Flutter existe en `apps/flutter` con scaffolds nativos completos (Android, iOS, Web),
value types exactos de money/date (FLT-006/FLT-007), contratos Dart contrastados con fixtures Zod
compartidos (`packages/contracts/fixtures/`) y el API client foundation (FLT-008). Los tres builds
(Web, APK debug, iOS simulator sin firma) compilan desde el árbol actual y el startup test de
integración corre headless vía chromedriver.

M2 (Identity & household) portó a Flutter la máquina de sesión única (`initializing /
unauthenticated / authenticated-without-household / authenticated-with-household /
recoverable-error`), Firebase Auth con Google (popup en Web, credencial nativa
Android/iOS vía `google_sign_in`), redirects puros de go_router sin requests duplicadas ni
oscilación, contratos Dart de households con cinco fixtures compartidos nuevos, y la UI mínima
del milestone (sign-in, onboarding, members, invitación one-use con token mostrado una sola vez,
aceptación). El login real de Google se verificó manualmente el 2026-08-20 contra un proyecto
Firebase de desarrollo, en Web (Chrome, `localhost:8081` + API local) y en Android (emulador
Pixel 7, API 35 con Google Play, `adb reverse`): sign-in, crear hogar, invitación one-use,
aceptación con segunda cuenta y restauración de sesión. Sigue pendiente la configuración
Firebase/Google NUEVA de iOS con su validación en dispositivo/simulador, y la comparación formal
lado a lado contra legacy: ninguna de las tres features toca `VERIFIED` sin eso.

M3 (Core financial flows) portó los catálogos y el CRUD de movimientos: contratos Dart de
categories y payment-sources con ocho fixtures compartidos nuevos, CRUD completo de categorías,
subcategorías y medios de pago con confirmación explícita antes de archivar, y el listado de
movimientos con stepper de mes, búsqueda con debounce, filtros por tipo y categoría, agrupación por
día con subtotales, detalle, alta, edición y borrado. El formulario es money-safe de punta a punta:
el borrador parcial vive en `AmountInput`/`FxRateInput` y solo se convierte en `Money`/`FxRateToPyg`
cuando parsea, PYG mantiene escala 0 y USD escala 2, USD exige tipo de cambio y el preview en
guaraníes usa el mismo half-up único del servidor (ADR 0001). El alta envía `clientMutationId` con
su `Idempotency-Key` desde ya (ADR 0003) aunque M3 sea online-only. Cambiar mes, tipo o búsqueda
cancela la request anterior con su `CancelToken`, con test que lo comprueba sobre una request
todavía en vuelo. La ausencia de paginación se dice en pantalla en lugar de disimularse.
**Falta la comparación con datos reales contra la API local y el legacy lado a lado**: las tres
features quedan en `PARITY`, no en `VERIFIED`.

Diferencias intencionales respecto del legacy en M3, decididas por FLT-014 y registradas como
decisiones propias: se agrega el selector de moneda que hacía inalcanzable el alta USD (FLT-016),
se rechaza el monto cero de forma uniforme y sobre el valor parseado (FLT-017), y el detalle rotula
el movimiento por su tipo mostrando su categoría real (FLT-018). La sección de pendientes queda
fuera de M3 por no haber cola que la alimente (FLT-019).

## Estados

- `NOT_STARTED`: no hay implementación Flutter.
- `IN_PROGRESS`: existe trabajo activo, todavía incompleto.
- `PARITY`: implementación y tests técnicos terminados; falta o está en curso comparación final.
- `VERIFIED`: tests pasan, comportamiento comparado y plataformas aplicables validadas sin bug
  bloqueante.

Para RN/PWA:

- `IMPLEMENTED`: flujo usable en el runtime actual.
- `PARTIAL`: infraestructura o parte del flujo existe, pero no una feature usable completa.
- `NOT_AVAILABLE`: no existe en esa plataforma.

## Features de producto

| Feature                         | RN          | PWA         | Flutter | Tests                                                                                                                              | Estado      |
| ------------------------------- | ----------- | ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Authentication & session        | IMPLEMENTED | IMPLEMENTED | PARTIAL | Unit+widget+E2E headless; login real verificado en Web y Android emulador (2026-08-20); iOS pendiente                              | PARITY      |
| Household onboarding            | IMPLEMENTED | IMPLEMENTED | PARTIAL | Controller (reconciliación incluida) + widget + fixtures Zod↔Dart; flujo real ejercitado; comparación legacy formal pendiente      | PARITY      |
| Members & invitations           | IMPLEMENTED | IMPLEMENTED | PARTIAL | Widget + fixtures Zod↔Dart; invitación/aceptación reales ejercitadas end-to-end; comparación legacy formal pendiente               | PARITY      |
| Dashboard                       | IMPLEMENTED | IMPLEMENTED | —       | Legacy utility/API tests; sin widget/E2E                                                                                           | NOT_STARTED |
| Transactions CRUD & filters     | IMPLEMENTED | IMPLEMENTED | PARTIAL | Contratos con fixtures Zod↔Dart, money/formulario, filtros, cancelación, widget y E2E headless; falta comparación con datos reales | PARITY      |
| Offline transaction creation    | IMPLEMENTED | IMPLEMENTED | —       | Queue/store/idempotency tests; sin E2E reconnect. M3 ya envía `clientMutationId` (ADR 0003); la cola es M4 (FLT-019)               | NOT_STARTED |
| Categories & subcategories      | IMPLEMENTED | IMPLEMENTED | PARTIAL | Contratos con fixtures Zod↔Dart, árbol/selección, widget y E2E headless; falta comparación con datos reales                        | PARITY      |
| Payment sources                 | IMPLEMENTED | IMPLEMENTED | PARTIAL | Contratos con fixtures Zod↔Dart, widget (CRUD + archivado); falta comparación con datos reales                                     | PARITY      |
| Monthly budgets                 | IMPLEMENTED | IMPLEMENTED | —       | Backend + legacy calculation tests; sin widget/E2E                                                                                 | NOT_STARTED |
| Recurring expenses & settlement | IMPLEMENTED | IMPLEMENTED | —       | Backend/date tests; sin widget/E2E                                                                                                 | NOT_STARTED |
| Expected income & receipt       | IMPLEMENTED | IMPLEMENTED | —       | Backend/date tests; sin widget/E2E                                                                                                 | NOT_STARTED |
| Reports                         | IMPLEMENTED | IMPLEMENTED | —       | Backend/legacy formatter tests; sin visual/E2E                                                                                     | NOT_STARTED |

## Capacidades de plataforma

Estas filas no cuentan como features de producto para el porcentaje, pero bloquean milestones.

| Capability                       | RN            | PWA           | Flutter | Tests                                                                                                                                                                                  | Estado      |
| -------------------------------- | ------------- | ------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Android runtime                  | IMPLEMENTED   | N/A           | PARTIAL | Unit/widget; `flutter build apk --debug` OK                                                                                                                                            | IN_PROGRESS |
| Web/PWA install & offline shell  | N/A           | IMPLEMENTED   | PARTIAL | Build Web + startup E2E; offline sin validar                                                                                                                                           | IN_PROGRESS |
| Responsive desktop composition   | NOT_AVAILABLE | NOT_AVAILABLE | PARTIAL | Breakpoint/widget tests de foundation                                                                                                                                                  | IN_PROGRESS |
| iOS runtime                      | NOT_AVAILABLE | N/A           | PARTIAL | Unit/widget; build simulator sin firma OK                                                                                                                                              | IN_PROGRESS |
| Deep links/direct Web refresh    | PARTIAL       | PARTIAL       | PARTIAL | Root/404 + redirect de `/movimientos`, `/nuevo-gasto` y `/movimiento/:id` con query e `id` preservados (FLT-020), testeado en widget y E2E; resto de rutas legacy y hosting pendientes | IN_PROGRESS |
| Clean local store init (FLT-015) | N/A           | N/A           | —       | Unit/store initialization tests                                                                                                                                                        | NOT_STARTED |
| Push registration & delivery     | PARTIAL       | PARTIAL       | —       | Backend/helpers; sin flujo E2E                                                                                                                                                         | NOT_STARTED |

Push se registra como capacidad parcial/net-new y se excluye del denominador: existen backend y
helpers Web, pero no una experiencia cliente usable que pueda considerarse feature legacy. Solo
entrará al alcance de producto después de la decisión FLT-013. En Notion tiene
`Parity Scope = Capability / net-new`; las otras 12 filas tienen `Product parity`.

## Fronteras de paridad

No se agregarán como features existentes:

- accounts/balances;
- transfers;
- CSV/XLSX import;
- bank sync;
- general offline editing/sync;
- notification preferences/history;
- multi-household selector;
- email invitation delivery.

El enum `IMPORT`, endpoints devices o screenshots futuros no prueban que esas experiencias existan.

## Criterio de `VERIFIED`

Una feature necesita:

1. implementación vertical completa (model/API-state/UI/error/responsive);
2. `flutter analyze` sin warnings importantes;
3. unit/widget/integration tests de riesgo aplicable;
4. comparación contra Android legacy;
5. comparación contra PWA cuando aplique;
6. validación iOS cuando sea una capacidad común del producto nuevo;
7. documentación y Notion actualizados;
8. cero bugs bloqueantes conocidos.

Compilar o completar una pantalla no basta.

## Bugs legacy que condicionan la comparación

La validación debe usar decisiones explícitas para estos casos; no copiarlos ni corregirlos por
accidente. Los que ya tienen decisión llevan su número:

- alta USD sin selector — **decidido, corregido en M3 (FLT-016)**;
- validación inconsistente de monto cero — **decidido, corregido en M3 (FLT-017)**;
- detalle de ingreso rotulado como gasto — **decidido, corregido en M3 (FLT-018)**;
- pendientes fuera del contexto de mes/filtros/hogar — **decidido, diferido a M4 (FLT-019)**;
- hogar activo siempre igual al primer resultado — preservado a propósito hasta que FLT-014 lo
  resuelva; el producto tiene un solo hogar;
- ingreso offline mostrado con signo negativo (M4);
- payload offline persistido con validación mínima (M4);
- edición de fijo/ingreso esperado USD que fuerza PYG y falla (M5);
- edición recurrente que recalcula el ancla temporal (M5);
- settlement/receipt USD sin FX válido (M5);
- ID recurrente inexistente que puede entrar en semántica de alta (M5);
- recurrencias que no se extienden después del horizonte de 12 meses (M5);
- enqueue de recordatorios dependiente de abrir/listar occurrences (M5/FLT-013).
