# ADR 0012: Arquitectura de entrega de notificaciones

- Estado: Aceptada
- Fecha: 2026-08-02

## Decisión

Las notificaciones de M7 se entregan con **una sola tabla de deliveries específica de ocurrencias**,
alimentada por **el barrido diario que ya existe** (ADR 0009) y despachada por **adapters de canal
reemplazables** detrás de un puerto. No se agrega Redis, cola administrada ni fallback pago
(ADR 0004).

Las siete decisiones que fija esta ADR:

1. **`device_installations` es un recurso de identidad, no de hogar.** Un teléfono pertenece a una
   persona, no a una casa. Sus rutas (`POST /v1/devices/register`, `DELETE /v1/devices/:id`) van
   bajo `AuthenticationGuard` sin `householdId` en el path, y el `user_id` sale siempre del token
   verificado, nunca del body. El aislamiento por `household_id` que exige ADR 0002 vive en
   `notification_deliveries`, que es donde hay dato financiero.
2. **La identidad estable de una instalación es un `installation_id` generado por el cliente**, con
   unicidad sobre esa columna sola.
3. **Toda credencial se persiste cifrada** con AES-256-GCM y un keyring versionado, tanto los tokens
   Expo como las suscripciones Web Push.
4. **Una fila de delivery es una notificación lógica al responsable**, no una por dispositivo.
5. **El claim es `FOR UPDATE SKIP LOCKED` con el contador de intentos incrementado al reclamar**, con
   techo de tres intentos que se sostiene incluso ante un crash.
6. **El barrido de ADR 0009 se extiende, no se duplica**: encolar deliveries es un paso más dentro
   de la misma transacción y el mismo advisory lock. Despachar, en cambio, es un endpoint aparte.
