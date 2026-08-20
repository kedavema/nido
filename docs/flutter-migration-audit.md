# Auditoría para la migración a Flutter

Estado: auditoría inicial completada  
Baseline inspeccionado: `main` en `3c61b48` (2026-08-20)  
Alcance: comportamiento implementado en el repositorio; el diseño visual no se tomó como prueba de funcionalidad.

## Resumen ejecutivo

Nido no tiene dos frontends funcionales independientes. `apps/mobile` es una sola aplicación Expo
Router/React Native exportada para Android y React Native Web/PWA. Pantallas y lógica son
compartidas; las diferencias se encapsulan en adaptadores de autenticación, URL de API,
almacenamiento, cache y densidad visual.

La migración sustituirá un runtime universal Expo por un runtime universal Flutter. Los riesgos
principales son:

- preservar dinero, redondeo e idempotencia exactamente;
- iniciar stores locales limpias en Flutter (datos actuales de prueba y descartables, sin bridge/drain legacy);
- construir una línea base de UI porque el frontend actual no tiene tests de componentes ni E2E;
- separar lógica, fetching y presentación hoy concentrados en pantallas grandes y dos Contexts;
- tratar iOS como plataforma nueva: el proyecto actual declara solo Android y Web;
- decidir la transición del service worker y de push, cuya infraestructura existe pero cuya
  experiencia de cliente no está terminada;
- corregir la divergencia entre la documentación M1 y una implementación varios milestones más
  avanzada.

No existe todavía proyecto Flutter (`pubspec.yaml`, Dart o configuración de análisis). Esta fase no
añade código Flutter ni elimina código legacy.

## Método y jerarquía de evidencia

La auditoría leyó rutas y pantallas, providers, cliente API, contratos Zod, servicios NestJS,
repositorios Prisma, migraciones SQL, service worker, build/deploy y tests. Cuando las fuentes
discrepan se usa esta prioridad:

1. migraciones y restricciones PostgreSQL;
2. código ejecutable de API y cliente;
3. contratos y tests;
4. ADRs y `docs/system-design.md`;
5. README, comentarios y referencias visuales.

`README.md` y las instrucciones de alcance todavía presentan M1 sin CRUD financiero, mientras
`apps/api/src/app.module.ts`, Prisma y el cliente implementan categorías, medios de pago,
movimientos, recurrencia, presupuestos, informes y una base de notificaciones. Una auditoría basada
solo en documentación habría producido una matriz incorrecta.

## Arquitectura actual

### Repositorio

```text
apps/
  api/                NestJS + Prisma + PostgreSQL + Firebase Admin
  mobile/             Expo Router para Android y React Native Web/PWA
packages/
  contracts/          schemas Zod y DTOs de frontera compartidos
  domain-types/       enums y primitivas TypeScript sin framework
  config/             ESLint, Prettier y TypeScript compartidos
docs/
  adr/                decisiones de arquitectura
  runbooks/           verificación y operación
design/nido-v0.3/      referencia visual; no runtime ni evidencia funcional
```

El workspace usa pnpm y Turbo. Node 24.16 y pnpm 11.13 están fijados. La CI levanta PostgreSQL,
aplica migraciones y ejecuta formato, lint, typecheck, tests unitarios, integración y build web.

### React Native y PWA

`apps/mobile/app.json` declara `android` y `web`; iOS no está configurado. Expo Router resuelve una
sola jerarquía bajo `apps/mobile/src/app`: sesión, onboarding/invitación, cinco tabs (Inicio,
Movimientos, Presupuesto, Fijos y Más) y rutas de detalle/alta/edición/catálogos/informes.

No hay pantallas web duplicadas. Los adaptadores reales son:

| Capacidad             | Android/Native                  | Web/PWA                                     |
| --------------------- | ------------------------------- | ------------------------------------------- |
| Google auth           | Google One Tap Nitro + Firebase | Firebase popup                              |
| Persistencia Firebase | SecureStore, device-only        | browser local; fallback memoria             |
| URL API               | URL absoluta pública validada   | mismo origen `/api` + proxy Cloudflare      |
| Cola offline          | SQLite                          | IndexedDB                                   |
| Cache resumen         | memoria                         | `localStorage`                              |
| Densidad              | touch 48 y tipografía native    | touch 44 y tipografía web                   |
| Rutas secundarias     | modal slide-up                  | página URL ordinaria                        |
| Capacidades           | haptics/teclado native          | manifest, service worker y Web Push helpers |

