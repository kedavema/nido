/**
 * Where the API lives, resolved per platform.
 *
 * Native default: the absolute URL configured at build time, and nothing else. An APK is a
 * versioned artifact — it is rebuilt to point at a different backend anyway — so there is no
 * runtime origin to fall back to and no reason to invent one. Returning `undefined` when the
 * variable is missing lets `parsePublicEnvironment` fail with its usual "apiUrl" field error
 * rather than producing a second, differently-shaped failure here.
 *
 * The web implementation lives in `api-url.web.ts`, selected by the bundler through the file
 * extension — the same platform split used by `summary-cache` and `sync-store`.
 */
export function resolveApiUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  return configured === '' ? undefined : configured;
}
