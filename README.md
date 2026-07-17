# Nido

Nido es una aplicación de control de gastos compartidos para un hogar. El repositorio contiene la
base de M1: monorepo pnpm/Turborepo, cliente Expo Router para Android y web/PWA, API modular NestJS,
autenticación Google/Firebase, persistencia Prisma/PostgreSQL y hogares multi-tenant con invitaciones.

M1 permite que una persona autenticada cree un hogar, quede como `OWNER`, invite por email a una
segunda persona y que esta acepte una invitación de un solo uso. No incluye todavía catálogo ni
operaciones financieras.

## Requisitos

- Node.js 24.x.
- pnpm 11.x mediante Corepack.
- Docker Engine con Docker Compose para PostgreSQL local y las pruebas de integración.
- Para Android: Android Studio, JDK 17, Android SDK/Platform Tools, un emulador o dispositivo y `adb`.
- Un proyecto Firebase propio para verificar manualmente el login real en web y Android.
- Un navegador moderno para web/PWA.

## Arquitectura de M1

El cliente obtiene un Firebase ID Token mediante Google y lo envía como `Authorization: Bearer`.
La API verifica el token con Firebase Admin, resuelve o crea el usuario local y recién entonces
autoriza el acceso al hogar. Prisma queda encapsulado en infraestructura; los controladores y el
cliente no exponen entidades Prisma.

PostgreSQL es la fuente de verdad para `users`, `households`, `household_members` y
`household_invites`. Los repositorios de hogar reciben el actor y `household_id`, comprueban una
membresía `ACTIVE` y filtran el tenant en la consulta. Conocer un UUID de otro hogar no concede
acceso.

## Preparación local

Desde la raíz del repositorio:

```sh
corepack enable
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
pnpm db:generate
pnpm build
pnpm compose:config
pnpm compose:up
pnpm db:migrate:deploy
pnpm db:migrate:status
```

El `.env.example` de la raíz documenta únicamente el override opcional `POSTGRES_PORT` de Compose.
`apps/api/.env` contiene configuración de la API y `apps/mobile/.env` solo configuración pública que
Expo incorpora al bundle. Los archivos locales se ignoran; los ejemplos sí se versionan.
La API exige `NODE_ENV` de forma explícita. Si falta `DATABASE_URL`, Prisma usa una URL centinela no
enrutable solo para permitir codegen; cualquier comando que acceda a datos falla sin seleccionar una
base real por defecto. En un clon limpio no omitas `pnpm db:generate` ni `pnpm build`: el primero
genera el cliente Prisma y el segundo construye, en orden de dependencias, `@nido/domain-types` y
`@nido/contracts` antes de compilar o iniciar consumidores como la API.

### PostgreSQL, Prisma y migraciones

- `pnpm db:generate` regenera el cliente Prisma tipado después de cambiar el schema.
- `pnpm db:migrate:dev` crea y aplica una migración durante desarrollo de schema. No se usa en CI ni
  en producción.
- `pnpm db:migrate:deploy` aplica únicamente las migraciones versionadas y sirve para una base limpia,
  CI y entornos publicados.
- `pnpm db:migrate:status` compara la base configurada por `DATABASE_URL` con las migraciones.

Las pruebas de integración truncan sus tablas antes de cada caso. Usá una base exclusiva, nunca una
base con datos que quieras conservar. Como defensa adicional, la suite rechaza nombres que no terminen
en `_test` o `_ci`. Para crearla una vez dentro del Compose local:

```sh
docker compose exec postgres createdb --username=nido nido_test
TEST_DATABASE_URL=postgresql://nido:nido@localhost:5432/nido_test pnpm test:integration
```

Si `nido_test` ya existe, omití el primer comando. El setup de integración aplica las migraciones
versionadas a `TEST_DATABASE_URL` antes de ejecutar los casos.

## Configuración manual de Firebase

Los placeholders del repositorio y CI no autentican usuarios reales. Para probar Google/Firebase hay
que configurar un proyecto propio:

1. En Firebase Console, creá o elegí un proyecto y habilitá **Authentication > Sign-in method >
   Google**. Configurá el email de soporte solicitado por Firebase.
