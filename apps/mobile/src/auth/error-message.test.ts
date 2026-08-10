import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ZodError } from 'zod';

import { ApiError } from '../api/client';
import { PublicEnvironmentError } from '../config/public-environment';
import { messageForError } from './error-message';

/** Shaped like a Firebase Auth rejection: a `code` plus a message we deliberately never show. */
function firebaseError(code: string, message = 'Firebase: internal detail (auth/xxx).'): Error {
  return Object.assign(new Error(message), { code, name: 'FirebaseError' });
}

function zodError(): ZodError {
  const result = z.object({ amount: z.number() }).safeParse({ amount: 'not-a-number' });

  if (result.success) {
    throw new Error('the fixture must fail parsing');
  }

  return result.error;
}

describe('messageForError', () => {
  it('passes an ApiError message through, since it is already user-facing', () => {
    const error = new ApiError('No encontramos lo que buscabas.', 404, 'response');

    expect(messageForError(error)).toBe('No encontramos lo que buscabas.');
  });

  it('passes a PublicEnvironmentError message through, naming the invalid fields', () => {
    const error = new PublicEnvironmentError(['apiUrl', 'firebaseApiKey']);

    expect(messageForError(error)).toContain('apiUrl');
    expect(messageForError(error)).toContain('firebaseApiKey');
  });

  it('turns a schema failure into validation guidance', () => {
    expect(messageForError(zodError())).toBe('Revisá los datos e intentá de nuevo.');
  });

  it.each([
    ['auth/unauthorized-domain', 'Este dominio no está habilitado para iniciar sesión.'],
    [
      'auth/network-request-failed',
      'No pudimos conectarnos con el servicio de inicio de sesión. Revisá tu conexión e intentá de nuevo.',
    ],
    [
      'auth/popup-blocked',
      'El navegador bloqueó la ventana de inicio de sesión. Permitila e intentá de nuevo.',
    ],
    ['auth/too-many-requests', 'Hiciste demasiados intentos. Esperá un momento y probá de nuevo.'],
    ['auth/user-disabled', 'Esta cuenta está deshabilitada.'],
    ['auth/invalid-api-key', 'La clave de Firebase no es válida.'],
  ])('names the cause behind %s', (code, expected) => {
    expect(messageForError(firebaseError(code))).toBe(expected);
  });

  it('keeps an unmapped Firebase code in the message so a screenshot stays diagnosable', () => {
    expect(messageForError(firebaseError('auth/operation-not-allowed'))).toBe(
      'No pudimos iniciar sesión. (auth/operation-not-allowed)',
    );
  });

  it('never surfaces the Firebase message, mapped or not', () => {
    const secret = 'Firebase: token=eyJhbGciOi.LEAKED (auth/internal-error).';

    expect(messageForError(firebaseError('auth/unauthorized-domain', secret))).not.toContain(
      'LEAKED',
    );
    expect(messageForError(firebaseError('auth/internal-error', secret))).not.toContain('LEAKED');
  });

  it('ignores a non-auth code rather than reading it as a Firebase failure', () => {
    const nodeError = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
      name: 'SystemError',
    });

    expect(messageForError(nodeError)).toBe(
      'Ocurrió un error inesperado. Intentá de nuevo. (SystemError)',
    );
  });

  it('names an unknown error by type without repeating its message', () => {
    const error = new TypeError('undefined is not a function');

    expect(messageForError(error)).toBe(
      'Ocurrió un error inesperado. Intentá de nuevo. (TypeError)',
    );
  });

  it('adds no parenthetical when the type says nothing', () => {
    expect(messageForError(new Error('boom'))).toBe(
      'Ocurrió un error inesperado. Intentá de nuevo.',
    );
    expect(messageForError('a thrown string')).toBe(
      'Ocurrió un error inesperado. Intentá de nuevo.',
    );
    expect(messageForError(undefined)).toBe('Ocurrió un error inesperado. Intentá de nuevo.');
  });
});
