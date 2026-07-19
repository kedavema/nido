import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Category,
  CreateCategoryRequest,
  CreateCategoryResponse,
  ListCategoriesResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
} from '@nido/contracts';

import type { HouseholdAccess } from '../households/household.js';
import type { CategoryRecord, UpdateCategoryRecordChanges } from './category.js';
import {
  CATEGORIES_REPOSITORY,
  CategoryHierarchyViolationError,
  CategoryInUseError,
  CategoryParentMissingError,
  CategorySiblingNameConflictError,
  type CategoriesRepository,
} from './categories.repository.js';

const CATEGORY_UNAVAILABLE = 'Category is unavailable';
const PARENT_MUST_BE_ROOT_SAME_HOUSEHOLD_KIND =
  'Category parent must be a root category of the same household and kind';
const SIBLING_NAME_TAKEN = 'Category name is already used by an active sibling category';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORIES_REPOSITORY)
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  async listCategories(access: HouseholdAccess): Promise<ListCategoriesResponse> {
    const categories = await this.categoriesRepository.listForHousehold(access.householdId);
    return { categories: categories.map(toCategory) };
  }

  async createCategory(
    access: HouseholdAccess,
    input: CreateCategoryRequest,
  ): Promise<CreateCategoryResponse> {
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      await this.assertValidParent(access.householdId, parentId, input.kind);
    }

    await this.assertSiblingNameAvailable({
      householdId: access.householdId,
      kind: input.kind,
      parentId,
      name: input.name,
      excludedCategoryId: null,
    });

    try {
      const category = await this.categoriesRepository.create({
        householdId: access.householdId,
        kind: input.kind,
        parentId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      });
      return { category: toCategory(category) };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  async updateCategory(
    access: HouseholdAccess,
    categoryId: string,
    input: UpdateCategoryRequest,
  ): Promise<UpdateCategoryResponse> {
    const existing = await this.categoriesRepository.findInHousehold(
      access.householdId,
      categoryId,
    );
    if (existing === null) {
      throw new NotFoundException(CATEGORY_UNAVAILABLE);
    }

    const targetParentId = input.parentId === undefined ? existing.parentId : input.parentId;
    if (targetParentId !== existing.parentId && targetParentId !== null) {
      if (targetParentId === categoryId) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      if (await this.categoriesRepository.hasChildren(categoryId)) {
        throw new BadRequestException(
          'Category with subcategories cannot become a subcategory itself',
        );
      }
      await this.assertValidParent(access.householdId, targetParentId, existing.kind);
    }

    const targetIsActive = input.isActive ?? existing.isActive;
    if (targetIsActive) {
      await this.assertSiblingNameAvailable({
        householdId: access.householdId,
        kind: existing.kind,
        parentId: targetParentId,
        name: input.name ?? existing.name,
        excludedCategoryId: existing.id,
      });
    }

    const changes: UpdateCategoryRecordChanges = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    let updated: CategoryRecord | null;
    try {
      updated = await this.categoriesRepository.update(access.householdId, categoryId, changes);
    } catch (error) {
      throw mapPersistenceError(error);
    }

    if (updated === null) {
      throw new NotFoundException(CATEGORY_UNAVAILABLE);
    }

    return { category: toCategory(updated) };
  }

  async deleteCategory(access: HouseholdAccess, categoryId: string): Promise<void> {
    const existing = await this.categoriesRepository.findInHousehold(
      access.householdId,
      categoryId,
    );
    if (existing === null) {
      throw new NotFoundException(CATEGORY_UNAVAILABLE);
    }

    if (await this.categoriesRepository.hasChildren(categoryId)) {
      await this.categoriesRepository.archive(access.householdId, categoryId);
      return;
    }

    try {
      await this.categoriesRepository.deleteById(access.householdId, categoryId);
    } catch (error) {
      if (error instanceof CategoryInUseError) {
        await this.categoriesRepository.archive(access.householdId, categoryId);
        return;
      }
      throw error;
    }
  }

  private async assertValidParent(
    householdId: string,
    parentId: string,
    kind: CategoryRecord['kind'],
  ): Promise<void> {
    const parent = await this.categoriesRepository.findInHousehold(householdId, parentId);
    if (parent?.kind !== kind || parent.parentId !== null) {
      throw new BadRequestException(PARENT_MUST_BE_ROOT_SAME_HOUSEHOLD_KIND);
    }
  }

  private async assertSiblingNameAvailable(input: {
    readonly householdId: string;
    readonly kind: CategoryRecord['kind'];
    readonly parentId: string | null;
    readonly name: string;
    readonly excludedCategoryId: string | null;
  }): Promise<void> {
    const sibling = await this.categoriesRepository.findActiveSibling({
      householdId: input.householdId,
      kind: input.kind,
      parentId: input.parentId,
      name: input.name,
    });
    if (sibling !== null && sibling.id !== input.excludedCategoryId) {
      throw new ConflictException(SIBLING_NAME_TAKEN);
    }
  }
}

function mapPersistenceError(error: unknown): unknown {
  if (error instanceof CategorySiblingNameConflictError) {
    return new ConflictException(SIBLING_NAME_TAKEN);
  }
  if (
    error instanceof CategoryHierarchyViolationError ||
    error instanceof CategoryParentMissingError
  ) {
    return new BadRequestException(PARENT_MUST_BE_ROOT_SAME_HOUSEHOLD_KIND);
  }
  return error;
}

function toCategory(record: CategoryRecord): Category {
  return {
    id: record.id,
    householdId: record.householdId,
    kind: record.kind,
    parentId: record.parentId,
    name: record.name,
    icon: record.icon,
    color: record.color,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