La PWA usa manifest y service worker: navigation network-first, assets versionados cache-first y
API nunca cacheada. También contiene handlers Web Push. La Function `functions/api/[[path]].ts`
proxifica el backend y sanea el IP reenviado.

No existe diseño responsive desktop real: no se encontraron breakpoints, rail/sidebar,
composiciones alternativas ni límites de ancho. Web conserva bottom tabs, una columna y sheets de
ancho completo. La UI responsive será una mejora deliberada, no paridad visual literal.

### Backend

`apps/api` es NestJS modular con Firebase Admin, Prisma/PostgreSQL, validación Zod, aislamiento por
`household_id`, transacciones DB, throttle global, health y un job HTTP interno autenticado HMAC.
Módulos activos:

- auth/users;
- households, memberships e invitations;
- categories;
- payment sources;
- transactions y reports;
- recurring items y occurrences;
- budgets;
- devices y notifications.

El backend debe conservarse como contrato inicial. Sus bugs/límites se tratarán como trabajo
separado, no como cambios silenciosos dentro del frontend Flutter.

### Autenticación y autorización

- Login de producto: Google mediante Firebase.
- Native usa `react-native-nitro-google-signin` y SecureStore.
- Web usa popup y persistencia local Firebase.
- No existe endpoint refresh; el SDK renueva el ID Token.
- Backend ejecuta `verifyIdToken(token, true)`, deadline 5 s y máximo 16 verificaciones pendientes.
- Solo acepta email verificado y provider `google.com`.
- El usuario se resuelve desde claims; nunca desde body.
- Recursos financieros requieren membresía `ACTIVE`; acceso inválido/cross-household devuelve 404.

El flujo de invitaciones también forma parte del contrato de seguridad: normaliza el email, limita
el hogar a dos miembros `ACTIVE`, vence a las 72 horas y permite un único uso por el Google email
indicado. Solo se persiste el hash del token; el plaintext se devuelve una vez para entrega manual.
La aceptación reclama la invitación y crea la membresía dentro de una transacción serializable, por
lo que concurrencia, expiración, reuso y límite de miembros son invariantes de paridad.

La UI recibe varios hogares pero usa siempre `profile.households[0]`; no ofrece selector. Flutter
debe preservar el comportamiento hasta decisión de producto, sin propagar el supuesto por toda la
arquitectura.

### Estado global

No hay Redux/Zustand. Existen:

- `SessionProvider`: sesión, perfil, hogar, invitaciones y un catálogo con casi toda la API;
- `SyncQueueProvider`: conectividad, mutaciones, alta direct-first, retry y descarte;
- estado local por pantalla para loading/error/ready, requests y formularios.

Los estados async son explícitos, pero fetching, reglas y UI viven juntos. `nuevo-gasto.tsx`, el
dashboard y `m1-ui.tsx` superan aproximadamente mil líneas. Flutter debe conservar estados
explícitos y repartir dependencias por feature, no recrear un provider global gigante.

La duplicación principal no está entre Android y PWA, sino dentro del frontend compartido:

- `nuevo-fijo.tsx` y `nuevo-ingreso.tsx` repiten draft, carga, frecuencia, cálculo de fecha,
  responsable y persistencia;
- cada pantalla repite combinaciones de loading/error/ready, fetch-on-focus y stale-response guards;
- parsing/formato de fecha, mes y dinero aparece en varios formularios y utilitarios;
- shells y componentes visuales sí se comparten, pero `m1-ui.tsx` concentra demasiadas piezas no
  relacionadas.

La migración debe extraer reglas compartidas de recurrencia/formato sin fusionar flujos que tengan
defaults o campos de producto distintos.

### Navegación

Expo Router protege rutas desde el root layout. La navegación principal es idéntica en Android y
Web. Hay deep links hacia movimientos/occurrences; el service worker abre una occurrence al tocar
una notificación.

Los paths públicos actuales incluyen `/movimientos`, `/movimiento/:id`, `/presupuesto`, `/fijos` y
`/pagar-fijo/:id`; este último está hardcodeado en `public/sw.js`. Traducir los slugs a inglés sin
aliases rompería bookmarks, refresh directo y clicks de notificaciones. Los paths Flutter deben
preservarlos o redirigirlos conservando id y query string, con tests de compatibilidad.

Antes del corte Web se debe validar refresh directo de rutas dinámicas, transición de `/sw.js`,
invalidación de caches y diferencias actuales entre back/modal native y web.

### API layer

`apps/mobile/src/api/client.ts` es un cliente `fetch` tipado:

