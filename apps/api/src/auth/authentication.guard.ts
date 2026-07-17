import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { AuthenticationService } from './authentication.service.js';
import {
  IdentityProviderUnavailableError,
  InvalidIdentityTokenError,
} from './identity-token-verifier.js';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly authentication: AuthenticationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseBearerToken(request.headers.authorization);

    if (token === null) {
      throw new UnauthorizedException('Authentication is required');
    }

    try {
      request.authenticatedUser = await this.authentication.authenticate(token);
      return true;
    } catch (error) {
      if (error instanceof InvalidIdentityTokenError) {
        throw new UnauthorizedException('Authentication is invalid');
      }

      if (error instanceof IdentityProviderUnavailableError) {
        throw new ServiceUnavailableException('Authentication service is unavailable');
      }

      throw error;
    }
  }
}

function parseBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }

  const parts = header.trim().split(/\s+/u);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || parts[1]?.length === 0) {
    return null;
  }

  return parts[1] ?? null;
}
