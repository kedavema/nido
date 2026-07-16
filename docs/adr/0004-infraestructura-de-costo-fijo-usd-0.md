# ADR 0004: Infraestructura de costo fijo mensual USD 0

- Estado: Aceptada
- Fecha: 2026-07-16

## Contexto

El MVP debe operar sin costo fijo mensual y tolera cold starts, cuotas y menor
garantía operativa. Las ofertas gratuitas cambian, por lo que nombrar un
proveedor hoy no garantiza que siga cumpliendo el objetivo al distribuir M9.

## Decisión

El perfil inicial considera estos **candidatos**, sujetos a validación futura:

| Capacidad              | Candidato gratuito      |
| ---------------------- | ----------------------- |
| Android builds/updates | Expo Free               |
| PWA estática           | Cloudflare Pages Free   |
| API NestJS             | Render Free Web Service |
| PostgreSQL             | Neon Free               |
| Login Google           | Firebase Auth Spark     |
| Scheduler diario       | GitHub Actions          |
| Push Android           | Expo Push               |
| Push PWA               | Web Push/VAPID          |

No se adjunta un método de pago, no se habilita auto-spend, auto-upgrade ni
capacidad que pueda generar cargos. Agotar una cuota, dormir una instancia o
perder temporalmente una dependencia debe **fallar cerrado**: se pausa o rechaza
la operación afectada y se informa su indisponibilidad; nunca se activa un
fallback pago automáticamente. USD 0 es una restricción, no una estimación.

El dominio no depende de SDKs de proveedor. Autenticación, notificaciones,
scheduler y persistencia se conectan mediante puertos y adapters reemplazables.
Los efectos asíncronos y deliveries usan una outbox durable en PostgreSQL con
reintentos e idempotencia; no se agrega Redis ni una cola administrada para el
MVP.

Docker Compose es solo el entorno PostgreSQL local. **M0 no despliega** ningún
servicio, no crea cuentas cloud y no configura credenciales de producción.

En **M9**, antes de cualquier deploy, se revalidan precios, límites, términos,
retención, backups, cold starts y compatibilidad de cada candidato. Si alguno
ya no cumple USD 0 sin método de pago, se reemplaza mediante su adapter o se
reduce la capacidad; no se despliega hasta recuperar un perfil cerrado de costo
cero y obtener la decisión explícita correspondiente.

## Consecuencias

- Se aceptan cold starts y retrasos del scheduler; la UI debe tolerarlos sin
  duplicar requests ni prometer entrega en tiempo real.
- Cuotas agotadas pueden detener escrituras o notificaciones.
- La outbox PostgreSQL reduce componentes, pero comparte capacidad con datos de
  negocio.
- Los backups del free tier no bastan para uso comercial; una política propia
  es requisito antes de comercializar.
- El proveedor se elige por adapter y operación, no se filtra al dominio.

## Alternativas descartadas

- Adjuntar una tarjeta con alertas de presupuesto: una alerta no impide cargos.
- Activar escalado o excedentes automáticos: contradice el límite duro USD 0.
- Fijar los candidatos como compromiso permanente: sus planes y condiciones
  pueden cambiar antes de M9.
- Desplegar en M0 para “probar” el perfil: adelanta alcance y crea estado externo
  sin la revalidación requerida.
