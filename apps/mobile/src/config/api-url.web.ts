/**
 * Path the Cloudflare Pages Function proxies to the API. Must match the function's own location,
 * `functions/api/[[path]].ts`.
 */
export const SAME_ORIGIN_API_PATH = '/api';

/**
 * Where the API lives on web.
 *
 * Defaults to this page's own origin, because `EXPO_PUBLIC_*` is inlined at Metro transform time
 * rather than read at runtime: baking an absolute API URL into the bundle marries the build to one
 * backend, so moving the API means rebuilding and redeploying the whole PWA. Serving the API under
 * the same origin removes the URL from the bundle entirely — the deployment decides where `/api`
 * points, and a same-origin request is not cross-origin, so CORS stops being something to maintain.
 *
 * `EXPO_PUBLIC_API_URL` still wins when it is set. That is the local-development path, where the
 * Expo dev server and the API are two different ports with no proxy between them.
 */
export function resolveApiUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured !== undefined && configured !== '') {
    return configured;
  }

  // Guarded rather than assumed: this module is web-only, but `expo export` also renders these
  // routes to static HTML in Node, where there is no `window` to read an origin from. Falling
  // through to `undefined` there surfaces the normal missing-configuration error instead of a
  // ReferenceError during the build.
  if (typeof window === 'undefined') {
    return configured;
  }

  return `${window.location.origin}${SAME_ORIGIN_API_PATH}`;
}
