# Matriz de paridad Flutter

Última actualización: 2026-08-20  
Baseline legacy: `3c61b48`  
Progreso de producto: **0 / 12 features VERIFIED (0%)**

Esta matriz y la database **Flutter Features** de Notion representan el mismo estado conceptual.
La foundation Flutter existe en `apps/flutter` con scaffolds nativos completos (Android, iOS, Web),
value types exactos de money/date (FLT-006/FLT-007), contratos Dart contrastados con fixtures Zod
compartidos (`packages/contracts/fixtures/`) y el API client foundation (FLT-008). Los tres builds
(Web, APK debug, iOS simulator sin firma) compilan desde el árbol actual y el startup test de
integración corre headless vía chromedriver. Ninguna feature de producto migró todavía: las
capacidades de plataforma siguen `IN_PROGRESS` hasta validación con features reales.

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

| Feature                         | RN          | PWA         | Flutter | Tests                                              | Estado      |
| ------------------------------- | ----------- | ----------- | ------- | -------------------------------------------------- | ----------- |
| Authentication & session        | IMPLEMENTED | IMPLEMENTED | —       | Legacy unit + backend; Firebase real manual        | NOT_STARTED |
| Household onboarding            | IMPLEMENTED | IMPLEMENTED | —       | Backend integration; sin E2E cliente               | NOT_STARTED |
| Members & invitations           | IMPLEMENTED | IMPLEMENTED | —       | Backend integration/concurrency; sin E2E cliente   | NOT_STARTED |
| Dashboard                       | IMPLEMENTED | IMPLEMENTED | —       | Legacy utility/API tests; sin widget/E2E           | NOT_STARTED |
| Transactions CRUD & filters     | IMPLEMENTED | IMPLEMENTED | —       | Money/API/utility tests; sin widget/E2E            | NOT_STARTED |
| Offline transaction creation    | IMPLEMENTED | IMPLEMENTED | —       | Queue/store/idempotency tests; sin E2E reconnect   | NOT_STARTED |
| Categories & subcategories      | IMPLEMENTED | IMPLEMENTED | —       | Backend contract/integration; sin widget/E2E       | NOT_STARTED |
| Payment sources                 | IMPLEMENTED | IMPLEMENTED | —       | Backend contract/integration; sin widget/E2E       | NOT_STARTED |
| Monthly budgets                 | IMPLEMENTED | IMPLEMENTED | —       | Backend + legacy calculation tests; sin widget/E2E | NOT_STARTED |
| Recurring expenses & settlement | IMPLEMENTED | IMPLEMENTED | —       | Backend/date tests; sin widget/E2E                 | NOT_STARTED |
| Expected income & receipt       | IMPLEMENTED | IMPLEMENTED | —       | Backend/date tests; sin widget/E2E                 | NOT_STARTED |
| Reports                         | IMPLEMENTED | IMPLEMENTED | —       | Backend/legacy formatter tests; sin visual/E2E     | NOT_STARTED |

## Capacidades de plataforma

Estas filas no cuentan como features de producto para el porcentaje, pero bloquean milestones.

| Capability                       | RN            | PWA           | Flutter | Tests                                        | Estado      |
| -------------------------------- | ------------- | ------------- | ------- | -------------------------------------------- | ----------- |
| Android runtime                  | IMPLEMENTED   | N/A           | PARTIAL | Unit/widget; `flutter build apk --debug` OK  | IN_PROGRESS |
| Web/PWA install & offline shell  | N/A           | IMPLEMENTED   | PARTIAL | Build Web + startup E2E; offline sin validar | IN_PROGRESS |
| Responsive desktop composition   | NOT_AVAILABLE | NOT_AVAILABLE | PARTIAL | Breakpoint/widget tests de foundation        | IN_PROGRESS |
| iOS runtime                      | NOT_AVAILABLE | N/A           | PARTIAL | Unit/widget; build simulator sin firma OK    | IN_PROGRESS |
| Deep links/direct Web refresh    | PARTIAL       | PARTIAL       | PARTIAL | Root/404; rutas legacy y hosting pendientes  | IN_PROGRESS |
| Clean local store init (FLT-015) | N/A           | N/A           | —       | Unit/store initialization tests              | NOT_STARTED |
| Push registration & delivery     | PARTIAL       | PARTIAL       | —       | Backend/helpers; sin flujo E2E               | NOT_STARTED |

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
accidente:

- alta USD sin selector;
- ingreso offline mostrado con signo negativo;
- pendientes fuera del contexto de mes/filtros/hogar;
- detalle de ingreso rotulado como gasto;
- payload offline persistido con validación mínima;
- hogar activo siempre igual al primer resultado;
- edición de fijo/ingreso esperado USD que fuerza PYG y falla;
- edición recurrente que recalcula el ancla temporal;
- settlement/receipt USD sin FX válido;
- ID recurrente inexistente que puede entrar en semántica de alta;
- validación inconsistente de monto cero;
- recurrencias que no se extienden después del horizonte de 12 meses;
- enqueue de recordatorios dependiente de abrir/listar occurrences.