2. Registrá una app web. Copiá `apiKey`, `authDomain`, `projectId`, `appId` y `messagingSenderId` a las
   variables correspondientes de `apps/mobile/.env`.
3. En **Authentication > Settings > Authorized domains**, agregá `localhost` y cada dominio real de
   la PWA. No asumas que `localhost` fue agregado automáticamente.
4. Registrá una app Android con el package exacto `com.nido.mobile`. Agregá el SHA-1 de cada
   certificado aplicable: debug local, release y Play App Signing cuando existan. Para el keystore
   debug generado por este proyecto, ejecutá primero un development build si todavía no existe
   `apps/mobile/android/app/debug.keystore`. Después, desde la raíz del repositorio, inspeccionalo con:

   ```sh
   keytool -list -v -alias androiddebugkey \
     -keystore apps/mobile/android/app/debug.keystore \
     -storepass android -keypass android
   ```

5. Copiá a `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` el **Web OAuth client ID** del proyecto, no el client ID
   Android. El OAuth client Android se asocia por package y SHA-1 en Google/Firebase Console.
6. Para Firebase Admin, generá una cuenta de servicio solo para desarrollo, guardá el JSON fuera del
   repositorio y exponelo como Application Default Credentials antes de iniciar la API:

   ```sh
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/nido/firebase-admin.json"
   pnpm dev:api
   ```

   `FIREBASE_PROJECT_ID` en `apps/api/.env` debe identificar el mismo proyecto. El SDK Admin lee
   `GOOGLE_APPLICATION_CREDENTIALS`; el JSON no se copia a `apps/api`, no se transforma en una
   variable `EXPO_PUBLIC_*` y nunca se versiona.

7. El login Android usa un módulo nativo y no funciona dentro de Expo Go. Creá o actualizá un
   development build después de registrar package/SHA-1 o cambiar plugins:

   ```sh
   pnpm --filter @nido/mobile exec expo run:android
   ```

Para web, `EXPO_PUBLIC_API_URL=http://localhost:3000` llega a la API local. En el emulador Android usá
`http://10.0.2.2:3000`, o ejecutá `adb reverse tcp:3000 tcp:3000` y conservá `localhost`. Un dispositivo
físico necesita una URL HTTPS accesible desde el dispositivo; el cliente rechaza HTTP fuera de los
hosts locales de desarrollo. Reiniciá Metro después de cambiar `apps/mobile/.env`.

Todas las variables `EXPO_PUBLIC_*` son visibles en el bundle y deben contener solo identificadores y
configuración pública de Firebase/OAuth. Nunca incluyas claves privadas, cuentas de servicio ni
tokens.

## Comandos oficiales

Todos se ejecutan desde la raíz:

| Objetivo                         | Comando                          |
| -------------------------------- | -------------------------------- |
| Instalación reproducible         | `pnpm install --frozen-lockfile` |
| Lint                             | `pnpm lint`                      |
| Verificar formato                | `pnpm format:check`              |
| Verificar tipos                  | `pnpm typecheck`                 |
| Pruebas unitarias y E2E aisladas | `pnpm test`                      |
| Pruebas PostgreSQL               | `pnpm test:integration`          |
| Generar cliente Prisma           | `pnpm db:generate`               |
| Crear migración de desarrollo    | `pnpm db:migrate:dev`            |
| Aplicar migraciones versionadas  | `pnpm db:migrate:deploy`         |
| Verificar estado de migraciones  | `pnpm db:migrate:status`         |
| Build del monorepo               | `pnpm build`                     |
| Export web/PWA                   | `pnpm build:web`                 |
| Export Android                   | `pnpm build:android`             |
| API en desarrollo                | `pnpm dev:api`                   |
| Expo en desarrollo               | `pnpm dev:mobile`                |
| Configuración Expo               | `pnpm config:mobile`             |
| Diagnóstico Expo                 | `pnpm doctor:mobile`             |
| Validar Docker Compose           | `pnpm compose:config`            |
| Levantar PostgreSQL              | `pnpm compose:up`                |
| Detener PostgreSQL               | `pnpm compose:down`              |

`pnpm build:web` genera el artefacto estático web/PWA y `pnpm build:android` verifica el bundle
Android; no producen un APK/AAB firmado. El development build nativo de la sección Firebase es el que
permite probar Google Sign-In en Android.

