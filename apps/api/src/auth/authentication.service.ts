import { Inject, Injectable } from '@nestjs/common';

import type { LocalUser } from '../users/user.js';
import { IdentityEmailConflictError } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';
import {
  IDENTITY_TOKEN_VERIFIER,
  InvalidIdentityTokenError,
  type IdentityTokenVerifier,
} from './identity-token-verifier.js';

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(IDENTITY_TOKEN_VERIFIER)
    private readonly identityTokenVerifier: IdentityTokenVerifier,
    private readonly usersService: UsersService,
  ) {}

  async authenticate(token: string): Promise<LocalUser> {
    const identity = await this.identityTokenVerifier.verify(token);

    try {
      return await this.usersService.resolveIdentity(identity);
    } catch (error) {
      if (error instanceof IdentityEmailConflictError) {
        throw new InvalidIdentityTokenError();
      }

      throw error;
    }
  }
}
