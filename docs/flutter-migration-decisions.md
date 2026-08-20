# Decisiones de la migración Flutter

Última actualización: 2026-08-20

Estados: `Proposed`, `Accepted`, `Superseded`, `Rejected`.

## FLT-001 — Mantener el backend existente como contrato inicial

**Status:** Accepted

**Decision**  
La primera migración Flutter reutiliza NestJS/PostgreSQL/Firebase sin reescritura general.

**Context**  
El backend implementa auth, tenancy, contratos, transacciones atómicas, idempotencia, money,
recurrencia, budgets y reports con cobertura significativa. El objetivo es migrar frontend.

**Options considered**

1. Reescribir backend junto con Flutter.
2. Crear un BFF Flutter-specific.
3. Mantener la API y cambiarla solo por bugs/bloqueos explícitos.

**Selected approach**  
Opción 3.

**Reason**  
Reduce variables, conserva semántica financiera y permite comparación cliente a cliente.

**Trade-offs**  
Dart necesita DTOs propios porque no puede importar Zod. Límites backend actuales —errores
genéricos, falta de paginación y bugs de recurrencia/push— permanecen visibles y se corrigen en
tickets separados.

## FLT-002 — Migración side-by-side en `apps/flutter`

**Status:** Accepted

**Decision**  
Flutter convivirá con `apps/mobile` hasta paridad verificada.

**Context**  
No hay tests E2E frontend suficientes para un big-bang y existen colas locales que pueden contener
movimientos no enviados.

**Options considered**

1. Reemplazar `apps/mobile` desde el primer commit.
2. Traducir pantalla por pantalla dentro del mismo directorio.
3. Crear `apps/flutter` y retirar Expo al final.

**Selected approach**  
Opción 3.

**Reason**  
Permite characterization, comparación, rollout y rollback controlados.

**Trade-offs**  
Durante el rewrite existen dos toolchains y hay que evitar que ambos runtimes se publiquen sobre el
mismo service worker/origin sin una estrategia explícita.

## FLT-003 — Arquitectura feature-first sin capas rituales

**Status:** Accepted

**Decision**  
Organizar por features reales y usar `data/domain/presentation` solo donde separa responsabilidades.

**Context**  
El frontend actual concentra API, estado y UI en grandes pantallas/Contexts. Una clean architecture
completa agregaría interfaces/use cases sin necesidad en muchas operaciones CRUD.

**Options considered**

1. Capas globales por tipo técnico.
2. Clean architecture estricta para cada feature.
3. Feature-first con capas selectivas.

**Selected approach**  
Opción 3.

**Reason**  
Maximiza locality y testabilidad sin multiplicar archivos pass-through.

**Trade-offs**  
Requiere criterio consistente en review; dos features pueden no tener exactamente la misma forma.

## FLT-004 — Riverpod para estado y dependency injection

**Status:** Accepted

**Decision**  
Usar Riverpod con providers acotados, families y AsyncNotifiers por feature.

**Context**  
Hay sesión global, estado async por hogar/mes/filtro, invalidaciones tras mutación y dependencias que
deben reemplazarse en tests. El Context actual se volvió un catálogo monolítico.

**Options considered**

1. StatefulWidget/InheritedWidget manual.
2. Bloc/Cubit.
3. Riverpod.
4. Trasladar literalmente Context a providers globales.

**Selected approach**  
Opción 3; opción 4 rechazada explícitamente.

**Reason**  
Modela dependencias y async state sin `BuildContext`, con overrides de test y granularidad.

**Trade-offs**  
Añade convenciones y una dependencia. Providers demasiado amplios aún pueden recrear el problema si
review no controla el scope.

## FLT-005 — `go_router` y rutas URL-first

**Status:** Accepted

**Decision**  
Usar `go_router` para auth redirects, shells, deep links y refresh Web. Tratar cada URL legacy como
contrato: conservarla o redirigirla explícitamente antes de adoptar un slug nuevo.

**Context**  
Expo Router ofrece rutas protegidas y URLs reales. Flutter debe preservar deep links y mejorar la
composición responsive sin separar router mobile/web. `/pagar-fijo/:id` además está embebida en el
service worker actual; cambiar rutas sin transición rompería notificaciones, bookmarks y refresh.

**Options considered**

1. Navigator imperativo puro.
2. AutoRoute.
3. `go_router`.

**Selected approach**  
Opción 3.

**Reason**  
Es suficiente para el grafo actual, integra Navigator 2 y minimiza generación adicional.

**Trade-offs**  
Redirects async requieren una máquina de sesión estable para evitar loops/flicker. Modalidad visual
debe desacoplarse del path. Los aliases/redirects deben conservar ids y query strings y permanecer
hasta un cutover explícito; router y service worker se validan juntos.