## API de identidad y hogar

Las rutas de negocio usan `/v1` y requieren un Firebase ID Token válido:

| Método | Ruta                                  | Autorización                       |
| ------ | ------------------------------------- | ---------------------------------- |
| `GET`  | `/v1/me`                              | Usuario autenticado                |
| `POST` | `/v1/households`                      | Usuario autenticado; crea OWNER    |
| `GET`  | `/v1/households/:householdId`         | OWNER o MEMBER activo del hogar    |
| `GET`  | `/v1/households/:householdId/members` | OWNER o MEMBER activo del hogar    |
| `POST` | `/v1/households/:householdId/invites` | OWNER activo                       |
| `POST` | `/v1/invites/:token/accept`           | Email autenticado de la invitación |

La API no acepta como autoridad IDs de usuario, emails, roles o membresías enviados por el cliente.
Los accesos entre hogares se ocultan como recurso no disponible.
Los tokens inválidos, vencidos, revocados o de usuarios deshabilitados reciben `401`; una degradación
de Firebase/credenciales se distingue como `503` para permitir reintento sin culpar al usuario.

### Invitaciones

Una invitación se asocia al email normalizado, vence a las 72 horas y solo puede consumirse una vez.
La aceptación reclama la invitación y crea la membresía en una transacción; la base persiste
únicamente el hash SHA-256 del token.

M1 todavía no envía emails. `POST /v1/households/:householdId/invites` devuelve el token en texto
plano una sola vez, en esa respuesta, para que el `OWNER` lo comparta por un canal externo. La API no
puede recuperarlo después y el cliente lo descarta al salir o crear otra invitación. Esta excepción es
solo el transporte manual del MVP, no almacenamiento en texto plano.

El contrato M1 coloca el token en la ruta de aceptación. Antes de publicar la API detrás de un proxy,
gateway o APM, hay que redactar el segmento de `/v1/invites/*/accept` en todo access log y configurar
correctamente el proxy confiable para el rate limit. M1 no incluye deploy ni habilita request logging.

## Flujo manual de dos usuarios

Esta verificación requiere credenciales Firebase reales y no forma parte de los tests automatizados:

Para repetirla desde un clon limpio en otra PC, con checkout inmutable, Android y una plantilla de
evidencia, seguí el
[runbook de verificación manual de M1](docs/runbooks/m1-verificacion-manual-otra-pc.md).

1. Levantá PostgreSQL, aplicá migraciones, exportá `GOOGLE_APPLICATION_CREDENTIALS` e iniciá la API.
2. Completá `apps/mobile/.env` e iniciá web o el development build Android.
3. Con la cuenta Google A, iniciá sesión y creá un hogar. Debe aparecer como `OWNER`.
4. Desde **Más > Hogar y miembros**, invitá el email exacto de la cuenta Google B y copiá el token
   mostrado una sola vez.
5. Cerrá sesión. En otra sesión de navegador/dispositivo, iniciá con la cuenta B, pegá el token y
   aceptalo antes de 72 horas.
6. Volvé a **Hogar y miembros** y confirmá que A figura como `OWNER` y B como `MEMBER`. Reusar el token
   o aceptarlo desde otro email debe fallar.

No declares este flujo validado solo porque CI esté verde: CI sustituye el verificador de identidad en
tests y usa valores Firebase públicos ficticios; no llama a Google ni a Firebase.

## Salud de la API

Los probes quedan fuera del prefijo `/v1`:

- `GET /health/live` confirma que el proceso responde y no consulta dependencias externas.
- `GET /health/ready` comprueba PostgreSQL, la migración M1 terminada y sus cuatro relaciones con
  deadlines de conexión/consulta de cinco segundos. Devuelve `200` con `{"status":"ok"}` cuando la
  base está lista y `503` sin exponer el error interno cuando no lo está.

Con `PORT=3000`, las URLs locales son `http://localhost:3000/health/live` y
`http://localhost:3000/health/ready`. Un live exitoso no implica que ready también lo esté.

## Estructura

