# Verificación manual de M1 en otra PC

Este runbook reproduce M1 desde un checkout limpio y valida el flujo real de Google/Firebase,
PostgreSQL, API, web/PWA y, opcionalmente, Android. Las pruebas automatizadas usan una identidad
sustituta y valores públicos ficticios; no reemplazan esta verificación.

## Resultado esperado

Al terminar debe quedar demostrado, sobre un commit identificado, que:

- una cuenta Google puede iniciar sesión y crear un hogar como `OWNER`;
- solo el email invitado puede aceptar el token y quedar como `MEMBER`;
- la invitación vence, es de un solo uso y no se recupera desde la aplicación;
- cerrar sesión elimina de la interfaz los datos del hogar anterior;
- los probes de la API y las validaciones automatizadas seleccionadas pasan.

M1 no incluye email delivery, deploy, datos financieros ni un APK/AAB firmado.

## 1. Checkout inmutable

La publicación debe comunicar el SHA exacto que se quiere verificar. En la otra PC:

```sh
git clone git@github.com:kedavema/nido.git
cd nido
git fetch origin agent/m1-auth-households
git switch --detach origin/agent/m1-auth-households
git rev-parse HEAD
git status --short
```

Compará `git rev-parse HEAD` con el SHA comunicado. `git status --short` debe quedar vacío antes de
crear los archivos locales de entorno. El checkout separado evita que un cambio posterior de la rama
altere silenciosamente la revisión en curso.

## 2. Prerrequisitos

- Git con acceso al repositorio.
- Node.js `24.16.0` y pnpm `11.13.1` mediante Corepack.
- Docker Engine y Docker Compose v2.
- Un navegador moderno.
- Un proyecto Firebase propio y dos cuentas Google distintas: A (`OWNER`) y B (`MEMBER`). Una tercera
  cuenta C permite probar el rechazo por email incorrecto.
- Para Android: JDK 17, Android SDK/Platform Tools, `adb` y un emulador con Google Play. Expo Go no es
  compatible con el módulo nativo de inicio de sesión.

Verificá las versiones base:

```sh
node --version
corepack pnpm --version
docker --version
docker compose version
```

## 3. Archivos locales y secretos

Creá los archivos ignorados a partir de los ejemplos:

```sh
corepack enable
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
pnpm db:generate
pnpm build
```

En un clon limpio, `pnpm db:generate` materializa el cliente Prisma y `pnpm build` construye
`@nido/domain-types` y `@nido/contracts` antes de sus consumidores. No inicies `pnpm dev:api` hasta
que ambos comandos terminen correctamente. La sección 6 vuelve a ejecutar el build como gate de la
verificación completa.

Nunca copies, publiques ni incluyas en capturas o logs:

- `apps/api/.env`, `apps/mobile/.env` u otro `.env` local;
- el JSON de cuenta de servicio o una clave privada de Firebase Admin;
- Firebase ID Tokens o encabezados `Authorization`;
- tokens de invitación o URLs que contengan `/v1/invites/:token/accept`;
- credenciales de las cuentas Google;
- `google-services.json`, `GoogleService-Info.plist`, keystores o contraseñas de firma.

Las variables `EXPO_PUBLIC_*`, el Web OAuth client ID y el SHA-1 identifican clientes públicos, pero
nunca deben contener credenciales Admin. Guardá el JSON de la cuenta de servicio fuera del
repositorio, por ejemplo en `$HOME/.config/nido/firebase-admin.json`.

## 4. Configurar Firebase

En Firebase Console:

1. Creá o elegí un proyecto y habilitá **Authentication > Sign-in method > Google**.
2. Registrá una app web. En **Authentication > Settings > Authorized domains**, agregá `localhost`.
3. Copiá la configuración pública de esa app a `apps/mobile/.env`:
   `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`,
   `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID` y
   `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`.
4. Configurá `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` con el **Web OAuth client ID**, no con el client ID
   Android.
5. Registrá una app Android con el package exacto `com.nido.mobile` y agregá el SHA-1 del certificado
   debug de esta PC. Cada keystore puede producir un SHA-1 diferente.
6. Generá una cuenta de servicio solo para desarrollo. En `apps/api/.env`, usá el mismo proyecto en
   `FIREBASE_PROJECT_ID` y una ruta absoluta externa en `GOOGLE_APPLICATION_CREDENTIALS`.

El proyecto nativo generado guarda su keystore debug en
`apps/mobile/android/app/debug.keystore`. Si todavía no existe, ejecutá una vez desde la raíz:

```sh
pnpm --filter @nido/mobile exec expo run:android
```

Después, siempre desde la raíz, obtené su SHA-1 con:

```sh
keytool -list -v -alias androiddebugkey \
  -keystore apps/mobile/android/app/debug.keystore \
  -storepass android -keypass android
```

Registrá ese SHA-1 y volvé a construir antes de validar el login. No uses
`$HOME/.android/debug.keystore`: no es el certificado con el que este proyecto firma su development
build generado.

Valores relevantes de `apps/api/.env`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://nido:nido@localhost:5432/nido
FIREBASE_PROJECT_ID=el-mismo-project-id-del-cliente
GOOGLE_APPLICATION_CREDENTIALS=/ruta/absoluta/fuera/del/repositorio/firebase-admin.json
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
```

Para el flujo web de desarrollo, conservá `EXPO_PUBLIC_API_URL=http://localhost:3000`. Reiniciá Expo
después de cambiar cualquier variable `EXPO_PUBLIC_*`.

## 5. Base de datos y migración

El flujo M1-02 presupone que A todavía no pertenece a un hogar. En una PC nueva el volumen comienza
vacío. Si esta instalación ya contiene datos, usá cuentas de prueba nuevas o, solo después de confirmar
que no necesitás conservar nada, eliminá explícitamente el volumen local antes de continuar:

```sh
docker compose down --volumes
```

Desde la raíz:

```sh
pnpm compose:config
pnpm compose:up
pnpm db:migrate:deploy
pnpm db:migrate:status
```

El estado debe indicar que la base está actualizada con las migraciones versionadas. No uses
`db:migrate:dev` para reparar una base compartida o publicada.

## 6. Verificación automatizada

Antes del flujo real, ejecutá:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:web
pnpm build:android
pnpm config:mobile
pnpm doctor:mobile
```

### Excepción temporal conocida de Expo Doctor

En el candidato publicado el 17 de julio de 2026, `pnpm doctor:mobile` completa 19 de 20
comprobaciones y termina con código 1 porque Expo empezó a exigir cuatro patches publicados ese mismo
día:

| Paquete           | Fijado en el candidato | Requerido por Doctor |
| ----------------- | ---------------------- | -------------------- |
| `expo`            | `57.0.6`               | `~57.0.7`            |
| `expo-constants`  | `57.0.5`               | `~57.0.6`            |
| `expo-dev-client` | `57.0.6`               | `~57.0.7`            |
| `expo-router`     | `57.0.6`               | `~57.0.7`            |

El repositorio exige una antigüedad mínima de 24 horas para dependencias nuevas, por lo que no se
omitió esa protección para incorporarlas de inmediato. Conservá el checkout y el lockfile inmutables,
guardá esta salida como excepción conocida y continuá la matriz manual: los exports web y Android sí
deben pasar. Este candidato sirve para verificación manual, pero M1 no puede declararse terminado hasta
que un commit posterior incorpore los patches una vez cumplida la ventana y `pnpm doctor:mobile` pase.

Para la suite PostgreSQL, creá una base descartable la primera vez:

```sh
docker compose exec postgres createdb --username=nido nido_test
TEST_DATABASE_URL=postgresql://nido:nido@localhost:5432/nido_test pnpm test:integration
```

Si `nido_test` ya existe, omití `createdb`. Nunca apuntes `TEST_DATABASE_URL` a una base con datos que
quieras conservar: la suite trunca sus tablas y rechaza nombres que no terminen en `_test` o `_ci`.

## 7. Iniciar API y cliente web

En una terminal:

```sh
unset FIREBASE_AUTH_EMULATOR_HOST
pnpm dev:api
```

En otra terminal, confirmá ambos probes:

```sh
curl -fsS http://localhost:3000/health/live
curl -fsS http://localhost:3000/health/ready
curl -i http://localhost:3000/v1/me
```

Ambos deben responder `{"status":"ok"}`. `live` solo prueba el proceso; `ready` también verifica
PostgreSQL, la migración M1 y sus tablas requeridas. La llamada a `/v1/me` sin `Authorization` debe
responder `401`, no datos de usuario.

Como comprobación opcional de degradación, detené PostgreSQL mientras la API sigue activa: `live`
debe continuar en `200` y `ready` debe pasar a `503`. Ejecutá `pnpm compose:up` y confirmá que `ready`
vuelve a `200` antes de continuar.

Iniciá Expo en una tercera terminal:

```sh
pnpm dev:mobile
```

Presioná `w` para abrir web. La URL habitual es `http://localhost:8081`, incluida en
`CORS_ORIGINS`. Usá perfiles de navegador separados o una ventana privada para mantener las sesiones
de A, B y C aisladas.

## 8. Matriz del flujo real