- Bearer Firebase;
- timeout de 15 s;
- un retry de hasta 65 s solo para GET/cold start;
- ningún retry automático de mutaciones;
- validación Zod de request/response;
- errores de red/timeout/auth/validación/HTTP;
- cancelación con `AbortController`;
- `Idempotency-Key` para alta de movimiento;
- sin logging de tokens ni payloads financieros.

No hay OpenAPI. Dart no puede importar Zod; los contratos se portarán a modelos/validadores tipados
y se comprobarán con fixtures contractuales contra TypeScript.

### Persistencia, cache y sincronización

PostgreSQL es source of truth. No existe sync bidireccional general, change feed, revisionado,
merge ni resolución de conflictos.

El offline se limita a crear un movimiento:

1. se intenta el POST directo;
2. solo un error de red encola una request con UUID;
3. Android guarda SQLite y Web IndexedDB;
4. mount o reconexión drenan secuencialmente;
5. backend deduplica por actor, hogar y `clientMutationId`;
6. mismo key/payload devuelve el registro; payload distinto da conflicto;
7. éxito elimina fila; error la conserva para retry.

Editar/eliminar, catálogos, budgets, recurrencia y settlement requieren red. El resumen mensual
tiene cache stale-while-error: Web persiste en `localStorage`; Android solo memoria. Otras listas no
tienen cache persistente de lectura.

Riesgos:

- Flutter iniciará stores locales limpias sin requerir migración de colas legacy al ser datos descartables.
- La cola no está particionada por identidad y su guard de payload es débil.
- Logout voluntario advierte/descarta, pero revocación o cambio externo puede dejar trabajo viejo.
- Pendientes se muestran sin respetar totalmente hogar, mes y filtros.
- No se debe ampliar offline sin diseñar idempotencia/conflictos backend.

### Modelos, validación y formularios

Los contratos strict definen PYG/USD, EXPENSE/INCOME, roles/membresía, payment-source types,
MANUAL/IMPORT/RECURRING, frecuencias y estados de occurrence.

Los formularios usan hooks y sanitizers propios. Movimiento maneja tipo, monto, categoría,
subcategoría, medio, fecha, descripción, nota y, para USD heredado, FX. Recurrentes agregan
frecuencia, responsable, fechas y offsets.

Baseline transversal confirmado:

| Flujo                      | Defaults/carga                                                                                                                               | Validación y efectos                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crear movimiento           | Tipo derivado de la ruta, gasto por defecto; PYG, monto vacío, fecha local de hoy, sin categoría/medio/texto; permite alternar gasto/ingreso | Categoría y monto no vacío; gasto requiere descripción; USD requiere FX; ingreso oculta comercio/medio y deriva descripción. Solo create puede encolarse por error de red. Confirma resultado online/offline y confirma descarte si hay cambios |
| Editar/eliminar movimiento | Carga tipo, moneda y FX originales                                                                                                           | Edit/delete requieren red; delete pide confirmación; edit vuelve atrás al guardar                                                                                                                                                               |
| Gasto fijo                 | Nuevo: `MONTHLY`, intervalo 2, día/fecha de hoy, PYG, offsets `[0,1]`; tras cargar miembros usa al usuario actual como responsable inicial   | Nombre, monto distinto de vacío/`0`, categoría y fecha válida; responsable opcional. Si el día mensual elegido ya pasó, el próximo vencimiento rueda al mes siguiente. Edit permite archivar inmediatamente, sin confirmación                   |
| Ingreso esperado           | Nuevo: `ONE_TIME`, intervalo 2, fecha de hoy, PYG y usuario actual como responsable                                                          | Nombre, monto distinto de vacío/`0` y fecha válida. No muestra categoría: al crear autoasigna la primera raíz `INCOME` activa. No permite desactivar desde UI                                                                                   |
| Pagar fijo                 | Precarga monto/moneda de occurrence, fecha de hoy y medio del recurring item                                                                 | Monto distinto de vacío/`0`; medio opcional. Envía monto, moneda, medio y fecha sin confirmación adicional                                                                                                                                      |
| Recibir ingreso            | Precarga monto/moneda y fecha de hoy                                                                                                         | Solo permite monto y fecha; no permite recategorizar ni elegir medio. Envía monto, moneda y fecha sin confirmación adicional                                                                                                                    |
| Categoría                  | Raíz nueva usa icono/color por defecto; subcategoría solo nombre y hereda apariencia                                                         | Nombre trim no vacío, máximo 100. Edit permite reubicar dentro del mismo kind y cambiar estado; archivar es inmediato                                                                                                                           |
| Medio de pago              | `CASH`, sin titular, activo                                                                                                                  | Nombre trim no vacío, máximo 100; titular activo opcional. Edit permite archivar/reactivar inmediatamente                                                                                                                                       |
| Presupuesto                | Mes inválido cae al actual; total PYG y asignaciones por raíz                                                                                | Total obligatorio, máximo 18 dígitos; asignaciones vacías/cero se omiten y su suma no supera el total. Copiar uno de los seis meses anteriores solo aparece si el mes no tiene presupuesto y persiste inmediatamente                            |