```text
apps/
  api/             NestJS, Firebase Admin, Prisma, migraciones y módulos auth/users/households
  mobile/          Expo Router, Firebase client y flujos mínimos de sesión/hogar/invitación
packages/
  config/          configuración compartida de TypeScript y herramientas
  contracts/       contratos y esquemas Zod compartidos
  domain-types/    tipos y constantes puras de dominio
docs/
  adr/             decisiones de arquitectura aceptadas
  runbooks/        procedimientos reproducibles de verificación manual
  system-design.md reglas de producto y dominio
design/
  nido-v0.3/       referencia visual canónica, no código de producción
```

## Alcance y límites de M1

M1 implementa exclusivamente autenticación Google/Firebase, usuario local, hogares, membresía
`OWNER|MEMBER`, invitación manual, aislamiento server-side y los estados mínimos del cliente:
cargando, no autenticado, autenticado, error, crear hogar y aceptar invitación.

El cliente limita a 15 segundos la operación completa de cada request, incluida la obtención del ID
Token y el cuerpo de respuesta. Si crear un hogar o aceptar una invitación pierde una respuesta de
red, hace lecturas acotadas de `/v1/me` y reconoce una membresía nueva antes de ofrecer un reintento;
un reintento de aceptación también reconcilia `404/409`. Esto evita duplicados comunes y recupera la
aceptación atómica sin volver reutilizable el token.

Quedan fuera email delivery, reenvío/cancelación de invitaciones, eliminación de hogares, expulsión de
miembros, cambio de roles, recuperación de tokens, selección avanzada entre múltiples hogares,
deploy y credenciales reales. Tampoco hay categorías, medios de pago, movimientos, presupuestos,
recurrencias, notificaciones, importaciones, informes, colas offline ni otra funcionalidad de M2 o
hitos posteriores.

Las reglas de dominio provienen de `docs/system-design.md`. La fuente visual vigente es la sección
estructural `t3` de Nido v0.3, documentada en `design/nido-v0.3/README.md`; el runtime generado de
`design/` no se copia a producción.

## Smoke visual manual

Después de configurar las variables públicas y ejecutar `pnpm build:web`, serví el export estático:

```sh
pnpm --filter @nido/mobile exec expo serve --port 4191
```

Agregá `http://localhost:4191` a `CORS_ORIGINS` y reiniciá la API antes de recorrer el export.

Abrí `http://localhost:4191` y recorré login, onboarding, invitación, Inicio, Movimientos,
Presupuesto, Fijos y Más a 360×800, 390×844 y 412×915. No debe haber pantalla en blanco, clipping,
contenido bajo safe areas ni errores de consola. Confirmá los recursos PWA:

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

- **Versión incorrecta:** comprobá Node 24.x y pnpm 11.x; Corepack debe respetar la versión fijada.
- **Falla `--frozen-lockfile`:** manifests y lockfile no coinciden. No omitas el flag en CI.
- **PostgreSQL no queda healthy:** iniciá Docker, revisá `POSTGRES_PORT` y consultá
  `docker compose logs postgres`.
- **Migración falla:** confirmá `DATABASE_URL`, ejecutá `pnpm db:migrate:status` y no uses
  `db:migrate:dev` para reparar una base compartida o publicada.
- **Integración se omite:** `pnpm test` no recibe `TEST_DATABASE_URL`; ejecutá el comando dedicado con
  una base de prueba exclusiva.
- **La API no inicia:** compará `apps/api/.env` con el ejemplo y comprobá que
  `GOOGLE_APPLICATION_CREDENTIALS` apunte a un JSON legible fuera del repositorio.
- **`ready` responde 503:** PostgreSQL no está accesible o no acepta la conexión de `DATABASE_URL`.
- **Popup web bloqueado o dominio no autorizado:** revisá el proveedor Google y Authorized domains
  en Firebase Authentication.
- **Android muestra error de Google/DEVELOPER_ERROR:** verificá package `com.nido.mobile`, SHA-1,
  Web OAuth client ID y reconstruí el development build. Expo Go no es compatible con este módulo.
- **Android no llega a la API:** usá `10.0.2.2`, `adb reverse` o una URL HTTPS alcanzable; el cliente
  rechaza HTTP remoto y solo admite HTTP para hosts locales explícitos.
- **Puerto ocupado:** cambiá el valor documentado y reiniciá API, Metro o Compose según corresponda.