## FLT-006 — Dinero exacto con `BigInt` y value types

**Status:** Accepted

**Decision**  
Representar montos como `Money(currency, minorUnits: BigInt)`, base PYG con `BigInt` y FX exacto
escalado. Mantener strings decimales en JSON. Prohibir `double` para dinero.

**Context**  
El backend usa PYG escala 0, USD escala 2, FX decimal, precisión 50 y half-up. Flutter Web también
debe evitar límites de precisión de JavaScript.

**Options considered**

1. `double`.
2. `int` sin tipo/escala.
3. package Decimal para todo.
4. value types basados en `BigInt` y aritmética escalada controlada.

**Selected approach**  
Opción 4. Un package Decimal solo se añadirá si simplifica FX sin alterar reglas.

**Reason**  
Hace escala/moneda explícitas y funciona de forma exacta en Android, iOS y Web.

**Trade-offs**  
Parsing/formatting y multiplicación half-up deben implementarse/probarse cuidadosamente. JSON no
serializa `BigInt` directamente, por lo que el adapter wire siempre convierte a string.

## FLT-007 — Tipos separados para fecha financiera e instante

**Status:** Accepted

**Decision**  
Introducir `LocalDate`, `YearMonth` e instante UTC; centralizar timezone IANA y recurrence math.

**Context**  
La API distingue fechas, meses y timestamps, pero el cliente actual reparte lógica y usa un anclaje
15:00Z para fechas pasadas.

**Options considered**

1. Usar `DateTime` para todo.
2. Mantener strings sin tipos.
3. Value objects + adapter timezone.

**Selected approach**  
Opción 3.

**Reason**  
Evita convertir una fecha financiera en instante ambiguo y centraliza reglas de Asunción.

**Trade-offs**  
Añade tipos/conversiones. La dependencia IANA (`timezone` u otra) debe validarse antes de agregarla.

## FLT-008 — Dio sin Retrofit inicialmente

**Status:** Proposed

**Decision**  
Usar Dio para auth, timeout, cancelación y error mapping; escribir endpoints tipados sin Retrofit en
foundation.

**Context**  
El cliente actual necesita políticas de retry asimétricas y cancelación, pero el número de
endpoints es manejable. Ya habrá codegen para modelos si se acepta Freezed/json_serializable.

**Options considered**

1. `http` + wrappers manuales.
2. Dio.
3. Dio + Retrofit.

**Selected approach**  
Opción 2 propuesta.

**Reason**  
Dio aporta interceptors/cancel tokens sin obligar otro generador y anotaciones.

**Trade-offs**  
Es una dependencia adicional y exige redacción estricta del logging. Foundation debe confirmar
mantenimiento, Web y Firebase interoperability antes de aceptar.

## FLT-009 — Freezed/json_serializable de manera selectiva

**Status:** Proposed

**Decision**  
Usarlos para DTOs/unions donde reduzcan código y errores; preferir Dart 3 manual para tipos simples.

**Context**  
Hay numerosos objetos strict, enums y tagged unions. El objetivo es inmutabilidad fuerte sin
convertir todo el árbol en generated code.

**Options considered**

1. Todo manual.
2. Freezed/json_serializable para todo.
3. Uso selectivo.

**Selected approach**  
Opción 3 propuesta.

**Reason**  
Equilibra copy/equality/JSON exhaustivo con pubspec/build simple.

**Trade-offs**  
Convenciones mixtas pueden confundir. El spike debe fijar criterios y medir generated surface.

## FLT-010 — Offline conserva alcance y source of truth actuales

**Status:** Accepted

**Decision**  
Mantener solo queue de alta de gasto/ingreso y summary cache; server sigue siendo autoridad.

**Context**  
Backend solo ofrece idempotencia para create transaction. No hay versiones, sync feed ni merge para
otras mutaciones.

**Options considered**

1. Expandir offline a toda feature durante rewrite.
2. No soportar offline en Flutter.
3. Preservar alcance actual y diseñar cualquier expansión por separado.

**Selected approach**  
Opción 3.

**Reason**  
Preserva funcionalidad sin inventar una plataforma de sincronización.

**Trade-offs**  
UX seguirá siendo limitada sin red. La store concreta y el bridge legacy permanecen pendientes de
spike bloqueante.

## FLT-011 — Store offline y bridge legacy se deciden antes de implementar

**Status:** Superseded (por FLT-015)

**Decision**  
Evaluar Drift/SQLite/Web y una estrategia drain/migration antes de elegir persistencia Flutter.

**Context**  
Android puede tener filas en SQLite y Web en IndexedDB. Reemplazar runtime sin leerlas podía perder
datos financieros en un escenario productivo; mantener el mismo origin podía colisionar con
schemas/caches.

