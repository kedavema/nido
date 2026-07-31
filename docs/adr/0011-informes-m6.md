# ADR 0011: Contratos y cálculo de informes de M6

- Estado: Aceptada
- Fecha: 2026-07-31

## Contexto

M6 debe cubrir gasto por categoría y subcategoría, presupuesto frente a real, ingreso frente a
gasto, evolución de tres meses y desglose por medio de pago. Ya existen movimientos con
`base_amount_pyg`, presupuestos mensuales y `reports/monthly-summary`; mantener otra copia de esos
totales introduciría invalidación y riesgo de divergencia.

El diseño del sistema documenta dos rutas todavía ausentes: `reports/category-breakdown` y
`reports/trends`.

## Decisión

### Persistencia y cálculo

- No se agregan tablas ni columnas para informes.
- Todos los importes se agregan al leer desde `transactions.base_amount_pyg`, filtrados primero por
  `household_id` y `local_date`.
- La categoría de una transacción se conserva como dimensión histórica aunque esté archivada. El
  informe agrupa hijos bajo su raíz y separa el gasto cargado directamente a la raíz.
- La evolución contiene exactamente tres meses consecutivos, en orden ascendente y terminando en
  el mes solicitado. Los meses sin movimientos se devuelven con ceros.
- El desglose por medio de pago corresponde al mes solicitado y viaja en la respuesta de
  `reports/trends`, evitando crear una tercera ruta no documentada.

### Contratos

- `ReportMonthQuery` reutiliza `MonthSchema` (`yyyy-MM`).
- Dinero y balances mantienen strings decimales; ningún importe cruza el límite HTTP como
  `number`.
- `category-breakdown` devuelve total del mes, raíces, importe directo de raíz y subcategorías.
- `trends` devuelve los tres puntos de ingreso/gasto/balance y el desglose de gasto por medio de
  pago.
- Cada medio se clasifica como `SHARED`, `PERSONAL` o `UNASSIGNED`. Esto evita confundir
  `owner_user_id = null` de un medio compartido con una transacción sin medio.
- Las entidades archivadas que todavía están referenciadas conservan nombre e identidad en el
  informe.

## Invariantes

- Todas las consultas resuelven membresía activa antes de ejecutar agregados y reciben el
  `householdId` desde el acceso verificado, nunca desde el cuerpo o query del cliente.
- Los porcentajes se redondean half-up a dos decimales y los importes usan `Prisma.Decimal`.
- La suma de gasto directo y subcategorías de una raíz coincide con su total; la suma de raíces
  coincide con `totalExpensePyg` salvo una referencia faltante por corrupción o carrera.
- El desglose por medio de pago solo incluye gastos y su suma coincide con el gasto del mes.

## Consecuencias

- Editar o eliminar un movimiento se refleja inmediatamente sin invalidar vistas materializadas.
- El costo crece con los movimientos de cuatro meses como máximo por carga de Informes, aceptable
  para el volumen MVP y los índices existentes.
- Presupuesto frente a real reutiliza `monthly-summary` y el presupuesto mensual; no duplica una
  tercera interpretación de esos valores.
