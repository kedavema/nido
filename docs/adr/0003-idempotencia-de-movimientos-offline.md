# ADR 0003: Idempotencia de movimientos offline

- Estado: Aceptada
- Fecha: 2026-07-16

## Contexto

Una mutación guardada offline puede reenviarse por reconexión, timeout, cierre
de la app o una respuesta perdida. Sin un protocolo durable, un mismo gasto o
ingreso puede crearse más de una vez y alterar todos los totales.

## Decisión

Para cada creación offline el cliente genera un UUID aleatorio estable. Envía
el mismo valor como `client_mutation_id` y como header `Idempotency-Key` en cada
reintento; nunca genera una clave nueva para el mismo intento lógico.

El servidor valida el UUID y delimita la clave por la tupla:

```text
(actor_id, household_id, idempotency_key)
```

Además calcula un hash criptográfico del payload semántico ya validado y
canonizado, junto con la operación/version de contrato. Orden de claves,
headers de transporte y metadatos de observabilidad no cambian el hash; importe,
moneda, cambio, fecha y demás datos de negocio sí lo cambian.

El primer request reclama la tupla y ejecuta la mutación en una única
transacción PostgreSQL que incluye la fila de idempotencia, el movimiento y el
resultado durable. Ante concurrencia, la restricción única permite un solo
ganador.

- Misma tupla y mismo hash: devuelve el resultado original sin repetir efectos.
- Misma tupla y hash distinto: devuelve `409 Conflict`; nunca sobrescribe ni
  crea otro movimiento.
- Fallo antes del commit: no deja una mutación parcial y un reintento puede
  volver a competir de forma segura.

La respuesta de replay debe ser semánticamente equivalente a la original e
identificar el mismo recurso. La retención de registros debe superar la ventana
máxima de la cola offline; no se purgan claves mientras un cliente aún pueda
reintentarlas.

## Alcance temporal

M0 acepta el contrato, pero no implementa cola ni sincronización. La
persistencia server-side, `SyncStore`, reintentos y pruebas de reconexión se
implementan en **M4**. Hasta entonces no se debe agregar una simulación parcial
que aparente idempotencia.

## Verificación obligatoria en M4

- reenvío secuencial y concurrente con el mismo payload crea una sola fila;
- replay devuelve el mismo movimiento;
- reutilizar la clave con otro payload responde `409`;
- actor u hogar diferente no colisiona con la misma UUID;
- un rollback no deja movimiento ni recibo huérfano;
- un reinicio del proceso conserva la deduplicación.

## Consecuencias

- Se necesita almacenamiento durable y una unicidad compuesta, no una caché en
  memoria.
- El hash evita que un bug del cliente convierta una clave reutilizada en una
  actualización silenciosa.
- El cliente debe persistir la UUID junto al payload hasta recibir confirmación.

## Alternativas descartadas

- Deduplificar por timestamp o campos parecidos: puede fusionar movimientos
  legítimos y no resuelve carreras.
- Confiar solo en retries HTTP: no distingue si la primera escritura hizo
  commit.
- Usar Redis como fuente de idempotencia: agrega costo y puede perder el recibo
  mientras PostgreSQL ya conserva el movimiento.