La auditoría confirmó además cuatro fallos de formulario que necesitan decisión explícita: edición
USD de fijos/ingresos fuerza PYG y falla; editar recurrencia recalcula el ancla temporal desde hoy;
settlement USD omite FX y no supera validación cliente; un ID de edición recurrente inexistente cae
en semántica de alta. La validación de cero también diverge entre movimientos, settlements y
contratos.

El input actual es `es-PY`: PYG solo dígitos; USD/FX una coma y 2/4 fracciones. Pegar `45.90` puede
convertirse en `4590`. Es comportamiento/riesgo real y no debe cambiar silenciosamente.

### Dinero

- JSON usa strings decimales, nunca numbers.
- PYG escala 0; USD hasta 2; FX se persiste `decimal(18,4)`.
- `baseAmountPyg` se calcula en servidor una vez con precisión 50 y `ROUND_HALF_UP`.
- El valor base histórico se persiste.
- El cliente usa `BigInt` para sumas, budget y preview USD→PYG.
- Porcentajes usan `number` porque no son dinero.

Riesgos a ticketear: schema FX no limita escala 4 aunque DB sí; cero amount/FX aceptados; el hash
idempotente distingue `1`, `1.0`, `1.00`; agregados pueden superar rango de fila; un porcentaje de
ingresos convierte totales grandes a `Number`.

Flutter nunca representará dinero con `double`.

### Fechas

Timezone: `America/Asuncion`. API distingue timestamp ISO, fecha `yyyy-MM-dd` y mes `yyyy-MM`.
Fechas financieras pasadas se fijan a 15:00 UTC; “hoy” usa instante real. Recurrencias ajustan días
29–31 al último día válido.

La lógica está repartida entre dominio, formateadores, picker y pantallas. Dos riesgos backend:

- marker diario de sweep usa día UTC, aunque el hogar tiene timezone local;
- recurrencias siempre generan el mismo horizonte de 12 meses desde `firstDueDate` y no se
  extienden después.

### Design system y gráficos

Tokens reales en `apps/mobile/src/theme/tokens.ts`:

- primary `#1C4F47`, tint `#E3EEE9`, accent `#B4632F`, background `#F6F4EF`;
- danger/warning/success;
- Bricolage Grotesque + IBM Plex Sans;
- spacing, radii, shadows, touch targets y swatches;
- shells, Card, ActionButton, notices, loading/skeleton/empty/error, AmountField, pickers, month
  stepper, budget/report cards y bottom sheet.

Los informes dibujan barras con `View`; no usan charts package. `design/nido-v0.3` es referencia,
no runtime. La fuente editable mencionada en su README no está en el árbol.

## Matriz de features

“React Native” significa Android actual. “PWA” es Web del mismo código. Offline se marca solo
cuando la operación funciona sin red.

