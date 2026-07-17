import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';
import { AuthenticationGuard } from './authentication.guard.js';
import { AuthenticationService } from './authentication.service.js';
import { FirebaseIdentityTokenVerifier } from './firebase-identity-token.verifier.js';
import { IDENTITY_TOKEN_VERIFIER } from './identity-token-verifier.js';

@Module({
  imports: [UsersModule],
  providers: [
    AuthenticationGuard,
    AuthenticationService,
    FirebaseIdentityTokenVerifier,
    { provide: IDENTITY_TOKEN_VERIFIER, useExisting: FirebaseIdentityTokenVerifier },
  ],
  exports: [AuthenticationGuard, AuthenticationService, IDENTITY_TOKEN_VERIFIER],
})
export class AuthModule {}
