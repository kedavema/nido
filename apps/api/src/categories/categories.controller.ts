import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateCategoryRequestSchema,
  UpdateCategoryRequestSchema,
  UuidSchema,
  type CreateCategoryRequest,
  type CreateCategoryResponse,
  type ListCategoriesResponse,
  type UpdateCategoryRequest,
  type UpdateCategoryResponse,
} from '@nido/contracts';

import { AuthenticationGuard } from '../auth/authentication.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentHouseholdAccess } from '../households/current-household-access.decorator.js';
import type { HouseholdAccess } from '../households/household.js';
import { HouseholdMembershipGuard } from '../households/household-membership.guard.js';
import { RequireHouseholdRoles } from '../households/required-household-roles.decorator.js';
import { CategoriesService } from './categories.service.js';

@UseGuards(AuthenticationGuard, HouseholdMembershipGuard)
@RequireHouseholdRoles('OWNER', 'MEMBER')
@Controller('households/:householdId/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  listCategories(
    @CurrentHouseholdAccess() access: HouseholdAccess,
  ): Promise<ListCategoriesResponse> {
    return this.categories.listCategories(access);
  }

  @Post()
  createCategory(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Body(new ZodValidationPipe(CreateCategoryRequestSchema)) input: CreateCategoryRequest,
  ): Promise<CreateCategoryResponse> {
    return this.categories.createCategory(access, input);
  }

  @Patch(':categoryId')
  updateCategory(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('categoryId', new ZodValidationPipe(UuidSchema)) categoryId: string,
    @Body(new ZodValidationPipe(UpdateCategoryRequestSchema)) input: UpdateCategoryRequest,
  ): Promise<UpdateCategoryResponse> {
    return this.categories.updateCategory(access, categoryId, input);
  }

  @Delete(':categoryId')
  @HttpCode(204)
  async deleteCategory(
    @CurrentHouseholdAccess() access: HouseholdAccess,
    @Param('categoryId', new ZodValidationPipe(UuidSchema)) categoryId: string,
  ): Promise<void> {
    await this.categories.deleteCategory(access, categoryId);
  }
}
