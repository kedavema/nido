# ADR 0006: Semillas de categorías al crear el hogar

- Estado: Aceptada
- Fecha: 2026-07-19

## Decisión

Las categorías iniciales se crean **dentro de la misma transacción que crea el hogar y su
membresía `OWNER`**. No existe un endpoint, job ni acción de UI para volver a sembrarlas.

El conjunto inicial es una plantilla versionada en código, editable y archivable como cualquier
otra categoría. Incluye categorías de egreso e ingreso y no crea subcategorías.

## Contexto

M2 necesita que un hogar nuevo sea utilizable sin configuración manual, pero una siembra separada
abre estados parciales: hogar sin categorías, reintentos que duplican filas y una operación extra
que el cliente tendría que coordinar.

## Opciones consideradas

| Estrategia                            | Ventaja                                                  | Costo                                                 |
| ------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Transacción de creación               | Estado completo o rollback total; no hay ventana parcial | La plantilla pertenece al caso de uso de alta         |
| Job idempotente                       | Permite reintentos posteriores                           | Exige marcador/versionado y tolerar estado incompleto |
| Acción explícita o plantilla elegible | Mayor personalización                                    | Agrega decisiones y UI fuera de M2                    |

## Idempotencia

La unidad idempotente es la transacción: si falla, PostgreSQL revierte hogar, membresía y
categorías; si confirma, el caso de uso termina y no vuelve a ejecutar la siembra para ese hogar.
Un reintento de infraestructura nunca observa una confirmación parcial.

No se agrega unicidad por nombre: después del alta, el usuario puede modelar categorías con los
nombres que necesite. La idempotencia no debe imponer una restricción de dominio inexistente.

## Archivo y evolución

- Las semillas no son especiales después de crearse: se renombran, reordenan y archivan mediante
  la API normal.
- Archivar una semilla no provoca que reaparezca.
- Cambiar la plantilla solo afecta hogares creados desde esa versión; no muta hogares existentes.
- Una migración futura de plantilla requerirá una decisión separada y un identificador estable; M2
  no lo necesita.

## Consecuencias

- `createWithOwner` conserva una única frontera atómica para todo el estado inicial del hogar.
- T-206 debe probar el conjunto exacto y que un fallo no deje filas parciales.
- El cliente no conoce ni coordina la siembra.
