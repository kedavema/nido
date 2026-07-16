# ADR 0002: Aislamiento multi-hogar mediante `household_id`

- Estado: Aceptada
- Fecha: 2026-07-16

## Contexto

Aunque el MVP comience con un hogar, Nido es multi-tenant desde el modelo
inicial. Una consulta por UUID sin contexto de hogar puede filtrar datos,
permitir referencias cruzadas o modificar recursos de otro hogar. Los IDs no
son una barrera de autorización.

## Decisión

`household_id` es la frontera de tenant. Toda fila perteneciente a un hogar lo
lleva de forma no nula, y toda lectura, mutación, relación, índice, restricción
única y operación de background se ejecuta dentro de un contexto de hogar
explícito.

El servidor construye ese contexto así:

1. autentica al actor;
2. resuelve `household_id` contra una membresía activa del actor;
3. autoriza la capacidad requerida por su rol;
4. recién entonces invoca repositorios y servicios.

No se confía en `user_id`, rol ni membresía enviados por el cliente. Un
`household_id` de ruta o payload nunca se usa sin la resolución server-side.
Los repositorios tenant-aware reciben `{ actorId, householdId }` y aplican
`household_id` en la misma consulta que busca o modifica el recurso; no se
permite un `findById` global seguido de una comprobación tardía.

Las claves foráneas de entidades hijas deben impedir asociaciones entre
hogares. Los índices de acceso comienzan por `household_id` y las unicidades de
negocio son por hogar, salvo identidades justificadamente globales. Jobs,
outbox e idempotencia conservan el mismo alcance; un proceso interno no obtiene
acceso global implícito.

La aplicación aplica esta política aunque se añada PostgreSQL RLS como defensa
adicional en el futuro. Los errores no revelan si existe un recurso de otro
hogar.

## Verificación obligatoria

Las pruebas de integración negativas deben demostrar, como mínimo, que un
miembro del hogar A no puede enumerar, leer, crear una relación hacia,
actualizar ni eliminar recursos del hogar B, aun con UUIDs válidos conocidos.
También deben cubrir IDs hijos de otro hogar, membresía revocada, cambio de rol
y jobs/reintentos con un tenant incorrecto.

Cada nuevo repositorio o endpoint multi-tenant requiere una prueba positiva del
hogar propio y su contraparte negativa entre hogares.

## Consecuencias

- Hay repetición deliberada de `household_id` en firmas, consultas e índices.
- Los índices son más anchos, pero alinean rendimiento y autorización.
- Las migraciones y revisiones deben tratar una consulta sin tenant como un
  defecto de seguridad, no como una optimización pendiente.

## Alternativas descartadas

- Confiar en UUIDs no adivinables: no autoriza al actor.
- Filtrar solo en controladores: deja repositorios, jobs y rutas nuevas sin
  defensa uniforme.
- Separar una base por hogar desde el MVP: agrega costo y operación sin mejorar
  el modelo de producto actual.
