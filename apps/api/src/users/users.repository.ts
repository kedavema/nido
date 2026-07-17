import type { LocalUser, VerifiedIdentity } from './user.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  resolveIdentity(identity: VerifiedIdentity): Promise<LocalUser>;
}

export class IdentityEmailConflictError extends Error {
  constructor() {
    super('The verified identity conflicts with an existing account');
    this.name = 'IdentityEmailConflictError';
  }
}