**Superseded by FLT-015**  
Al confirmarse que los datos actuales son exclusivamente de prueba y descartables, no se requiere
bridge ni drain de SQLite/IndexedDB legacy. Flutter iniciará stores locales limpias cuando se
implemente el soporte offline desde cero.

**Options considered**

1. Abandonar filas legacy.
2. Forzar drain desde Expo antes de upgrade.
3. Leer/migrar stores desde Flutter.
4. Estrategia híbrida según plataforma.

**Selected approach**  
Originalmente pendiente de spike; superseded por FLT-015 al descartarse la necesidad de preservar
datos locales legacy.

**Reason**  
La simplificación del alcance elimina la necesidad de desarrollar mecanismos complejos de migración
de datos locales que no aportan valor productivo.

**Trade-offs**  
Cualquier borrador local no sincronizado en el frontend legacy se descarta en el cutover.

## FLT-012 — Responsive por constraints, no por plataforma

**Status:** Accepted

**Decision**  
Usar compact/medium/expanded derivados del espacio; reservar `kIsWeb` para capacidades Web.

**Context**  
La PWA actual es la UI mobile estirada. El objetivo nuevo exige composiciones desktop sin duplicar
features.

**Options considered**

1. UI mobile idéntica en todos los anchos.
2. Screens web separadas.
3. Widgets compartidos con composiciones por constraints.

**Selected approach**  
Opción 3.

**Reason**  
Una tablet/native amplia y un browser estrecho deben responder al espacio, no al nombre de la
plataforma.

**Trade-offs**  
Widget tests necesitan matrices de tamaños. Algunas pantallas tendrán dos composiciones aunque
compartan estado y componentes.

## FLT-013 — Push requiere decisión backend/plataforma separada

**Status:** Proposed

**Decision**  
No portar Expo Push literalmente. Ejecutar spike FCM/APNs/Web Push y corregir enqueue/sweep antes
de declarar la feature.

**Context**  
Backend actual solo modela Android/Web y Expo/Web Push. iOS no existe. Cliente no registra devices
end-to-end y el cron despacha sin crear deliveries por sí mismo.

**Options considered**

1. Mantener tokens Expo desde Flutter.
2. Migrar Android/iOS a FCM/APNs y conservar Web Push.
3. Posponer push hasta después de paridad core.

**Selected approach**  
Spike primero; secuencia inicial usa opción 3 mientras se evalúa opción 2.

**Reason**  
No hay feature cliente completa que obligue una traducción y la decisión afecta contratos/DB.

**Trade-offs**  
Push no estará en primeros vertical slices. Su milestone no puede cerrarse hasta validar proveedor
real en las tres plataformas.

## FLT-014 — Bugs legacy requieren decisión explícita

**Status:** Accepted

**Decision**  
Registrar cada comportamiento sospechoso antes de corregir o preservar; validación usa el expected
behavior decidido, no una copia accidental.

**Context**  
La auditoría encontró alta USD inaccesible, signo incorrecto de income offline, pendientes fuera de
contexto, edición rechazada de recurrencias USD y otros gaps backend/UI.

**Options considered**

1. Copiar todo literalmente.
2. Corregir todo mientras se porta.
3. Ticketear, clasificar origen y decidir caso por caso.

**Selected approach**  
Opción 3.

**Reason**  
Evita regresión funcional y evita institucionalizar bugs por la regla de paridad.

**Trade-offs**  
Añade trabajo de producto/validación y puede bloquear una feature hasta decidir expected behavior.

## FLT-015 — Start Flutter with clean disposable data

**Status:** Accepted

**Decision**  
Iniciar Flutter con stores y base local limpios, sin implementar puentes (bridge), drenado (drain)
ni scripts de migración de datos para SQLite o IndexedDB legacy.

**Context**  
Los datos actuales de la aplicación son exclusivamente de prueba y descartables. La arquitectura
legacy guardaba colas offline de creación en SQLite (Android) e IndexedDB (Web), pero no existen
datos de producción reales que requieran conservación durante el cutover.

**Options considered**

1. Implementar bridge/drain de stores SQLite/IndexedDB desde Expo hacia Flutter.
2. Iniciar Flutter con stores locales limpios y datos descartables.

**Selected approach**  
Opción 2.

**Reason**  
Elimina complejidad accidental y riesgos técnicos innecesarios en la migración de stores locales.
La paridad funcional se mantiene intacta: Flutter implementará su propio soporte offline desde
cero cuando corresponda (creación de movimientos offline con idempotencia en el backend). El
backend continúa como contrato estable y fuente de verdad. El cutover solo necesita validar
funcionalidad y capacidad de rollback del frontend, no preservar datos locales legacy.

**Trade-offs**  
Ninguno para producción (los datos son de prueba). Se descartan colas locales de prueba no
sincronizadas del frontend legacy.