7. **El email de invitación (#19) queda diferido**, con las opciones evaluadas registradas más abajo.

## Contexto

§6.5 pide recordatorios de gastos fijos con offsets configurables por regla, dirigidos únicamente al
responsable de la ocurrencia, sobre infraestructura gratuita que no promete hora exacta de entrega.
§10 describe el procesamiento como un scheduler diario con barrido de respaldo al abrir la app. §13
exige cifrar las suscripciones Web Push y no registrar tokens en logs.

Tres restricciones del código actual condicionan el diseño:

- El barrido lazy-on-read de ADR 0009 ya resuelve "una vez por hogar por día" bajo
  `pg_advisory_xact_lock`, con el marcador `households.last_swept_on`. Construir un segundo
  mecanismo de recorrido diario sería duplicar una garantía ya probada.
- `occurrences` no guarda el `kind` de la regla, así que filtrar solo gastos exige unir contra
  `recurring_items`.
- `PrismaOccurrenceSettlementRepository` ya reserva el punto de cancelación dentro de la transacción
  de liquidación; la cancelación atómica no necesita reestructurar nada.

## Identidad de instalación, rotación y baja

El cliente genera un UUID y lo persiste en `expo-secure-store` (nativo) o `localStorage` (web). Ese
`installation_id` sobrevive a la rotación del token del proveedor y al re-login.

La unicidad va sobre **`installation_id` solo**, no sobre `(user_id, installation_id)`. Si un segundo
usuario se loguea en el mismo teléfono, el registro sobrescribe `user_id` y credencial. Con una clave
compuesta quedarían dos filas activas y el usuario anterior seguiría recibiendo notificaciones en un
dispositivo del que se deslogueó — una fuga de información entre cuentas, no solo un duplicado.

El caso inverso, un mismo token de proveedor bajo dos `installation_id` distintos (reinstalación de la
app), se resuelve con un índice único parcial sobre `credential_fingerprint` limitado a las filas con
`deactivated_at IS NULL`: al colisionar se desactiva la fila vieja. Sin ese índice, una reinstalación
produce push duplicado.

El logout llama `DELETE /v1/devices/:id` antes de limpiar la sesión, pero **no bloquea el logout si
falla**: la sobrescritura por `installation_id` cubre el caso. La baja es lógica —`deactivated_at` y
`credential_ciphertext = NULL`— para conservar el historial de deliveries; una segunda baja del mismo
dispositivo devuelve 204, y una baja sobre un dispositivo ajeno o inexistente devuelve 404 sin
distinguir entre ambos.

## Cifrado de credenciales

Se cifran **ambos canales**, no solo Web Push como pide el mínimo de §13: un token Expo también es una
capability que permite enviar notificaciones a un dispositivo concreto. Unificarlos deja un solo
camino de código en lugar de dos con reglas distintas.

- Algoritmo: AES-256-GCM. Formato almacenado: `v1.<keyId>.<iv b64url>.<ct+tag b64url>`.
- **AAD = `${installationId}|${channel}`**: ata el ciphertext a su fila, de modo que mover un valor
  cifrado de un registro a otro falla al descifrar en lugar de suplantar silenciosamente.
- Keyring versionado en variables privadas de la API (`NOTIFICATION_CREDENTIAL_KEYS` con pares
  `keyId:base64key`, más `NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID`). Se descifra por el `keyId` embebido
  y se cifra siempre con la clave activa, así rotar no requiere migración de datos.
- `credential_fingerprint` es un HMAC-SHA256 con un pepper separado
  (`NOTIFICATION_CREDENTIAL_PEPPER`): determinístico, para que sirva de índice, sin que la huella
  permita reconstruir el token.

Ninguna de estas variables puede llevar prefijo `EXPO_PUBLIC_`, porque ese prefijo publica el valor en
el bundle del cliente. La credencial tampoco aparece nunca en una respuesta de la API ni en logs.

## State machine de deliveries

```
PENDING ──claim──> SENDING ──ok─────────────────> SENT
                      ├─transitorio & intentos<3──> PENDING
                      ├─transitorio & intentos=3──> FAILED
                      └─permanente ──────────────-> FAILED

PENDING | SENDING ──settle/skip──> CANCELLED   (misma transacción SQL)
```

Una fila representa **una notificación lógica al responsable**, identificada por
`(occurrence_id, offset_days)`. El abanico hacia las N instalaciones activas de ese usuario ocurre al
enviar: la delivery queda `SENT` si al menos una instalación aceptó. Modelar una fila por dispositivo
habría atado la clave de idempotencia al inventario de dispositivos, que cambia entre el momento en
que se encola y el momento en que se envía.

El claim es una sola sentencia:

```sql
UPDATE notification_deliveries SET status='SENDING', claimed_at=now(), attempts=attempts+1
WHERE id IN (
  SELECT id FROM notification_deliveries
  WHERE attempts < 3 AND scheduled_for <= $today
    AND (status='PENDING'
         OR (status='SENDING' AND claimed_at < now() - interval '15 minutes'))
  ORDER BY scheduled_for, created_at
  FOR UPDATE SKIP LOCKED LIMIT $batch
) RETURNING ...
```

`FOR UPDATE SKIP LOCKED` garantiza que dos corridas concurrentes —el cron y una apertura de app, o dos
invocaciones del cron— nunca reclamen la misma fila. El contador se incrementa **al reclamar**, no al
fallar: un proceso que muere después del claim ya consumió su intento, así que el techo de tres se
sostiene aunque el resultado nunca se escriba. La rama de los 15 minutos es la recuperación tras
crash: reencola una fila colgada en `SENDING` sin devolverle intentos.

### Clasificación de errores

| Clase                | Señal                                                           | Acción                                         |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `TRANSIENT`          | HTTP 429, 5xx, timeout de red, Expo `MessageRateExceeded`       | reintenta mientras `attempts < 3`              |
| `PERMANENT`          | HTTP 4xx distinto de 429/404/410, Expo `MessageTooBig`, payload | `FAILED` sin reintento                         |
| `INVALID_CREDENTIAL` | Expo `DeviceNotRegistered`, Web Push 404 o 410 Gone             | desactiva esa instalación; sin otras, `FAILED` |

Se persiste la clase, nunca el mensaje crudo del proveedor, para que ningún token o endpoint termine
en la base o en un log. Agotar cuota o perder al proveedor cae en `TRANSIENT` y falla cerrado: se
reintenta de forma acotada y nunca se activa un canal pago.

### Cancelación al pagar o saltar

Liquidar o saltar una ocurrencia ejecuta, **dentro de la misma transacción** que ya bloquea la fila de
`occurrences`:

```sql
UPDATE notification_deliveries SET status='CANCELLED', updated_at=now()
WHERE occurrence_id = $1 AND status IN ('PENDING','SENDING')
```

Esto es **at-least-once, no exactly-once**, y conviene decirlo explícitamente. Si el despachador ya
reclamó la fila y está dentro de la llamada HTTP al proveedor cuando el usuario paga, el `UPDATE`
espera a que la transacción de claim libere el lock y recién entonces marca `CANCELLED`, pero la
notificación ya salió. La ventana es de milisegundos y el peor caso es un recordatorio de más sobre un
gasto recién pagado. El cierre del despachador usa `WHERE id = $1 AND status = 'SENDING'`, así que
nunca pisa un `CANCELLED` posterior. Cerrar esa ventana del todo exigiría coordinación distribuida que
contradice el perfil USD 0 de ADR 0004.

## Reutilización del barrido de ADR 0009

El cuerpo del barrido actual se extrae a un caso de uso `runDailyHouseholdMaintenance(householdId,
today)` que, bajo **el mismo `pg_advisory_xact_lock(hashtext(householdId))` y la misma transacción**,
hace cuatro pasos:

1. generar ocurrencias faltantes dentro del horizonte de 12 meses (existente);
2. marcar `OVERDUE` las `PENDING` vencidas (existente);
3. **encolar los deliveries que corresponden al día (nuevo)**;
4. estampar `last_swept_on` (existente).

El marcador sigue garantizando una ejecución por hogar por día para los dos disparadores. El paso 3 es
un solo `INSERT ... SELECT` idempotente:

```sql
INSERT INTO notification_deliveries (household_id, occurrence_id, user_id, offset_days, scheduled_for)
SELECT o.household_id, o.id, o.responsible_user_id, off.value, (o.due_date - off.value)
FROM occurrences o
JOIN recurring_items r ON r.id = o.recurring_item_id
CROSS JOIN LATERAL unnest(r.notification_offsets) AS off(value)
WHERE o.household_id = $1
  AND r.kind = 'EXPENSE'
  AND o.responsible_user_id IS NOT NULL
  AND o.status IN ('PENDING','OVERDUE')
  AND (o.due_date - off.value) BETWEEN $today - 1 AND $today
ON CONFLICT (occurrence_id, offset_days) DO NOTHING
```

`r.kind = 'EXPENSE'` implementa "solo los gastos notifican" y `responsible_user_id IS NOT NULL`
implementa "sin responsable no hay delivery". Los offsets salen de `recurring_items.notification_offsets`,
que ya se persiste por regla; una regla con arreglo vacío simplemente no genera nada y no se
retroalimenta con valores por defecto.

La ventana `BETWEEN $today - 1 AND $today` es deliberada: absorbe un día de scheduler caído sin que la
primera corrida sobre una base con historia dispare meses de recordatorios viejos. `$today` se calcula
con `households.timezone` (`America/Asuncion`), no en UTC.

## Encolar dentro del GET, despachar fuera

Encolar es un `INSERT ... SELECT` indexado que corre a lo sumo una vez por hogar por día, así que
viaja dentro del barrido lazy-on-read que ADR 0009 ya aceptó en la lectura de ocurrencias. Despachar
es I/O de red contra un proveedor externo, con latencia y modos de falla propios, y **no** puede
esconderse en un GET.

Por eso el despacho tiene su propio endpoint, `POST /v1/households/:householdId/notifications/dispatch`,
que el cliente invoca tras el login o la apertura de la app **sin esperar su respuesta** para renderizar
Inicio. Usa `pg_try_advisory_lock` no bloqueante: una segunda llamada concurrente devuelve de inmediato
en lugar de encolarse. El cron recorre todos los hogares invocando el mismo caso de uso, de modo que
ambos disparadores comparten código y lock.

## Scheduler y anti-replay

`POST /v1/internal/jobs/due-notifications` no acepta token Firebase, porque quien lo llama es GitHub
Actions y no un usuario. Se autentica con HMAC-SHA256 sobre
`v1:${timestamp}:${nonce}:${sha256(rawBody)}`, comparada con `crypto.timingSafeEqual`, y se rechaza si
`|now − timestamp| > 300s`.

El anti-replay usa una tabla `internal_job_nonces(nonce PK, created_at)`: el `INSERT` duplicado **es**
la detección, sin necesidad de Redis ni de un almacén en memoria que se pierda al dormir la instancia.
La misma request purga los nonces de más de diez minutos. La respuesta expone solo contadores
agregados.

## Canales y payload

Los adapters implementan un puerto `PushSender`; ningún SDK de proveedor entra al dominio, y los tests
usan un `FakePushSender`.

- **Expo Push**: adapter con `fetch` plano contra la API de push de Expo. No se agrega
  `expo-server-sdk`: es un POST HTTPS, y evitar la dependencia mantiene el borde del proveedor en un
  archivo propio.
- **Web Push**: se usa `web-push` dentro del adapter, porque la criptografía ECDH/AES128GCM del
  estándar no se escribe a mano. Las claves VAPID viven solo en la API; el cliente obtiene la pública
  por `GET /v1/notifications/vapid-public-key` en lugar de por una variable de build, para que exista
  una sola fuente de verdad.

El payload es deliberadamente pobre, porque se muestra en pantalla bloqueada: título según el offset
("Vence hoy", "Vence mañana", "Vence en N días") y un cuerpo genérico, sin monto, sin descripción de la
regla y sin token. El `data` lleva `{ kind: 'occurrence_due', occurrenceId }`, que alimenta el deep
link `nido:///pagar-fijo/${occurrenceId}` — una ruta que ya existe y ya recibe un id de ocurrencia.

## Idempotencia

| Operación               | Unidad idempotente                                                       |
| ----------------------- | ------------------------------------------------------------------------ |
| Registro de dispositivo | `installation_id` único; re-registrar actualiza credencial y `last_seen` |
| Encolado de deliveries  | `(occurrence_id, offset_days)` único + `ON CONFLICT DO NOTHING`          |
| Barrido diario          | `households.last_swept_on` bajo `pg_advisory_xact_lock`                  |
| Claim de envío          | `FOR UPDATE SKIP LOCKED` + incremento de intentos al reclamar            |
| Baja de dispositivo     | baja lógica; una segunda baja devuelve 204                               |
| Invocación del job      | `internal_job_nonces` con `nonce` como clave primaria                    |

Dos ejecuciones concurrentes del job, o el job y una apertura de app en simultáneo, no duplican filas
ni envíos: la primera gana el advisory lock por hogar para encolar y el `SKIP LOCKED` reparte las
filas al despachar.

## Email de invitación (#19) — diferido

ADR 0005 decidió que el email transaccional de invitación se implementaría en M7 como canal de la
outbox durable. Al aterrizarlo aparece una contradicción con M1: el token de invitación se devuelve
una sola vez y solo se persiste su hash SHA-256, mientras que un envío asíncrono necesita material
recuperable después de que la transacción cerró. Además `notification_deliveries` está modelada
alrededor de `occurrence_id` y no admite un destinatario que no sea una ocurrencia.

Dos cosas quedan descartadas de plano: guardar el token en texto plano en una outbox, y forzar envíos
de email dentro de la tabla específica de ocurrencias. `notification_deliveries` **queda específica de
recordatorios financieros**.

Opciones evaluadas para el material recuperable:

| #   | Opción                                                                                                                                                   | A favor                                                                                                                       | En contra                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Sobre cifrado efímero**: outbox genérica con `payload_ciphertext`, TTL menor o igual al de la invitación y borrado del ciphertext tras estado terminal | No cambia el esquema de generación del token                                                                                  | Rompe explícitamente "solo hashes persistidos"; agrega TTL, borrado y un estado más que puede fallar en silencio si el borrado no corre |
| B   | **Tokens derivados**: `token = HMAC(INVITE_LINK_KEY, invite_id)`, siguiendo persistiendo `token_hash = sha256(token)` como hoy                           | No persiste ningún material recuperable; sin ciphertext, sin TTL, sin paso de borrado; la invariante se sostiene literalmente | Comprometer `INVITE_LINK_KEY` permite acuñar el token de cualquier invitación desde su id; rotar invalida invitaciones vivas            |
| C   | **Diferir** (elegida): registrar el análisis, no tocar el esquema de invitaciones                                                                        | No gasta un cambio de esquema de seguridad antes de que exista proveedor y dominio; la entrega manual ya funciona             | §5 sigue cumpliéndose por transporte manual del `OWNER`, no por envío del sistema                                                       |

Se elige **C**. La opción B es técnicamente superior a la A —su exposición es la misma que la de la
clave de cifrado, con menos piezas móviles— y es la candidata registrada si se retoma el tema. Pero
habilitar entrega real igual exige un proveedor elegido, un dominio verificado con SPF/DKIM/DMARC y la
revalidación USD 0 de M9 (ADR 0004), y ninguna de esas tres cosas existe hoy. Cambiar el esquema de
generación del token ahora agregaría superficie de riesgo sin habilitar ninguna funcionalidad.

En consecuencia, **#19 permanece `status:proposed` y bloqueado por decisión**, la creación de
invitaciones sigue siendo atómica y sin dependencia del email, y la entrega manual del token continúa
siendo el mecanismo del MVP. ADR 0005 no se revierte: su Opción B sigue siendo el destino, con el
milestone corrido a la revalidación de M9.

## Consecuencias

- Se acepta que la entrega es at-least-once y sin hora exacta garantizada; ni la UI ni el copy pueden
  prometer lo contrario.
- Pagar o saltar una ocurrencia cancela sus deliveries reintentables en la misma transacción, con la
  ventana de carrera documentada arriba.
- Un dispositivo con credencial inválida se desactiva solo; el usuario vuelve a activarlo desde la
  pantalla de notificaciones sin intervención manual.
- El cron y la apertura autenticada comparten caso de uso y lock, así que agregar disparadores futuros
  no multiplica algoritmos.
- Mientras no exista un endpoint HTTPS desplegado (ADR 0004 difiere el deploy a M9), el workflow de
  GitHub Actions queda listo pero su verificación real y la recepción en una PWA instalada en iPhone
  quedan pendientes de M9. T-700 no puede declararse cerrada por ese motivo.
- Las variables nuevas (`NOTIFICATION_CREDENTIAL_KEYS`, `NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID`,
  `NOTIFICATION_CREDENTIAL_PEPPER`, `NOTIFICATIONS_JOB_HMAC_SECRET`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) son privadas de la API y ninguna puede exponerse al bundle.

## Alternativas descartadas

- **Una fila de delivery por dispositivo**: ata la clave de idempotencia a un inventario que cambia
  entre encolar y enviar, y multiplica filas sin agregar garantías.
- **Un job de barrido propio, separado del de ADR 0009**: duplicaría la garantía "una vez por hogar
  por día" en dos implementaciones que pueden divergir.
- **Despachar dentro del GET de ocurrencias**: esconde latencia de red y fallas de proveedor en una
  lectura, y hace que la pantalla de Inicio dependa de un tercero.
- **Nonces anti-replay en memoria**: se pierden cuando la instancia gratuita duerme, que es
  precisamente el escenario esperado.
- **Clave única de cifrado sin `keyId`**: obliga a una migración de datos para rotar.
