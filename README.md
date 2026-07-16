# Nido

Nido es una aplicación de control de gastos compartidos para un hogar. Este
repositorio contiene la foundation de M0: monorepo pnpm/Turborepo, shell de
Expo Router para Android y web/PWA, API NestJS, paquetes compartidos y
PostgreSQL local opcional.

## Requisitos

- Node.js 24.x.
- pnpm 11.x mediante Corepack.
- Docker Engine con Docker Compose, opcional; solo es necesario para levantar
  PostgreSQL local.
- Para Android: Android Studio, JDK 17, Android SDK/Platform Tools configurados,
  un emulador o dispositivo y `adb` disponible.
- Un navegador moderno para el target web/PWA.

## Preparación local

Desde la raíz del repositorio:

```sh
corepack enable
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
```

`apps/api/.env.example` documenta todas las variables requeridas con valores
seguros para desarrollo. El archivo local `apps/api/.env` no se versiona y no
debe contener credenciales reales compartidas.

El `.env.example` de la raíz documenta el override opcional `POSTGRES_PORT` de
Docker Compose. No necesitás copiarlo mientras el puerto local `5432` esté
disponible.

Docker no es necesario para instalar, revisar calidad ni abrir el shell. Para
trabajar con PostgreSQL local, validá primero la configuración y luego levantá
el servicio:

```sh
pnpm compose:config
pnpm compose:up
```

## Comandos oficiales

Todos se ejecutan desde la raíz:

| Objetivo                 | Comando                          |
| ------------------------ | -------------------------------- |
| Instalación reproducible | `pnpm install --frozen-lockfile` |
| Lint                     | `pnpm lint`                      |
| Verificar formato        | `pnpm format:check`              |
| Verificar tipos          | `pnpm typecheck`                 |
| Pruebas unitarias y E2E  | `pnpm test`                      |
| Build del monorepo       | `pnpm build`                     |
| Export web/PWA           | `pnpm build:web`                 |
| Export Android           | `pnpm build:android`             |
| API en desarrollo        | `pnpm dev:api`                   |
| Expo en desarrollo       | `pnpm dev:mobile`                |
| Configuración Expo       | `pnpm config:mobile`             |
| Diagnóstico Expo         | `pnpm doctor:mobile`             |
| Validar Docker Compose   | `pnpm compose:config`            |
| Levantar PostgreSQL      | `pnpm compose:up`                |
| Detener PostgreSQL       | `pnpm compose:down`              |

`pnpm dev:mobile` abre Expo: elegí web para probar el shell en el navegador o
Android con un emulador/dispositivo ya disponible. `pnpm build:web` genera el
artefacto estático web/PWA y `pnpm build:android` verifica el bundle Android;
M0 no incorpora sincronización financiera offline.

## Salud de la API

La API expone dos probes sin el prefijo de negocio `/v1`:

- `GET /health/live`: indica que el proceso está vivo y puede responder. No
  depende de PostgreSQL ni de proveedores externos.
- `GET /health/ready`: indica que NestJS terminó de iniciar con configuración
  tipada válida y puede recibir tráfico. M0 todavía no abre una conexión de
  dominio a PostgreSQL, por lo que este probe no consulta la base. Cuando un
  milestone agregue una dependencia obligatoria, debe incorporarla al probe y
  responder `503` mientras no esté lista.

Con `PORT=3000` (el valor del ejemplo), la URL local es
`http://localhost:3000`; podés consultar `http://localhost:3000/health/live` y
`http://localhost:3000/health/ready` desde el navegador o un cliente HTTP. Un
probe live exitoso no implica que ready también deba estarlo.

## Estructura

```text
apps/
  api/             API NestJS y validación tipada de entorno
  mobile/          Expo Router: Android y web/PWA
packages/
  config/          configuración compartida de TypeScript y herramientas
  contracts/       contratos y esquemas compartidos
  domain-types/    tipos puros de dominio
docs/
  adr/             decisiones de arquitectura aceptadas
  system-design.md reglas de producto y dominio
design/
  nido-v0.3/       referencia visual canónica, no código de producción
```

