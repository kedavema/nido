import { Module } from '@nestjs/common';

import { PrismaUsersRepository } from './prisma-users.repository.js';
import { USERS_REPOSITORY } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [
    UsersService,
    PrismaUsersRepository,
    { provide: USERS_REPOSITORY, useExisting: PrismaUsersRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
