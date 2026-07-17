import { Injectable } from '@nestjs/common';
import { NIDO_TIME_ZONE } from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import type { LocalUser, VerifiedIdentity } from './user.js';
import { IdentityEmailConflictError, type UsersRepository } from './users.repository.js';

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async resolveIdentity(identity: VerifiedIdentity): Promise<LocalUser> {
    try {
      const user = await this.prisma.user.upsert({
        where: { firebaseUid: identity.firebaseUid },
        create: {
          firebaseUid: identity.firebaseUid,
          email: identity.email,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
          timezone: NIDO_TIME_ZONE,
        },
        update: {
          email: identity.email,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
        },
      });

      return {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new IdentityEmailConflictError();
      }

      throw error;
    }
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
