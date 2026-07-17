import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UuidSchema } from '@nido/contracts';
import { HOUSEHOLD_ROLES, type HouseholdRole } from '@nido/domain-types';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { HOUSEHOLDS_REPOSITORY, type HouseholdsRepository } from './households.repository.js';
import { REQUIRED_HOUSEHOLD_ROLES } from './required-household-roles.decorator.js';

@Injectable()
export class HouseholdMembershipGuard implements CanActivate {
  constructor(
    @Inject(HOUSEHOLDS_REPOSITORY)
    private readonly householdsRepository: HouseholdsRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.authenticatedUser;
    const householdIdResult = UuidSchema.safeParse(request.params?.householdId);

    if (user === undefined) {
      throw new Error('HouseholdMembershipGuard requires AuthenticationGuard');
    }

    if (!householdIdResult.success) {
      throw new NotFoundException('Household is unavailable');
    }

    const access = await this.householdsRepository.findActiveAccess(
      user.id,
      householdIdResult.data,
    );
    if (access === null) {
      throw new NotFoundException('Household is unavailable');
    }

    const reflectedRoles = this.reflector.getAllAndOverride<unknown>(REQUIRED_HOUSEHOLD_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      !Array.isArray(reflectedRoles) ||
      reflectedRoles.length === 0 ||
      reflectedRoles.some(
        (role) =>
          typeof role !== 'string' || !(HOUSEHOLD_ROLES as readonly string[]).includes(role),
      )
    ) {
      throw new ForbiddenException('Household permission is required');
    }

    const requiredRoles = reflectedRoles as readonly HouseholdRole[];
    if (!requiredRoles.includes(access.role)) {
      throw new ForbiddenException('Household permission is required');
    }

    request.householdAccess = access;
    return true;
  }
}
