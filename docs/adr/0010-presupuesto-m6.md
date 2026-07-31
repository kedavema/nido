# ADR 0010: Contrato y persistencia de presupuestos de M6

- Estado: Aceptada
- Fecha: 2026-07-31

## Contexto

M6 necesita guardar un límite mensual y asignaciones por categoría raíz, pero el modelo Prisma y
los contratos actuales todavía solo cubren movimientos y recurrentes. El resumen mensual de M3 ya
existe en `GET /households/:householdId/reports/monthly-summary` y su respuesta es estricta.

## Decisión

### Modelo de datos

- `budget_months` guarda un registro por `(household_id, month)`, donde `month` siempre es el
  primer día del mes y `total_limit_pyg` es `decimal(18,0)`.
- `budget_allocations` usa `(budget_month_id, category_id)` como identidad compuesta. Solo puede
  apuntar a una categoría raíz de gasto del mismo hogar.
- `copied_from_id` conserva la procedencia de una copia sin convertirla en una cadena de
  movimientos ni herencia viva.
- Los importes calculados —sin distribuir, gasto real, disponible y proyección— no se materializan
  en tablas; se derivan al leer con `Prisma.Decimal` y consultas agregadas.

### Límite de contratos

- En los límites HTTP, el mes usa `yyyy-MM` (`MonthSchema`), aunque PostgreSQL persiste el primer
  día como `DATE`.
- `GET` devuelve `budgetMonth: null` cuando el mes todavía no tiene presupuesto.
- `PUT` reemplaza atómicamente el límite y el conjunto completo de asignaciones.
- `POST .../copy` recibe `sourceMonth` explícito y devuelve un presupuesto independiente.
- `POST .../copy` rechaza con conflicto si el mes destino ya tiene presupuesto; copiar nunca
  sobrescribe silenciosamente una planificación existente.
- El API valida que cada `categoryId` sea una categoría raíz `EXPENSE` activa o archivada del mismo
  hogar; la migración repite la regla como backstop contra carreras concurrentes.
- `MonthlySummaryResponseSchema` conserva los campos de M3 y agrega `budget: BudgetSummary | null`.
  La API devuelve `null` cuando el mes no tiene presupuesto y calcula el bloque desde movimientos y
  ocurrencias pendientes cuando sí existe; API, mobile y tests evolucionan juntos porque comparten
  el paquete de contratos.

## Invariantes

- Ningún límite ni asignación puede ser negativo.
- La suma de asignaciones no puede superar el límite; la aplicación la valida dentro de la misma
  transacción que reemplaza el presupuesto.
- La migración impone unicidad por hogar/mes, primer día del mes, claves foráneas y la pertenencia
  de cada categoría a la raíz EXPENSE del hogar mediante trigger PostgreSQL.
- Los endpoints futuros deben resolver membresía activa antes de leer o mutar cualquier presupuesto.

## Consecuencias

- El contrato estricto evita que el cliente confunda “sin presupuesto” con un presupuesto de cero.
- Agregar `budget` al resumen exige desplegar API y mobile de forma coordinada; es preferible a
  duplicar el endpoint M3 o crear una versión paralela que contradiga la ruta documentada.
- La siguiente slice puede implementar CRUD/copia sin rediseñar el almacenamiento ni el contrato.
