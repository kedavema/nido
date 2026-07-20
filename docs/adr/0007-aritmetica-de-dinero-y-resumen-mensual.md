# ADR 0007: Librería decimal para movimientos y cálculo del resumen mensual

- Estado: Aceptada
- Fecha: 2026-07-20

## Contexto

M3 es el primer milestone que persiste dinero real (`transactions.amount`,
`fx_rate_to_base`, `base_amount_pyg`). [ADR 0001](0001-representacion-de-dinero.md)
ya decidió la representación (strings decimales en los límites, escala por
moneda, redondeo half-up), pero no fija con qué librería el dominio parsea y
calcula esos decimales, porque hasta ahora ningún módulo los usaba en
tiempo de ejecución.

M3 también introduce el resumen mensual del dashboard (§6.8: balance del
mes, gasto por categoría raíz, últimos movimientos), y hace falta decidir
cómo se calcula sin anticipar el trabajo de informes de M6.

## Decisión

### Aritmética decimal

El dominio usa el tipo `Decimal` que ya trae Prisma Client (basado en
`decimal.js-light`) para parsear, validar y operar los importes y tipos de
cambio dentro de servicios y repositorios. No se agrega una dependencia
decimal explícita.

Los contratos (Zod) y la API siguen exponiendo únicamente strings
decimales, tal como exige ADR 0001; `Decimal` es un detalle interno que
nunca cruza el límite de contrato. La validación de escala (`PYG0`,
`USD2`), el rechazo de sintaxis inválida y el redondeo half-up en la
conversión a `base_amount_pyg` se implementan como funciones puras del
dominio sobre ese tipo, cubiertas por tests unitarios.

### Cálculo del resumen mensual

El balance del mes y el desglose por categoría raíz se calculan on-the-fly
con consultas SQL agregadas (`SUM`/`GROUP BY`) sobre los índices
`(household_id, local_date)` y `(household_id, category_id, local_date)` ya
definidos en la sección 9. No se mantiene una tabla materializada ni
totales incrementales actualizados en cada escritura.

## Consecuencias

- Cero dependencias nuevas para dinero; si en el futuro se reemplaza
  `Decimal` de Prisma, el cambio queda contenido en el dominio (ADR 0001 ya
  declara la librería reemplazable).
- El resumen mensual siempre refleja el estado real sin lógica de
  invalidación de caché; el costo de la consulta crece con la cantidad de
  movimientos del hogar en el mes, aceptable en el volumen esperado del
  MVP.
- M6 (Presupuestos e informes) construye `reports/monthly-summary` y
  `reports/category-breakdown` como endpoints dedicados reutilizando el
  mismo patrón de agregación; este ADR no lo anticipa ni lo bloquea.
- Las pruebas de M3 deben cubrir escalas inválidas, borde half-up y
  agregados mensuales con movimientos en ambas monedas.

## Alternativas descartadas

- **`decimal.js` o `big.js` como dependencia explícita**: duplica lo que
  Prisma ya expone vía `Decimal`, sin ganancia funcional para el MVP.
- **Tabla materializada de totales mensuales**: agrega complejidad de
  invalidación en cada alta/edición/baja de movimiento; prematuro para el
  volumen de datos por hogar y redundante con el módulo de informes de M6.
