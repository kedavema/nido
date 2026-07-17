import { SetMetadata } from '@nestjs/common';
import type { HouseholdRole } from '@nido/domain-types';

export const REQUIRED_HOUSEHOLD_ROLES = Symbol('REQUIRED_HOUSEHOLD_ROLES');

export const RequireHouseholdRoles = (...roles: readonly HouseholdRole[]) =>
  SetMetadata(REQUIRED_HOUSEHOLD_ROLES, roles);