No pongas el token de invitación en el nombre de una captura, issue, log o informe. Marcá cada caso
como aprobado o fallido y anotá solo el comportamiento observado.

| Caso  | Acción                                                                  | Resultado esperado                                                                            |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| M1-01 | Abrir Nido sin sesión                                                   | Se muestra **Continuar con Google** y ningún dato de hogar.                                   |
| M1-02 | Iniciar con A y crear un hogar                                          | A entra a las pestañas; en **Más** figura como **Propietario/a**, `OWNER` activo.             |
| M1-03 | A invita el email exacto de B                                           | Se muestra un token de 43 caracteres una sola vez y un vencimiento de 72 horas.               |
| M1-04 | Salir de **Más** y volver                                               | El token anterior ya no aparece ni puede recuperarse desde la aplicación.                     |
| M1-05 | Crear otra invitación para B e intentar aceptarla con C                 | La operación falla por identidad/email y la invitación no queda consumida.                    |
| M1-06 | Iniciar con B, ingresar el mismo token y aceptarlo                      | B entra al hogar como **Integrante**, `MEMBER` activo.                                        |
| M1-07 | Abrir **Más** con A y con B                                             | Ambos ven a A como Propietario/a y a B como Integrante; solo A ve el formulario para invitar. |
| M1-08 | Intentar reutilizar el token consumido desde una cuenta sin hogar       | La aceptación falla y no crea otra membresía.                                                 |
| M1-09 | Con red lenta/falla inyectada, cerrar sesión durante una reconciliación | Se vuelve al login y una respuesta tardía no restaura datos ni sesión del usuario anterior.   |
| M1-10 | Recargar la web con una sesión válida                                   | La sesión se restaura y vuelve al hogar correcto; al cerrar sesión deja de hacerlo.           |

Las pruebas automatizadas cubren además expiración, concurrencia de aceptación, hashing del token y
denegación entre hogares. No es necesario manipular directamente la base para repetirlas.

M1-09 es una prueba adversarial: no la marques como aprobada si no lograste solapar realmente la
reconciliación y el cierre de sesión (por ejemplo, con throttling o fault injection). La protección
contra aplicar una respuesta a otra identidad también tiene cobertura automatizada.

## 9. Android opcional

El emulador es la ruta local más reproducible. Con el dispositivo conectado:

```sh
adb devices
adb reverse tcp:3000 tcp:3000
pnpm --filter @nido/mobile exec expo run:android
```

Con `adb reverse`, conservá `EXPO_PUBLIC_API_URL=http://localhost:3000`. Como alternativa, un emulador
Android estándar puede usar `http://10.0.2.2:3000`. Un dispositivo físico sin reverse necesita una URL
HTTPS alcanzable desde el dispositivo; el cliente rechaza HTTP remoto.

Repetí al menos M1-01, M1-02, M1-07, M1-09 y M1-10. Si Google muestra `DEVELOPER_ERROR`, revisá el
package `com.nido.mobile`, el SHA-1 de esta PC, el Web OAuth client ID y reconstruí el development
build. No pruebes este flujo con Expo Go.

## 10. Smoke visual y PWA

Para revisar el export estático, agregá temporalmente `http://localhost:4191` a `CORS_ORIGINS`,
reiniciá la API y ejecutá:

```sh
pnpm build:web
pnpm --filter @nido/mobile exec expo serve --port 4191
```

Recorré login, onboarding, invitación, Inicio, Movimientos, Presupuesto, Fijos y Más a 360×800,
390×844 y 412×915. No debe haber pantalla en blanco, clipping, contenido bajo safe areas ni errores
de consola. Confirmá que respondan:

- `http://localhost:4191/manifest.webmanifest`;
- `http://localhost:4191/icon-192.png`;
- `http://localhost:4191/icon-512.png`;
- `http://localhost:4191/icon.svg`.

## 11. Evidencia sin datos sensibles

Registrá fuera del repositorio o en un canal privado:

```text
Fecha y zona horaria:
Commit SHA verificado:
Sistema operativo:
Node / pnpm:
Docker / Compose:
Navegador y versión:
Android (emulador/dispositivo y API), si aplica:
Checks automatizados ejecutados:
M1-01 ... M1-10: aprobado/fallido + observación sin secretos
Incidencias:
```

Las capturas deben ocultar emails si no son cuentas de prueba y siempre ocultar tokens de invitación,
ID Tokens y rutas que los contengan.

## 12. Limpieza

Detené los procesos de desarrollo y luego PostgreSQL:

```sh
pnpm compose:down
```

El volumen conserva la base local. Para borrar datos se requiere una acción explícita adicional; no
uses `docker compose down --volumes` salvo que realmente quieras eliminarla.
