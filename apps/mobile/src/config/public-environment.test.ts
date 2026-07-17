import { describe, expect, it } from 'vitest';

import { parsePublicEnvironment, PublicEnvironmentError } from './public-environment';

const validInput = {
  apiUrl: 'https://api.example.com/',
  firebaseApiKey: 'public-browser-key',
  firebaseAuthDomain: 'nido-example.firebaseapp.com',
  firebaseProjectId: 'nido-example',
  firebaseAppId: '1:123:web:abc',
  firebaseMessagingSenderId: '123456789',
  googleWebClientId: '123-abc.apps.googleusercontent.com',
};

describe('public client environment', () => {
  it('accepts the documented public identifiers and normalizes the API URL', () => {
    expect(parsePublicEnvironment(validInput)).toEqual({
      ...validInput,
      apiUrl: 'https://api.example.com',
    });
  });

  it('reports field names without echoing invalid values', () => {
    const invalidApiKey = 'do-not-echo-this-value';

    expect(() =>
      parsePublicEnvironment({
        ...validInput,
        apiUrl: 'not-a-url',
        firebaseApiKey: '',
        firebaseProjectId: 'INVALID PROJECT',
        googleWebClientId: invalidApiKey,
      }),
    ).toThrow(PublicEnvironmentError);

    try {
      parsePublicEnvironment({
        ...validInput,
        apiUrl: 'not-a-url',
        googleWebClientId: invalidApiKey,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PublicEnvironmentError);
      expect((error as Error).message).not.toContain(invalidApiKey);
      expect((error as PublicEnvironmentError).invalidFields).toEqual([
        'apiUrl',
        'googleWebClientId',
      ]);
    }
  });

  it('rejects missing configuration', () => {
    expect(() => parsePublicEnvironment({})).toThrow(PublicEnvironmentError);
  });

  it('allows cleartext only for local development API hosts', () => {
    expect(parsePublicEnvironment({ ...validInput, apiUrl: 'http://10.0.2.2:3000/' }).apiUrl).toBe(
      'http://10.0.2.2:3000',
    );
    expect(() =>
      parsePublicEnvironment({ ...validInput, apiUrl: 'http://api.example.com' }),
    ).toThrow(PublicEnvironmentError);
  });
});