| Feature                                   | React Native | PWA       | Backend dependency                         | Offline                     | Complejidad |
| ----------------------------------------- | ------------ | --------- | ------------------------------------------ | --------------------------- | ----------- |
| Google/Firebase auth, sesión y logout     | Sí           | Sí        | Firebase + `/v1/me`                        | No                          | Alta        |
| Crear hogar/onboarding                    | Sí           | Sí        | Households                                 | No                          | Media       |
| Miembros e invitación one-use manual      | Sí           | Sí        | Members/invites                            | No                          | Alta        |
| Dashboard y navegación mensual            | Sí           | Sí        | Summary, catálogos, recurring, occurrences | Cache; persistente solo Web | Alta        |
| Lista de movimientos                      | Sí           | Sí        | Transactions/categories/sources            | Lectura no; muestra cola    | Alta        |
| Búsqueda y filtros                        | Sí           | Sí        | Search/type server; otros cliente          | No                          | Media       |
| Crear gasto o ingreso recibido            | Sí           | Sí        | Transactions + idempotencia                | Sí                          | Crítica     |
| Detalle/editar/eliminar movimiento        | Sí           | Sí        | Transactions                               | No                          | Alta        |
| Categorías/subcategorías y archivado      | Sí           | Sí        | Categories                                 | No                          | Media       |
| Medios de pago y owner informativo        | Sí           | Sí        | Payment sources/members                    | No                          | Media       |
| Presupuesto mensual, asignaciones y copia | Sí           | Sí        | Budgets + summary                          | No                          | Alta        |
| Gastos fijos recurrentes                  | Sí           | Sí        | Recurring items/occurrences                | No                          | Alta        |
| Pagar ocurrencia fija                     | Sí           | Sí        | Settle occurrence                          | No                          | Alta        |
| Ingresos esperados recurrentes            | Sí           | Sí        | Recurring items/occurrences                | No                          | Alta        |
| Marcar ingreso esperado recibido          | Sí           | Sí        | Settle occurrence                          | No                          | Alta        |
| Informes                                  | Sí           | Sí        | Breakdown/trends/budget/summary            | No                          | Alta        |
| PWA instalable/offline shell              | N/A          | Sí        | Ninguna para shell                         | Shell/assets                | Media       |
| Notificaciones push                       | No usable    | No usable | Devices/deliveries/dispatch                | N/A                         | Alta        |

Informes existentes: budget vs. real, categoría/subcategoría, ingresos vs. gastos de tres meses y
gasto por medio/propietario.

No existen para paridad: cuentas/balances, transferencias, import CSV/XLSX, sync bancaria, offline
general, preferencias/historial UI de notificaciones, iOS native, selector multi-household ni email
de invitación.

## Gaps cliente/backend

- Backend expone `skip occurrence`; cliente no.
- Backend devuelve varios hogares; cliente usa el primero.
- Backend soporta USD y edición USD, pero alta fija PYG sin selector.
- Los editores de recurrencias cargan USD heredado pero fuerzan PYG al guardar y la API rechaza la
  combinación con el FX persistido.
- Backend contiene push; helpers Web no están conectados y falta `expo-notifications`.
- Prisma modela `IMPORT`; no hay importador/endpoints.
- Payment source es metadato, no cuenta: no tiene saldo, moneda ni ledger.
- Pull-to-refresh Web es inerte.
- Ingreso esperado no ofrece la misma deactivación UI que fijo.

## Comportamientos sospechosos, no corregidos

1. Alta USD inaccesible.
2. Ingreso offline mostrado con signo de gasto.
3. Pendientes visibles fuera del mes/filtros/hogar correspondientes.
4. Payload offline replay validado solo por forma mínima.
5. Detalle de ingreso rotulado “Detalle del gasto” y “Pagado con”.
6. Series recurrentes agotadas tras 12 meses.
7. Sweep diario marcado por UTC, no día del hogar.
8. Cron despacha deliveries pero no ejecuta el sweep que las crea.
9. Readiness DB comprueba solo una base temprana de tablas.
10. FX puede calcular base con más precisión que la tasa persistida.
11. Editar un gasto fijo o ingreso esperado USD fuerza PYG y falla contra la validación backend.
12. Guardar una recurrencia mensual/cada-N recalcula `firstDueDate` desde hoy y puede reprogramar la
    fase aun sin intención.
13. Settlement/receipt USD omiten FX y fallan en el parser cliente.
14. Un ID de recurrencia inexistente se convierte en draft nuevo y puede crear una regla duplicada.
15. Movimiento acepta cero; settlements solo rechazan la cadena `0`, pero aceptan `0,00`; contratos
    también permiten cero.

Ninguno fue modificado en la auditoría.

## Riesgos de migración

