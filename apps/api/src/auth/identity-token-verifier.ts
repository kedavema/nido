import type { VerifiedIdentity } from '../users/user.js';

export const IDENTITY_TOKEN_VERIFIER = Symbol('IDENTITY_TOKEN_VERIFIER');

export interface IdentityTokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

export class InvalidIdentityTokenError extends Error {
  constructor() {
    super('The identity token is invalid');
    this.name = 'InvalidIdentityTokenError';
  }
}

export class IdentityProviderUnavailableError extends Error {
  constructor() {
    super('The identity provider is unavailable');
    this.name = 'IdentityProviderUnavailableError';
  }
}
