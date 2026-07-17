import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { LocalUser } from '../users/user.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): LocalUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.authenticatedUser;

    if (user === undefined) {
      throw new Error('CurrentUser requires AuthenticationGuard');
    }

    return user;
  },
);