| Riesgo                                           | Nivel             | Mitigación requerida                                               |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------------ |
| Perder/repetir altas offline al sustituir stores | Low (descartable) | stores limpios en Flutter, fixtures idempotentes y gate de rollout |
| Cambiar escalas/redondeo/overflow                | Critical          | value types exactos y vectores TS/Dart                             |
| Reprogramar recurrencias al editar               | Critical          | decisión explícita y characterization/backend tests                |
| Crear regla desde un ID de edición inexistente   | Critical          | estado not-found y test que prohíba create                         |
| Portar o corregir bugs silenciosamente           | High              | tickets + expected behavior explícito                              |
| Sin widget/E2E baseline                          | High              | characterization tests por vertical slice                          |
| iOS greenfield                                   | High              | track/gates separados de paridad Android/Web                       |
| Expo/Web Push no traduce 1:1                     | High              | spike FCM/APNs/Web Push y contrato explícito                       |
| Conflicto de service workers                     | High              | ownership, upgrade y cache invalidation                            |
| Romper URLs/deep links legacy                    | High              | aliases/redirects y contract tests de paths                        |
| Documentación M1 contradice runtime              | High              | reconciliar docs antes de foundation                               |
| Context/client/pantallas monolíticos             | Medium/High       | feature-first y providers acotados                                 |
| Queue no scoped por identidad                    | Medium/High       | scope y política upgrade/logout                                    |
| Cache native vs Web divergente                   | Medium            | decisión de paridad de cache                                       |
| Lists sin paginación                             | Medium            | medir y abrir trabajo backend separado                             |
| Last-write-wins multiusuario                     | Medium            | preservar/documentar; no inventar merge                            |
| Fuente editable de diseño ausente                | Medium            | validar con tokens/runtime/PNG y revisión humana                   |
| Refresh directo web no probado                   | Medium            | test real de hosting antes de corte                                |

### Dependencias

A reemplazar: Expo Router/SecureStore/SQLite/Haptics/Crypto, RN Web/NetInfo, Reanimated,
gesture-handler, screens, safe-area, keyboard-controller/worklets y Nitro Google Sign-In.

No se confirmó runtime dependency abandonada. Expo 57/RN 0.86, NetInfo 12 y Nitro Google Sign-In
tienen actividad reciente. Nitro está excluido del chequeo RN Directory de Expo Doctor: es riesgo
native, no abandono confirmado.

El lockfile advierte dependencias transitivas `@xmldom/xmldom`, `glob@10.5.0` y
`node-domexception`. Son deuda legacy, no dependencias a copiar. Prisma/adapter-pg 7.8 requiere una
verificación separada por un issue oficial relacionado con interactive transactions.

## Código reutilizable conceptualmente

- rutas, verbs, headers, timeouts y retries;
- DTOs/enums/validaciones de `packages/contracts`;
- restricciones DB y primitivas de `packages/domain-types`;
- strings decimales, PYG/USD/FX, half-up y fixtures;
- idempotencia de alta offline;
- fechas locales, meses y recurrencia calendar-clamped;
- roles, membresía y 404 cross-household;
- archive-vs-delete;
- defaults/validaciones de formularios;
- tests dominio/API como contract fixtures;
- tokens y componentes visuales realmente usados;
- deep links de push sin datos financieros.

No reutilizar literalmente: Prisma entities, mapas no tipados, patrones Nest, Expo tokens para
Flutter/iOS, screenshots como prueba ni enums `IMPORT`/`REMOVED` como features.

## Tests existentes

- Mobile: 29 Vitest files y ~300 casos; solo `.test.ts` Node.
- API: 49 unit/integration specs.
- Contracts: 10 specs.
- Domain types: 1 spec.
- API/contracts/domain contienen más de 500 bloques `it/test`.

Hay buena cobertura de auth, tenancy/invites, catálogos, money/idempotencia, fechas/reportes,
recurrencia/settlement, budgets, cifrado/devices/dispatch, sanitizers y stores/queue.

Faltan tests React `.tsx`, components/screens, E2E esenciales, browser/PWA/service worker/deep
links, responsive/visual, iOS y push/Firebase real. CI tampoco ejecuta build Android, Expo
doctor/config ni E2E frontend. Integración PostgreSQL se salta sin `TEST_DATABASE_URL`.

El baseline local no produjo resultado: el host expone Node 22 pero el repo exige Node 24, y el
runner bloqueó spawn de pnpm/Turbo con `EPERM` incluso tras escalación. Debe repetirse con el
toolchain oficial; no se reporta “tests passing”. `flutter analyze/test` no aplican todavía porque
Flutter no existe ni está disponible en el host.

## Orden de migración derivado

1. baseline/characterization, toolchain y coexistencia;
2. shell Flutter, theme, responsive y routing;
3. money/date, contratos y API;
4. auth, onboarding, hogar e invitaciones;
5. categorías y medios de pago;
6. movimientos CRUD y formularios;
7. cola offline limpia en Flutter;
8. dashboard;
9. fijos, ingresos esperados y settlement;
10. budgets e informes;
11. decisión/implementación push;
12. validación Android/Web e iOS greenfield;
13. retiro legacy tras paridad verificada y cutover de frontend.

Documentos relacionados:

- `docs/flutter-architecture.md`;
- `docs/flutter-feature-parity.md`;
- `docs/flutter-migration-decisions.md`.
