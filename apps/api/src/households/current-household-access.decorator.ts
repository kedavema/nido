import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import type { HouseholdAccess } from './household.js';

export const CurrentHouseholdAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HouseholdAccess => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const access = request.householdAccess;
    if (access === undefined) {
      throw new Error('CurrentHouseholdAccess requires HouseholdMembershipGuard');
    }
    return access;
  },
);
