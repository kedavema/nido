# ADR 0008: Abstracción `SyncStore` para la cola de mutaciones offline

- Estado: Aceptada
- Fecha: 2026-07-21

## Contexto

[ADR 0003](0003-idempotencia-de-movimientos-offline.md) definió el contrato de
idempotencia servidor y delegó la persistencia cliente, la cola y los
reintentos a M4. §11 de `docs/system-design.md` acota ese alcance a crear
gastos e ingresos offline (sin editar ni eliminar) y exige almacenamiento
detrás de una abstracción común: SQLite en Android, IndexedDB en la PWA.

Esta porción de M4 (T-401) solo construye esa abstracción de almacenamiento —
la interfaz `SyncStore` y sus dos implementaciones. La cola local con UI,
networking y reintentos es una porción posterior (T-402) que se apoya en este
contrato sin modificarlo.

## Decisión

### Ubicación: `apps/mobile/src/sync/`, no un paquete compartido

`SyncStore` vive dentro de `apps/mobile`, no en `packages/*`. Ambas
implementaciones dependen directamente de APIs de plataforma (`expo-sqlite`,
`IndexedDB` del navegador) que no existen en `apps/api` ni en ningún otro
consumidor del monorepo. `packages/*` está reservado para lógica libre de
framework y reutilizable entre apps (como `@nido/contracts`); un
almacenamiento atado a una plataforma concreta no califica y forzarlo a un
paquete compartido solo agregaría una capa de indirección sin consumidores
adicionales.

### Convención de resolución por plataforma: `.ts` / `.web.ts`, no `Platform.OS`

Se reutiliza el precedente ya establecido por
`apps/mobile/src/auth/auth-client.ts` / `auth-client.web.ts` /
`auth-client.types.ts`:

- `sync-store.types.ts` — tipos e interfaz `SyncStore` compartidos.
- `sync-store.ts` — implementación nativa/Android (`expo-sqlite`), resuelta
  por defecto.
- `sync-store.web.ts` — implementación web, que Metro/Expo resuelve
  automáticamente para bundles web por el sufijo `.web.ts`.

Se descarta una fábrica en tiempo de ejecución basada en `Platform.OS`: el
codebase ya resuelve este problema en tiempo de bundling, cada archivo importa
solo las APIs de su plataforma (sin código muerto de la otra plataforma en el
bundle) y el chequeo de tipos verifica cada implementación contra la misma
interfaz sin necesidad de un `switch` exhaustivo adicional.

### Backends elegidos

- **Android**: `expo-sqlite` con la API asíncrona (`openDatabaseAsync`,
  `execAsync`/`runAsync`/`getAllAsync`), no la API síncrona legada. Es el
  binding SQLite ya soportado por Expo SDK 57 sin dependencias nativas
  adicionales.
- **Web/PWA**: `IndexedDB` nativo del navegador, sin librería intermedia. La
  API es verbosa pero suficiente para el volumen de una cola offline personal;
  agregar una librería (p. ej. `idb`) no se justifica para las cinco
  operaciones del contrato.

Ambas implementaciones crean su tabla/object store de forma perezosa en el
primer uso y exponen un getter singleton (`getSyncStore()`), igual que
`getFirebaseAuthClient()`, para mantener la inicialización perezosa
consistente con el resto del código.

### Pruebas

- `sync-store.test.ts` (nativa) mockea `expo-sqlite` con un backend en memoria
  que interpreta las sentencias SQL exactas emitidas por la implementación,
  porque el entorno `node` de Vitest no tiene binding nativo de SQLite.
- `sync-store.web.test.ts` usa `fake-indexeddb`, una implementación real en
  memoria de IndexedDB, sin mockear código propio.

### Restricción heredada de §11: nunca borrar en silencio al cerrar sesión

`docs/system-design.md` §11 es explícito: **nunca se borra una mutación no
sincronizada al cerrar sesión sin advertir al usuario**. Por eso `SyncStore`
no expone ningún método de tipo `clear()` o `purgeOnLogout()`. La única forma
de quitar una mutación es `remove(id)`, pensado para una mutación ya
sincronizada (o descartada explícitamente por el usuario), no para un vaciado
masivo.

## Consecuencias

- T-402 (cola local + UI) debe implementar la advertencia de sesión sobre
  mutaciones pendientes en la capa de UI/flujo de logout, llamando a
  `remove(id)` mutación por mutación solo después de que el usuario confirme
  perder ese trabajo. `SyncStore` no ofrece un atajo que lo evite.
- El campo `id` de `QueuedMutation` es la misma clave que ADR 0003 exige
  reenviar como `Idempotency-Key`; T-402 debe generarla como UUID estable en
  el momento de encolar, no reutilizar un id de almacenamiento generado por
  SQLite/IndexedDB.
- `attempts` solo se incrementa en la transición a `error` (ver comentario en
  ambas implementaciones); T-402 debe apoyarse en esa regla para decidir
  backoff, no reinterpretarla.
- Ninguna implementación conoce networking, reintentos ni el flujo de
  creación de gastos/ingresos; ese acoplamiento se decide en T-402.

## Alternativas descartadas

- **Paquete compartido `packages/sync-store`**: sin consumidores fuera de
  `apps/mobile` hoy; se puede extraer más adelante si `apps/api` u otro
  cliente necesitara consumir el mismo contrato, pero anticiparlo ahora es
  especulativo.
- **Fábrica `Platform.OS === 'web' ? webStore : nativeStore`**: duplica una
  resolución que Metro ya hace mejor a nivel de bundle, y arriesga incluir
  `expo-sqlite` en el bundle web o `IndexedDB` en el bundle nativo si alguien
  olvida la rama.
- **Librería IndexedDB de terceros (`idb`, `dexie`)**: agrega una dependencia
  de producción para envolver cinco operaciones simples que la API nativa ya
  cubre; se reconsiderará si T-402 necesita transacciones más complejas.
