import { Injectable } from '@nestjs/common';
import { CATEGORY_KINDS, type CategoryKind } from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import type {
  CategoryRecord,
  CreateCategoryRecordInput,
  UpdateCategoryRecordChanges,
} from './category.js';
import {
  CategoryHierarchyViolationError,
  CategoryInUseError,
  CategoryParentMissingError,
  CategorySiblingNameConflictError,
  type CategoriesRepository,
} from './categories.repository.js';

const SIBLING_NAME_INDEX = 'categories_active_sibling_name_key';
const PARENT_FOREIGN_KEY = 'categories_parent_id_fkey';
const CHECK_VIOLATION_CODE = '23514';
const FOREIGN_KEY_VIOLATION_CODE = '23503';
const TRIGGER_CONSTRAINTS = [
  'categories_parent_same_household_check',
  'categories_parent_same_kind_check',
  'categories_two_levels_check',
  'categories_children_consistency_check',
] as const;
// The pg driver adapter surfaces trigger RAISE errors with the SQLSTATE and the
// message text only (no constraint name), so match the migration's messages too.
const TRIGGER_MESSAGE_FRAGMENTS = [
  'two levels',
  'same household',
  'same kind',
  'while it has children',
] as const;

@Injectable()
export class PrismaCategoriesRepository implements CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForHousehold(householdId: string): Promise<readonly CategoryRecord[]> {
    const categories = await this.prisma.category.findMany({
      where: { householdId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return categories.map(toCategoryRecord);
  }

  async findInHousehold(householdId: string, categoryId: string): Promise<CategoryRecord | null> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, householdId },
    });
    return category === null ? null : toCategoryRecord(category);
  }

  async findActiveSibling(input: {
    readonly householdId: string;
    readonly kind: CategoryKind;
    readonly parentId: string | null;
    readonly name: string;
  }): Promise<CategoryRecord | null> {
    const sibling = await this.prisma.category.findFirst({
      where: {
        householdId: input.householdId,
        kind: input.kind,
        parentId: input.parentId,
        name: input.name,
        isActive: true,
      },
    });
    return sibling === null ? null : toCategoryRecord(sibling);
  }

  async hasChildren(categoryId: string): Promise<boolean> {
    const child = await this.prisma.category.findFirst({
      where: { parentId: categoryId },
      select: { id: true },
    });
    return child !== null;
  }

  async create(input: CreateCategoryRecordInput): Promise<CategoryRecord> {
    try {
      const category = await this.prisma.category.create({
        data: {
          householdId: input.householdId,
          kind: input.kind,
          parentId: input.parentId,
          name: input.name,
          icon: input.icon,
          color: input.color,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });
      return toCategoryRecord(category);
    } catch (error) {
      throw translateWriteError(error, { missingParentAsForeignKey: true });
    }
  }

  async update(
    householdId: string,
    categoryId: string,
    changes: UpdateCategoryRecordChanges,
  ): Promise<CategoryRecord | null> {
    try {
      const category = await this.prisma.category.update({
        where: { id: categoryId, householdId },
        data: changes,
      });
      return toCategoryRecord(category);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw translateWriteError(error, { missingParentAsForeignKey: true });
    }
  }

  async archive(householdId: string, categoryId: string): Promise<CategoryRecord | null> {
    try {
      const category = await this.prisma.category.update({
        where: { id: categoryId, householdId },
        data: { isActive: false },
      });
      return toCategoryRecord(category);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteById(householdId: string, categoryId: string): Promise<boolean> {
    try {
      await this.prisma.category.delete({ where: { id: categoryId, householdId } });
      return true;
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return false;
      }
      if (isForeignKeyError(error)) {
        throw new CategoryInUseError('Category is still referenced by other rows');
      }
      throw error;
    }
  }
}

function toCategoryRecord(category: {
  readonly id: string;
  readonly householdId: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): CategoryRecord {
  return {
    id: category.id,
    householdId: category.householdId,
    kind: toCategoryKind(category.kind),
    parentId: category.parentId,
    name: category.name,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function toCategoryKind(value: string): CategoryKind {
  if ((CATEGORY_KINDS as readonly string[]).includes(value)) {
    return value as CategoryKind;
  }
  throw new Error('Unsupported category kind');
}

/**
 * Maps database-level failures to domain errors as a backstop for races that
 * slip past the service pre-checks. The migration enforces the invariants with
 * the partial unique index and the two-level trigger, so a concurrent writer
 * can still surface them here.
 */
function translateWriteError(
  error: unknown,
  options: { readonly missingParentAsForeignKey: boolean },
): unknown {
  const text = collectErrorText(error);

  if (errorCode(error) === 'P2002' || text.includes(SIBLING_NAME_INDEX)) {
    return new CategorySiblingNameConflictError('Active sibling category name already exists');
  }
  if (
    TRIGGER_CONSTRAINTS.some((constraint) => text.includes(constraint)) ||
    (hasPostgresCode(error, CHECK_VIOLATION_CODE) &&
      TRIGGER_MESSAGE_FRAGMENTS.some((fragment) => text.includes(fragment)))
  ) {
    return new CategoryHierarchyViolationError('Category hierarchy constraint rejected the write');
  }
  if (options.missingParentAsForeignKey && isForeignKeyError(error)) {
    return new CategoryParentMissingError('Category parent no longer exists');
  }
  return error;
}

function isRecordNotFoundError(error: unknown): boolean {
  return errorCode(error) === 'P2025';
}

function isForeignKeyError(error: unknown): boolean {
  return (
    errorCode(error) === 'P2003' ||
    hasPostgresCode(error, FOREIGN_KEY_VIOLATION_CODE) ||
    collectErrorText(error).includes(PARENT_FOREIGN_KEY)
  );
}

function hasPostgresCode(error: unknown, sqlState: string, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && error.code === sqlState) {
    return true;
  }
  if ('originalCode' in error && error.originalCode === sqlState) {
    return true;
  }
  return 'cause' in error && hasPostgresCode(error.cause, sqlState, depth + 1);
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function collectErrorText(error: unknown, depth = 0): string {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return '';
  }

  const parts: string[] = [];
  if ('message' in error && typeof error.message === 'string') {
    parts.push(error.message);
  }
  if ('originalMessage' in error && typeof error.originalMessage === 'string') {
    parts.push(error.originalMessage);
  }
  if ('meta' in error) {
    try {
      parts.push(JSON.stringify(error.meta));
    } catch {
      // Ignore non-serializable metadata.
    }
  }
  if ('cause' in error) {
    parts.push(collectErrorText(error.cause, depth + 1));
  }
  return parts.join(' ');
}
