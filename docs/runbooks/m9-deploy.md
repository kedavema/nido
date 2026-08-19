# Runbook M9 — Primer deploy

Estado: primera ejecución pendiente. Este documento describe el alta desde cero de los tres
servicios de ADR 0004 (Neon, Render, Cloudflare Pages), el APK interno por EAS y el scheduler en
GitHub Actions.

Antes de empezar, la regla de ADR 0004 que gobierna todo lo demás: **no se adjunta método de pago a
ninguna cuenta**, no se habilita auto-upgrade ni excedentes. Si un proveedor ya no cumple USD 0 sin
tarjeta, se reemplaza o se reduce la capacidad; no se deploya hasta recuperar un perfil cerrado de
costo cero.

## Orden

Las dependencias mandan el orden: la API necesita base y credenciales de Firebase, la PWA necesita
el origen de la API, y el APK necesita la URL absoluta de la API horneada en el bundle.

1. Neon → `DATABASE_URL`
2. Firebase y Google OAuth → credenciales de identidad
3. Generación de secretos locales → keyring, VAPID, HMAC
4. Render → origen de la API
5. Cloudflare Pages → dominio de la PWA
6. GitHub Actions → scheduler
7. EAS → APK

## 1. Neon

Crear proyecto, región la más cercana a la de Render (us-west / Oregon si se mantiene el default de
`render.yaml`). Copiar la cadena de conexión **pooled**, con `sslmode=require`.

El límite del free tier es 0,5 GB. Al alcanzarlo se rechazan escrituras nuevas — ADR 0004 lo acepta
como falla cerrada, no se activa un plan pago automáticamente.

## 2. Firebase y Google OAuth

En el proyecto de Firebase:

- Habilitar **Authentication → Google**.
- Agregar una **app web** y anotar `apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`.
  Van a las variables `EXPO_PUBLIC_FIREBASE_*`.
- Generar una **service account** (Project settings → Service accounts → Generate new private key).
  El JSON no se commitea: se sube a Render como secret file.

En Google Cloud → APIs & Services → Credentials, para el mismo proyecto:

- **OAuth client ID (Web)**: su client ID es `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Es el que consume el
  adapter nativo, no el de Android.
- **OAuth client ID (Android)**: package `com.nido.mobile`, con el SHA-1 de cada keystore que vaya a
  firmar la app. El de EAS todavía no existe en este punto; se agrega en el paso 7.

## 3. Secretos locales

```sh
# Keyring de credenciales push (AES-256-GCM, ADR 0012)
node -e "console.log('k1:' + require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"  # pepper
# Par VAPID
pnpm --filter @nido/api exec web-push generate-vapid-keys
# Secreto compartido con el scheduler (mínimo 32 caracteres)
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID` es el `keyId` del par generado arriba (`k1`).

Las tres del keyring son **opcionales como grupo**: las tres sin definir desactivan el registro de
dispositivos y la API arranca igual; algunas sí y otras no es un error de deploy y falla al
arrancar. Lo mismo para el trío VAPID. Ninguna puede llevar prefijo `EXPO_PUBLIC_`.

## 4. Render

New → Blueprint → seleccionar el repo. Render lee `render.yaml` y crea el web service `nido-api`.

Completar los valores marcados `sync: false`:

| Variable                                 | Valor                         |
| ---------------------------------------- | ----------------------------- |
| `DATABASE_URL`                           | cadena pooled de Neon         |
| `FIREBASE_PROJECT_ID`                    | id del proyecto Firebase      |
| `CORS_ORIGINS`                           | placeholder válido, ver abajo |
| `NOTIFICATION_CREDENTIAL_KEYS`           | `k1:<base64>`                 |
| `NOTIFICATION_CREDENTIAL_ACTIVE_KEY_ID`  | `k1`                          |
| `NOTIFICATION_CREDENTIAL_PEPPER`         | hex del paso 3                |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | par del paso 3                |
| `VAPID_SUBJECT`                          | `mailto:` propio              |
| `NOTIFICATIONS_JOB_HMAC_SECRET`          | hex del paso 3                |

`CORS_ORIGINS` no se conoce hasta el paso 5, pero **no puede quedar en blanco**: el schema le da un
default solo cuando la variable está ausente, y el dashboard la crea con string vacío, que se parte
en `['']`, falla la validación de URL y deja la API sin arrancar. Cargar `http://localhost:8081` como
placeholder y reemplazarlo en el paso 5.

Además, en **Secret Files**, subir el JSON de la service account con el path
`/etc/secrets/firebase-service-account.json`, que es lo que `render.yaml` ya declara en
`GOOGLE_APPLICATION_CREDENTIALS`. **El nombre del archivo tiene que ser exactamente ese**: Render lo
monta en `/etc/secrets/<nombre>`, así que cualquier otro nombre deja a firebase-admin sin
credenciales. El síntoma es engañoso — la API arranca, `/health/ready` da 200 y un token malformado
sigue devolviendo 401, porque un JWT roto se rechaza localmente sin tocar la credencial. Recién falla
con un token real: `verifyIdToken(token, true)` pide `checkRevoked` y eso exige una consulta
autenticada, que termina en 503 y en el mensaje "Nido no pudo conectarse con el servicio".

