import { z } from 'zod';

import { resolveApiUrl } from './api-url';

const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]']);

// Private LAN IPv4 ranges (RFC 1918). Allowed over http so a physical device can
// reach a dev server running on another machine on the same network.
const PRIVATE_LAN_IPV4 =
  /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

function isLocalHttpHost(hostname: string): boolean {
  return LOCAL_API_HOSTS.has(hostname) || PRIVATE_LAN_IPV4.test(hostname);
}

const PublicEnvironmentSchema = z.strictObject({
  apiUrl: z
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHttpHost(url.hostname))
        );
      } catch {
        return false;
      }
    })
    .transform((value) => value.replace(/\/$/, '')),
  firebaseApiKey: z.string().min(1),
  firebaseAuthDomain: z.string().min(1),
  firebaseProjectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  firebaseAppId: z.string().min(1),
  firebaseMessagingSenderId: z.string().regex(/^\d+$/),
  googleWebClientId: z.string().regex(/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/),
});

export type PublicEnvironment = z.infer<typeof PublicEnvironmentSchema>;

export class PublicEnvironmentError extends Error {
  constructor(readonly invalidFields: readonly string[]) {
    super(`Configuración pública inválida: ${invalidFields.join(', ')}`);
    this.name = 'PublicEnvironmentError';
  }
}

export function parsePublicEnvironment(input: unknown): PublicEnvironment {
  const result = PublicEnvironmentSchema.safeParse(input);

  if (!result.success) {
    const invalidFields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.') || 'environment')),
    ].sort();
    throw new PublicEnvironmentError(invalidFields);
  }

  return result.data;
}

let cachedEnvironment: PublicEnvironment | undefined;

export function getPublicEnvironment(): PublicEnvironment {
  cachedEnvironment ??= parsePublicEnvironment({
    // Platform-resolved: an explicit `EXPO_PUBLIC_API_URL` on either platform, or this page's own
    // origin on web when it is absent. See `api-url.web.ts` for why web has a default at all.
    apiUrl: resolveApiUrl(),
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  return cachedEnvironment;
}
