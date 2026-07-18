# ADR 0005: Timing del envío de email de invitación

- Estado: Aceptada
- Fecha: 2026-07-18

## Contexto

El system-design (§5, «Incorporación») dice que el `OWNER` «invita al segundo integrante
por correo». Sin embargo, M1 entrega el token de forma manual:
`POST /v1/households/:householdId/invites` devuelve el token en texto plano una sola vez para
que el `OWNER` lo comparta por un canal externo (README, «Invitaciones»). No hay envío de email
por parte del sistema.

Este spike (T-103, issue #6) decide **si** el MVP implementa envío transaccional de email para la
invitación y **en qué milestone**, sin implementar nada todavía.

Restricciones que condicionan la decisión:

- **ADR 0004 (USD 0):** sin costo fijo, _fail-closed_, proveedor detrás de un adapter reemplazable
  y efectos asíncronos sobre una outbox durable en PostgreSQL. Ningún fallback pago automático.
- **§6.5 (Notificaciones):** los canales definidos son push (Expo Push / Web Push con VAPID). El
  email **no** es un canal actual, y la infraestructura de entrega vive en **M7**.
- **Volumen vs. deliverability:** el volumen es trivial (una invitación por hogar, esporádica), así
  que cualquier free tier alcanza. El riesgo real no es la cuota, sino la **entregabilidad**: un
  email transaccional requiere dominio de envío verificado (SPF/DKIM/DMARC) y, si cae en spam, la
  invitación falla en silencio.
- **Seguridad del token:** el token/enlace nunca se registra en logs; el contrato M1 ya redacta el
  segmento `/v1/invites/*/accept` en los access logs.

## Opciones consideradas

| #   | Opción                                                                                                                                          | A favor                                                                                                             | En contra                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Entrega manual indefinida** (status quo M1): el `OWNER` comparte el token por su cuenta.                                                      | USD 0, _fail-closed_, cero infra nueva; ya funciona.                                                                | Fricción de UX (copiar/pegar un token crudo); §5 «por correo» queda como intención que el producto no cumple.                                         |
| B   | **Email transaccional en M7 (Notificaciones):** implementarlo como canal de la outbox durable + adapter, junto con push.                        | Coherente con ADR 0004 y §6.5; reutiliza infra de entrega; revalidado en M9.                                        | Hasta M7 sigue la entrega manual; suma un proveedor y verificación de dominio.                                                                        |
| C   | **Email transaccional antes de M7** (milestone dedicado temprano).                                                                              | Resuelve antes el primer flujo multi-usuario.                                                                       | Adelanta la infra de delivery fuera de su milestone, con deliverability y dominio a cuestas, para volumen trivial; rompe el foco financiero de M2–M6. |
| D   | **Enlace compartible sin proveedor** (share sheet del SO): la API genera una URL de invitación que el `OWNER` comparte por el canal que quiera. | USD 0, sin proveedor, sin riesgo de deliverability; mejora la UX sin ser «email». Se puede sumar temprano y barato. | No cumple literalmente «por correo», aunque sí la intención (que el `OWNER` no manipule un token crudo).                                              |

## Decisión

Se elige la **Opción B**: el email transaccional de invitación se implementa en **M7
(Notificaciones)** como canal de la outbox durable detrás de un adapter reemplazable, sujeto a la
revalidación USD 0 de M9. Hasta entonces, la **entrega manual del token sigue siendo el mecanismo del
MVP**: el `OWNER` comparte el token por un canal externo.

Motivo: el envío de email es un problema de _entrega_, y esa infraestructura (outbox + adapters, ADR 0004) se construye en M7. Adelantarla para un volumen trivial no se justifica, y el riesgo dominante
no es la cuota sino la entregabilidad (dominio verificado, spam). La creación de la invitación ya
funciona sin email, así que no hay bloqueo funcional.

La **Opción D** (enlace compartible sin proveedor) no se adopta ahora, pero queda registrada como
mejora de UX opcional y no bloqueante, revisable antes de M7 si la fricción del token lo amerita.

## Consecuencias

- Hasta M7, «invita por correo» se cumple por transporte manual del propio `OWNER`, no por envío del
  sistema; §5 y el README deben reflejar esa semántica.
- En M7, el email es un adapter detrás de un puerto de entrega. Agotar cuota o perder al proveedor
  **falla cerrado** y no bloquea la creación de la invitación, que ya funciona sin email.
- Habilitar email exige un dominio de envío verificado (SPF/DKIM/DMARC); entra en la revalidación de
  M9.
- El token/enlace mantiene la regla de M1: nunca se registra en logs ni se recupera después.

## Seguimiento

- Seguimiento en **#19** (M7): email de invitación como canal de la outbox durable + adapter
  reemplazable + verificación del dominio de envío (SPF/DKIM/DMARC), _fail-closed_ y sujeto a la
  revalidación USD 0 de M9.
- La Opción D (enlace compartible) queda como mejora de UX candidata; se abre issue solo si se decide
  adoptarla antes de M7.
