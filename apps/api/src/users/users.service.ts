import { Inject, Injectable } from '@nestjs/common';

import type { LocalUser, VerifiedIdentity } from './user.js';
import { USERS_REPOSITORY, type UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepository,
  ) {}

  resolveIdentity(identity: VerifiedIdentity): Promise<LocalUser> {
    return this.usersRepository.resolveIdentity(identity);
  }
}
