import { Controller, Get, Inject, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { VapidPublicKeyResponse } from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { VAPID_KEYS, type VapidKeys } from './vapid-keys.js';

@UseGuards(AuthenticationGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(VAPID_KEYS)
    private readonly vapid: VapidKeys | null,
  ) {}

  /**
   * The public half of the VAPID pair. Served by the API rather than shipped as an EXPO_PUBLIC_
   * build variable so key and adapter always come from the same deployment — a client subscribing
   * with a key the server no longer holds would produce subscriptions nothing can push to.
   */
  @Get('vapid-public-key')
  getVapidPublicKey(): VapidPublicKeyResponse {
    if (this.vapid === null) {
      throw new ServiceUnavailableException('Notifications are not available');
    }
    return { publicKey: this.vapid.publicKey };
  }
}