## Alcance de M0

M0 valida la foundation y un shell mínimo con Inicio, Movimientos,
Presupuesto, Fijos y Más. No incluye autenticación, hogares, esquema financiero,
CRUD de movimientos, dashboard, presupuestos funcionales, recurrencias,
sincronización offline, notificaciones, importación, informes ni despliegue.
Los ADRs fijan contratos para milestones posteriores; no significan que esas
funcionalidades ya estén implementadas.

Las reglas de dominio provienen de `docs/system-design.md`. La única fuente
visual vigente es la sección estructural `t3` de Nido v0.3, documentada en
`design/nido-v0.3/README.md`. Las etiquetas y referencias de origen v0.1 o
v0.2 que permanecen dentro del HTML generado son metadatos históricos y no se
usan como referencia de implementación.

## Smoke visual manual

Después de `pnpm build:web`, serví el export estático:

```sh
pnpm --filter @nido/mobile exec expo serve --port 4191
```

Abrí `http://localhost:4191` y verificá Inicio, Movimientos, Presupuesto, Fijos
y Más. En el modo responsive del navegador repetí el recorrido a 360×800,
390×844 y 412×915: no debe haber pantalla en blanco, clipping ni contenido
bajo las safe areas; el bottom navigation debe permanecer visible, con ícono,
label y pill activa. Confirmá Bricolage Grotesque/IBM Plex Sans o un fallback
legible, los colores principales `#1C4F47`, `#B4632F` y `#F6F4EF`, y cero
errores en consola.

Los siguientes recursos deben responder correctamente:

- `http://localhost:4191/manifest.webmanifest`;
- `http://localhost:4191/icon-192.png`;
- `http://localhost:4191/icon-512.png`;
- `http://localhost:4191/icon.svg`.

Decisiones aceptadas:

- [ADR 0001 — Representación de dinero](docs/adr/0001-representacion-de-dinero.md)
- [ADR 0002 — Aislamiento por household_id](docs/adr/0002-aislamiento-por-household-id.md)
- [ADR 0003 — Idempotencia de movimientos offline](docs/adr/0003-idempotencia-de-movimientos-offline.md)
- [ADR 0004 — Infraestructura de costo fijo USD 0](docs/adr/0004-infraestructura-de-costo-fijo-usd-0.md)

## Troubleshooting

- **Versión incorrecta:** comprobá que Node sea 24.x y pnpm 11.x; Corepack debe
  respetar la versión declarada por el repositorio.
- **Corepack no puede crear los shims globales:** usá `corepack pnpm <comando>`
  o una instalación de Node administrada por tu usuario; no hace falta cambiar
  manifests ni instalar pnpm dentro del proyecto.
- **Falla `--frozen-lockfile`:** el lockfile y los manifests no coinciden. No
  omitas el flag en CI; actualizá el lockfile de forma intencional junto con el
  cambio de dependencias.
- **Docker no conecta o no queda healthy:** iniciá el daemon, ejecutá
  `pnpm compose:config`, revisá que el puerto configurado no esté ocupado y
  consultá `docker compose logs postgres`. `pnpm compose:up` falla después de
  60 segundos si PostgreSQL no llega a estar listo.
- **La API no inicia:** compará `apps/api/.env` con el ejemplo; la validación de
  entorno falla antes de escuchar si falta una variable o su formato es
  inválido.
- **Expo no encuentra Android:** abrí el emulador o conectá el dispositivo,
  verificá el Android SDK y `adb`, y ejecutá `pnpm doctor:mobile`.
- **Puerto ocupado:** cambiá el valor local documentado por
  `apps/api/.env.example` y reiniciá el proceso de desarrollo.