`TRUSTED_PROXY_HOPS=1` ya viene fijado en el blueprint: Render termina TLS en su router y reenvía un
salto. Subirlo por encima del conteo real permitiría a un cliente falsificar `X-Forwarded-For` y
elegir su propio bucket de rate limit.

El build aplica las migraciones (`pnpm db:migrate:deploy`) porque el hook de pre-deploy es una
función paga. Verificar que `/health/ready` responda 200 antes de seguir: chequea conexión y
migración aplicada, así que un deploy contra una base sin migrar se detecta acá.

La instancia free duerme tras inactividad y tarda cerca de un minuto en despertar. El cliente ya lo
tolera (commit 6e9764f).

## 5. Cloudflare Pages

Crear el proyecto conectando el repo, con:

- **Root directory**: `apps/mobile` — así Pages encuentra `functions/` y publica la función proxy.
- **Build command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm build:web`
- **Build output directory**: `dist`

Variables de **build**: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`,
`EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, más
`NODE_VERSION=24.16.0`.

**`EXPO_PUBLIC_API_URL` se deja sin definir en Pages.** Es deliberado: sin ella el cliente web
resuelve la API contra su propio origen y pega a `/api`, que es la función proxy. Definirla hornea
una URL absoluta en el bundle y reintroduce CORS.

Variable de **runtime** (Settings → Functions): `API_ORIGIN` con el origen de Render, sin barra
final. Si falta, la función responde 503 con un mensaje explícito en lugar de caer al sitio
estático.

Con el dominio ya asignado quedan dos cosas por cerrar hacia atrás:

- **Render**: completar `CORS_ORIGINS` con el dominio de Pages.
- **Firebase → Authentication → Settings → Authorized domains**: agregar ese mismo dominio. Firebase
  rechaza el sign-in desde un dominio que no esté en esa lista, así que sin este paso el login web
  falla con `auth/unauthorized-domain` aunque todo lo demás esté bien. El dominio no se conoce hasta
  crear el proyecto de Pages, por eso el paso vive acá y no en la sección 2.

## 6. GitHub Actions

Repo → Settings → Secrets and variables → Actions:

| Secret                               | Valor                             |
| ------------------------------------ | --------------------------------- |
| `NIDO_API_ORIGIN`                    | origen de Render, sin barra final |
| `NIDO_NOTIFICATIONS_JOB_HMAC_SECRET` | el mismo hex cargado en Render    |

El workflow `due-notifications.yml` corre a las 11:00 UTC (08:00 en America/Asuncion). Dispararlo a
mano una vez con **Run workflow** para verificar. Un 401 significa secreto distinto entre Render y
GitHub, o desfase de reloj mayor a 300s; el workflow corta sin reintentar en ese caso, porque
reintentar solo quema nonces.

Apuntar directo a Render, no a Pages: el endpoint del job no pasa por el proxy.

## 7. EAS y APK

Las `EXPO_PUBLIC_*` se hornean en tiempo de build, así que van como secrets de EAS. Acá
`EXPO_PUBLIC_API_URL` **sí** se define, con la URL absoluta de Render: un APK es un artefacto
versionado y no tiene un origen propio del cual deducirla.

```sh
cd apps/mobile
eas login
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://<render>.onrender.com
# ...ídem para cada EXPO_PUBLIC_FIREBASE_* y EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
eas build --profile preview --platform android
```

El perfil `preview` produce un APK de distribución interna. La primera corrida genera un keystore;
con `eas credentials` se obtiene su SHA-1, que hay que registrar en el OAuth client de Android del
paso 2 — sin eso el login de Google falla solo en el APK, no en la PWA.

`react-native-nitro-google-signin` es código nativo: Expo Go no sirve, y cualquier cambio de
dependencias nativas obliga a rebuild.

## Verificación

| Qué                 | Cómo                                                              |
| ------------------- | ----------------------------------------------------------------- |
| API viva            | `curl https://<render>/health/live`                               |
| API lista y migrada | `curl https://<render>/health/ready`                              |
| Proxy de Pages      | `curl https://<pages>/api/health/live` (mismo cuerpo que directo) |
| PWA instalable      | Chrome DevTools → Application → Manifest, sin errores             |
| Shell offline       | DevTools → Network → Offline, recargar; la app abre               |
| Scheduler           | Run workflow manual, esperar 200 con contadores en el log         |
| Login web           | Google Sign-In completo contra el proyecto real                   |
| Login Android       | Ídem en el APK, con SHA-1 registrado                              |

## Fuera de alcance de este deploy

- **Push de punta a punta.** Servidor, cron y adapters están; falta la pantalla MAS-05 y, para
  Android, la dependencia `expo-notifications`. Sin ellas nadie registra un dispositivo, así que las
  deliveries encoladas fallan como `PERMANENT` por falta de instalación activa. T-700 sigue abierta.
- **M8, importación CSV/XLSX.** No implementada.
- **Email de invitación (#19).** Diferido por ADR 0012; la entrega del token sigue siendo manual.
- **Backups.** El free tier no alcanza para uso comercial (ADR 0004).
