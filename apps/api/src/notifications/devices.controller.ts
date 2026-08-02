import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  RegisterDeviceRequestSchema,
  UuidSchema,
  type RegisterDeviceRequest,
  type RegisterDeviceResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { LocalUser } from '../users/user.js';
import { DevicesService } from './devices.service.js';

/**
 * A device installation is an identity-scoped resource, not a household-scoped one (ADR 0012): a
 * phone belongs to a person, not to a home. Hence no `householdId` in the path and only
 * AuthenticationGuard — the ADR 0002 household boundary lives on notification deliveries.
 */
@UseGuards(AuthenticationGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('register')
  register(
    @CurrentUser() user: LocalUser,
    @Body(new ZodValidationPipe(RegisterDeviceRequestSchema)) input: RegisterDeviceRequest,
  ): Promise<RegisterDeviceResponse> {
    // `user` comes from the verified token; the request schema has no userId field at all, so
    // there is nothing here for a caller to spoof (docs/system-design.md §13).
    return this.devices.register(user, input);
  }

  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(
    @CurrentUser() user: LocalUser,
    @Param('deviceId', new ZodValidationPipe(UuidSchema)) deviceId: string,
  ): Promise<void> {
    return this.devices.deactivate(user, deviceId);
  }
}
