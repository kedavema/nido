# ADR 0009: Estrategia de generación de ocurrencias

- Estado: Aceptada
- Fecha: 2026-07-22

## Decisión

Las ocurrencias se generan con **12 meses de anticipación** desde la fecha relevante de cada
regla, y esa generación ocurre en tres momentos, todos idempotentes respecto al unique
`(recurring_item_id, due_date)`:

1. **Alta de una regla** — se generan todas las ocurrencias `PENDING` entre `first_due_date` y
   `first_due_date + 12 meses`.
2. **Edición de una regla activa** (frecuencia, importe estimado, fecha de vencimiento, etc.) — se
   regeneran solo las ocurrencias `PENDING` futuras dentro del horizonte; las `SETTLED`, `SKIPPED`
   u `OVERDUE` no se tocan nunca.
3. **Barrido lazy-on-read** — corre detrás de un advisory lock de PostgreSQL (`pg_advisory_xact_lock`)
   y hace dos cosas en una misma transacción: genera las ocurrencias faltantes de toda regla activa
   dentro del horizonte de 12 meses, y marca `OVERDUE` las `PENDING` con `due_date` anterior a hoy.

El barrido lazy-on-read se dispara en la primera apertura autenticada del día (primer request
autenticado que toca `households/:id` después de medianoche para ese hogar), no en un scheduler.
Esto cubre el caso en que el scheduler diario gratuito (M7/T-700, todavía no implementado) se
retrasa o no corre: la propia apertura de la app hace de señal de respaldo. **No implementa el
scheduler ni el envío de push** — eso es explícitamente responsabilidad de M7.

## Contexto

M5 necesita que un usuario siempre vea ocurrencias generadas y vencidas actualizadas sin depender
de un cron gratuito confiable, y sin que dos requests concurrentes al mismo hogar generen
ocurrencias duplicadas o marquen vencidos dos veces. Al mismo tiempo, §6.4 exige que editar una
regla nunca reescriba un pago o cobro ya realizado — la generación no puede ser un simple
"borrar y recrear".

## Opciones consideradas

| Estrategia                              | Ventaja                                                        | Costo                                                              |
| ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Lazy-on-read + advisory lock (elegida)   | No depende de infraestructura de pago; el lock evita duplicados | Primera apertura del día paga el costo del barrido                  |
| Job/cron dedicado desde ya               | Ocurrencias siempre al día sin esperar una apertura             | Requiere infraestructura de scheduler que M7 todavía no define       |
| Generar todo el horizonte solo al crear  | Más simple, sin barrido recurrente                             | Reglas editadas después de creadas quedarían con ocurrencias viejas y el horizonte de 12 meses se agotaría sin refrescar |

## Idempotencia

La unidad idempotente es la transacción SQL que sostiene el advisory lock: dentro de ella se
generan únicamente las ocurrencias cuyo `(recurring_item_id, due_date)` todavía no existe (`INSERT
... ON CONFLICT DO NOTHING` o verificación previa dentro de la misma transacción) y se marcan
`OVERDUE` solo las filas que siguen `PENDING`. Un segundo request concurrente que intenta adquirir
el mismo lock espera o es no-op; nunca duplica filas ni sobrescribe una ocurrencia ya `SETTLED` o
`SKIPPED`, porque el barrido nunca actualiza esos estados.

## Archivo y evolución

- Editar una regla solo afecta ocurrencias `PENDING` futuras; las `SETTLED` conservan el importe y
  la fecha con las que se liquidaron, sin importar qué tan distinta sea la regla ahora.
- Desactivar una regla (`is_active = false`) detiene la generación futura pero no borra ni cambia
  ocurrencias ya generadas.
- El horizonte de 12 meses es una constante de este ADR; ampliarlo o hacerlo configurable por hogar
  es una decisión futura separada, no algo que M5 necesite.

## Consecuencias

- T-504 (CRUD de reglas) implementa los puntos 1 y 2: generar al alta, regenerar solo `PENDING` al
  editar.
- T-505 (listado de ocurrencias + barrido) implementa el punto 3 y el advisory lock.
- T-509 debe probar explícitamente: edición no toca `SETTLED`, y dos requests concurrentes al
  barrido no duplican ocurrencias ni marcan vencido dos veces.
