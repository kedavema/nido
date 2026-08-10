import { ZodError } from 'zod';

import { ApiError } from '../api/client';
import { PublicEnvironmentError } from '../config/public-environment';

/**
 * Firebase Auth codes worth naming, because each one has a different fix and the user (or the
 * person reading their screenshot) can act on knowing which it was. Any other code keeps its
 * `code` in a parenthetical instead.
 *
 * Only the `code` is ever surfaced — never `error.message`, which Firebase populates with request
 * detail that can carry a token.
 */
const FIREBASE_AUTH_MESSAGES: Readonly<Record<string, string>> = {
  'auth/unauthorized-domain': 'Este dominio no está habilitado para iniciar sesión.',
  'auth/network-request-failed':
    'No pudimos conectarnos con el servicio de inicio de sesión. Revisá tu conexión e intentá de nuevo.',
  'auth/popup-blocked':
    'El navegador bloqueó la ventana de inicio de sesión. Permitila e intentá de nuevo.',
  'auth/too-many-requests': 'Hiciste demasiados intentos. Esperá un momento y probá de nuevo.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/invalid-api-key': 'La clave de Firebase no es válida.',
};

/**
 * Duck-typed rather than `instanceof FirebaseError`, matching `isPopupCancellation` in
 * `auth-client.web.ts`: the web and native entry points can each resolve their own copy of the
 * Firebase SDK, so an identity check on the class is not reliable across them.
 */
function firebaseAuthCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('auth/')
  ) {
    return error.code;
  }

  return null;
}

/**
 * The error's constructor name, when it adds anything. A bare `Error` names nothing useful, and
 * the message is withheld on purpose — an unrecognized error is exactly the one whose message we
 * have not vetted for tokens or payload detail.
 */
function unknownErrorDetail(error: unknown): string {
  if (error instanceof Error && error.name !== '' && error.name !== 'Error') {
    return ` (${error.name})`;
  }

  return '';
}

/**
 * The single place an arbitrary thrown value becomes a sentence the user reads. Every branch
 * either carries a cause the user can act on, or names the error well enough that a screenshot is
 * diagnosable.
 */
export function messageForError(error: unknown): string {
  if (error instanceof ApiError || error instanceof PublicEnvironmentError) {
    return error.message;
  }

  if (error instanceof ZodError) {
    return 'Revisá los datos e intentá de nuevo.';
  }

  const code = firebaseAuthCode(error);

  if (code !== null) {
    return FIREBASE_AUTH_MESSAGES[code] ?? `No pudimos iniciar sesión. (${code})`;
  }

  return `Ocurrió un error inesperado. Intentá de nuevo.${unknownErrorDetail(error)}`;
}
