/**
 * Cloudflare Pages Function: proxies `/api/*` to the API service.
 *
 * This exists so the PWA never carries an API URL. `EXPO_PUBLIC_*` is inlined at Metro transform
 * time, so an absolute URL in the bundle would marry each build to one backend and make moving the
 * API a full rebuild and redeploy. Here the destination is `API_ORIGIN`, a Pages environment
 * variable, so it changes from the dashboard without touching the deployed bundle.
 *
 * The second benefit is CORS: the browser is talking to its own origin, so there is no preflight
 * and no allowlist to keep in sync with the API.
 *
 * Not routed through here: the HMAC-guarded internal job endpoint, which GitHub Actions calls
 * directly against the API.
 */

interface Environment {
  /** Absolute origin of the API service, e.g. `https://nido-api.onrender.com`. No trailing slash. */
  readonly API_ORIGIN?: string;
}

interface ProxyContext {
  readonly request: Request;
  readonly env: Environment;
  readonly params: { readonly path?: readonly string[] | string };
}

/** `[[path]]` yields an array for `/api/a/b`, a string for `/api/a`, and nothing for `/api`. */
function segmentsOf(path: ProxyContext['params']['path']): readonly string[] {
  if (path === undefined) return [];
  return typeof path === 'string' ? [path] : path;
}

export function onRequest({ request, env, params }: ProxyContext): Response | Promise<Response> {
  const origin = env.API_ORIGIN;
  if (origin === undefined || origin === '') {
    // Deliberately explicit. A misconfigured deployment that silently 404s through to the static
    // site would surface as a JSON parse error three layers away, in the app's error handling.
    return new Response('API_ORIGIN is not configured for this deployment.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const incoming = new URL(request.url);
  const target = new URL(origin);
  // Appended to the origin's own path, so an API mounted under a sub-path still works.
  target.pathname = `${target.pathname.replace(/\/$/u, '')}/${segmentsOf(params.path).join('/')}`;
  target.search = incoming.search;

  // Constructing from the original Request carries method, body, and headers — `Authorization`
  // among them, which is the whole point: every authenticated call arrives through here.
  const proxied = new Request(target, request);

  // Overwrite, never append. The API's rate limiter reads the client address out of this header
  // when it is configured to trust this proxy, so whatever the browser sent under the same name
  // is an attempt to choose its own bucket and must not survive the hop. `CF-Connecting-IP` is
  // set by Cloudflare itself and cannot be forged by the caller.
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp === null) {
    // No trustworthy address to pass on, so the header is removed rather than guessed. The API
    // then falls back to the socket address, which buckets this request with the rest of the
    // proxy's traffic — a worse limit, not a weaker one.
    proxied.headers.delete('x-forwarded-for');
  } else {
    proxied.headers.set('x-forwarded-for', clientIp);
  }

  return fetch(proxied);
}
