import type { CategoryKind } from '@nido/domain-types';

import type {
  CategoryRecord,
  CreateCategoryRecordInput,
  UpdateCategoryRecordChanges,
} from './category.js';

export const CATEGORIES_REPOSITORY = Symbol('CATEGORIES_REPOSITORY');

/** The active-sibling unique index rejected the write (duplicate name race). */
export class CategorySiblingNameConflictError extends Error {}

/** The two-level trigger rejected the write (hierarchy race lost to a concurrent change). */
export class CategoryHierarchyViolationError extends Error {}

/** The parent row vanished between validation and the write (foreign key race). */
export class CategoryParentMissingError extends Error {}

/** The row cannot be hard-deleted because other rows still reference it. */
export class CategoryInUseError extends Error {}

export interface CategoriesRepository {
  listForHousehold(householdId: string): Promise<readonly CategoryRecord[]>;
  findInHousehold(householdId: string, categoryId: string): Promise<CategoryRecord | null>;
  findActiveSibling(input: {
    readonly householdId: string;
    readonly kind: CategoryKind;
    readonly parentId: string | null;
    readonly name: string;
  }): Promise<CategoryRecord | null>;
  hasChildren(categoryId: string): Promise<boolean>;
  create(input: CreateCategoryRecordInput): Promise<CategoryRecord>;
  update(
    householdId: string,
    categoryId: string,
    changes: UpdateCategoryRecordChanges,
  ): Promise<CategoryRecord | null>;
  archive(householdId: string, categoryId: string): Promise<CategoryRecord | null>;
  deleteById(householdId: string, categoryId: string): Promise<boolean>;
}
