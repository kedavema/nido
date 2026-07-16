# ADR 0001: Representación de dinero

- Estado: Aceptada
- Fecha: 2026-07-16

## Contexto

Nido registra movimientos en PYG y USD, consolida informes en PYG y debe
conservar el valor histórico usado en cada conversión. Los `number` de
JavaScript y el punto flotante binario no preservan exactamente los decimales,
por lo que no son aptos para importes, tipos de cambio ni agregados financieros.

## Decisión

Los importes y tipos de cambio cruzan API, contratos y eventos como **strings
decimales**, nunca como `number`. Se aceptará una sintaxis decimal canónica sin
notación exponencial, separadores de miles, `NaN` ni infinitos. El dominio los
parseará y calculará con aritmética decimal de precisión arbitraria.

La escala monetaria es parte de la moneda:

- PYG tiene escala 0 (`PYG0`): solo guaraníes integrales.
- USD tiene escala 2 (`USD2`): como máximo dos decimales.

Un importe que exceda la escala de su moneda se rechaza; no se redondea de
forma implícita al ingresar. El tipo de movimiento expresa ingreso o gasto, de
modo que el importe monetario se conserva positivo.

Para un movimiento USD se persisten juntos:

- el importe original USD;
- el tipo de cambio manual histórico, expresado en PYG por USD;
- el importe base PYG calculado en ese momento.

La conversión es `importe_usd × tipo_de_cambio` con precisión arbitraria y un
único redondeo **half-up** al PYG integral. Por ejemplo, `10.01 × 7350 =
73573.50` se guarda como `73574` PYG. Informes y reintentos usan el importe base
persistido; nunca recalculan movimientos históricos con un cambio nuevo.

Antes de persistir se validan operandos, resultado convertido y agregados
contra el rango contractual y el tipo PostgreSQL correspondiente. Para
`decimal(18,0)`, un `base_amount_pyg` positivo no puede superar
`999999999999999999`. Un overflow rechaza toda la operación con un error de
dominio estable: no se trunca, satura, envuelve ni convierte a punto flotante.

## Consecuencias

- Los contratos JSON son explícitos y estables entre TypeScript y PostgreSQL.
- La presentación local (`Gs. 1.250.000`, `USD 45,90`) queda separada del valor
  canónico transportado (`"1250000"`, `"45.90"`).
- Las pruebas deben cubrir escalas inválidas, borde half-up, conservación del
  cambio histórico, límites máximos y overflow de conversión/agregación.
- La librería decimal concreta es un detalle reemplazable; el dominio no puede
  exponer ni depender de `number` para dinero.

## Alternativas descartadas

- `number`/`double`: introduce errores binarios y resultados dependientes del
  orden de operación.
- Guardar todo en centavos: no modela naturalmente PYG0 ni el tipo de cambio
  histórico.
- Recalcular con el cambio vigente: modifica retroactivamente reportes cerrados.
