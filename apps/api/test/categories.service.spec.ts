import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { CategoryRecord } from '../src/categories/category.js';
import {
  CategoryHierarchyViolationError,
  CategoryInUseError,
  CategoryParentMissingError,
  CategorySiblingNameConflictError,
  type CategoriesRepository,
} from '../src/categories/categories.repository.js';
import { CategoriesService } from '../src/categories/categories.service.js';
import type { HouseholdAccess } from '../src/households/household.js';

const now = new Date('2026-07-19T12:00:00.000Z');
const access: HouseholdAccess = {
  actorId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: 'd8785b17-6523-43d6-b079-b8a79ce4dca1',
  role: 'OWNER',
  joinedAt: now,
};
const rootId = '0d539fa4-e991-41d7-9d31-258b1307ec31';
const childId = '9f8f4a9c-31f0-4b62-9e6c-1a2b3c4d5e6f';
const otherId = '7b6a5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

function categoryRecord(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: rootId,
    householdId: access.householdId,
    kind: 'EXPENSE',
    parentId: null,
    name: 'Groceries',
    icon: 'cart',
    color: '#AABBCC',
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRepository(overrides: Partial<CategoriesRepository> = {}): CategoriesRepository {
  return {
    listForHousehold: () => Promise.resolve([]),
    findInHousehold: () => Promise.resolve(null),
    findActiveSibling: () => Promise.resolve(null),
    hasChildren: () => Promise.resolve(false),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    archive: () => Promise.reject(new Error('not used')),
    deleteById: () => Promise.reject(new Error('not used')),
    ...overrides,
  };
}

describe('CategoriesService list', () => {
  it('lists every category of the household, including archived ones', async () => {
    const listForHousehold = vi.fn(() =>
      Promise.resolve([
        categoryRecord(),
        categoryRecord({ id: otherId, name: 'Old Rent', isActive: false }),
      ]),
    );
    const service = new CategoriesService(createRepository({ listForHousehold }));

    const response = await service.listCategories(access);

    expect(response.categories).toHaveLength(2);
    expect(response.categories[0]).toEqual({
      id: rootId,
      householdId: access.householdId,
      kind: 'EXPENSE',
      parentId: null,
      name: 'Groceries',
      icon: 'cart',
      color: '#AABBCC',
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-07-19T12:00:00.000Z',
      updatedAt: '2026-07-19T12:00:00.000Z',
    });
    expect(response.categories[1]?.isActive).toBe(false);
    expect(listForHousehold).toHaveBeenCalledWith(access.householdId);
  });
});

describe('CategoriesService create', () => {
  it('creates a root category', async () => {
    const create = vi.fn(() => Promise.resolve(categoryRecord()));
    const service = new CategoriesService(createRepository({ create }));

    const response = await service.createCategory(access, {
      kind: 'EXPENSE',
      name: 'Groceries',
      icon: 'cart',
      color: '#AABBCC',
    });

    expect(response.category.id).toBe(rootId);
    expect(create).toHaveBeenCalledWith({
      householdId: access.householdId,
      kind: 'EXPENSE',
      parentId: null,
      name: 'Groceries',
      icon: 'cart',
      color: '#AABBCC',
      sortOrder: undefined,
    });
  });

  it('creates a subcategory under an existing root of the same kind', async () => {
    const create = vi.fn(() =>
      Promise.resolve(categoryRecord({ id: childId, parentId: rootId, name: 'Supermarket' })),
    );
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        create,
      }),
    );

    const response = await service.createCategory(access, {
      kind: 'EXPENSE',
      name: 'Supermarket',
      icon: 'basket',
      color: '#AABBCC',
      parentId: rootId,
      sortOrder: 3,
    });

    expect(response.category.parentId).toBe(rootId);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: rootId, sortOrder: 3 }),
    );
  });

  it('rejects a parent that does not exist in the household', async () => {
    const service = new CategoriesService(
      createRepository({ findInHousehold: vi.fn(() => Promise.resolve(null)) }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Supermarket',
        icon: 'basket',
        color: '#AABBCC',
        parentId: rootId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a parent of a different kind', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord({ kind: 'INCOME' }))),
      }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Supermarket',
        icon: 'basket',
        color: '#AABBCC',
        parentId: rootId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a parent that is itself a subcategory', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() =>
          Promise.resolve(categoryRecord({ id: childId, parentId: rootId })),
        ),
      }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Fruits',
        icon: 'apple',
        color: '#AABBCC',
        parentId: childId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate name among active siblings', async () => {
    const create = vi.fn(() => Promise.resolve(categoryRecord()));
    const service = new CategoriesService(
      createRepository({
        findActiveSibling: vi.fn(() => Promise.resolve(categoryRecord({ id: otherId }))),
        create,
      }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Groceries',
        icon: 'cart',
        color: '#AABBCC',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a persistence sibling-name race to a conflict', async () => {
    const service = new CategoriesService(
      createRepository({
        create: vi.fn(() => Promise.reject(new CategorySiblingNameConflictError())),
      }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Groceries',
        icon: 'cart',
        color: '#AABBCC',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a persistence hierarchy race to a bad request', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        create: vi.fn(() => Promise.reject(new CategoryHierarchyViolationError())),
      }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Supermarket',
        icon: 'basket',
        color: '#AABBCC',
        parentId: rootId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a parent that vanished mid-flight to a bad request', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        create: vi.fn(() => Promise.reject(new CategoryParentMissingError())),
      }),
    );

    await expect(
      service.createCategory(access, {
        kind: 'EXPENSE',
        name: 'Supermarket',
        icon: 'basket',
        color: '#AABBCC',
        parentId: rootId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CategoriesService update', () => {
  it('rejects a category outside the household as not found', async () => {
    const service = new CategoriesService(
      createRepository({ findInHousehold: vi.fn(() => Promise.resolve(null)) }),
    );

    await expect(service.updateCategory(access, rootId, { name: 'Food' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('renames a category', async () => {
    const update = vi.fn(() => Promise.resolve(categoryRecord({ name: 'Food' })));
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        update,
      }),
    );

    const response = await service.updateCategory(access, rootId, { name: 'Food' });

    expect(response.category.name).toBe('Food');
    expect(update).toHaveBeenCalledWith(access.householdId, rootId, { name: 'Food' });
  });

  it('allows keeping the current name on update', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        findActiveSibling: vi.fn(() => Promise.resolve(categoryRecord())),
        update: vi.fn(() => Promise.resolve(categoryRecord({ icon: 'salad' }))),
      }),
    );

    await expect(service.updateCategory(access, rootId, { icon: 'salad' })).resolves.toEqual({
      category: expect.objectContaining({ icon: 'salad' }),
    });
  });

  it('rejects renaming to an active sibling name', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        findActiveSibling: vi.fn(() =>
          Promise.resolve(categoryRecord({ id: otherId, name: 'Transport' })),
        ),
      }),
    );

    await expect(
      service.updateCategory(access, rootId, { name: 'Transport' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unarchiving when an active sibling already took the name', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord({ isActive: false }))),
        findActiveSibling: vi.fn(() => Promise.resolve(categoryRecord({ id: otherId }))),
      }),
    );

    await expect(service.updateCategory(access, rootId, { isActive: true })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('skips the sibling-name check when the category stays archived', async () => {
    const findActiveSibling = vi.fn(() => Promise.resolve(categoryRecord({ id: otherId })));
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord({ isActive: false }))),
        findActiveSibling,
        update: vi.fn(() => Promise.resolve(categoryRecord({ isActive: false, icon: 'box' }))),
      }),
    );

    await expect(service.updateCategory(access, rootId, { icon: 'box' })).resolves.toBeDefined();
    expect(findActiveSibling).not.toHaveBeenCalled();
  });

  it('rejects making a category its own parent', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
      }),
    );

    await expect(
      service.updateCategory(access, rootId, { parentId: rootId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reparenting a category that has subcategories', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn((householdId: string, categoryId: string) =>
          Promise.resolve(
            categoryRecord(categoryId === rootId ? {} : { id: otherId, name: 'Transport' }),
          ),
        ),
        hasChildren: vi.fn(() => Promise.resolve(true)),
      }),
    );

    await expect(
      service.updateCategory(access, rootId, { parentId: otherId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reparents a childless category under a root of the same kind', async () => {
    const update = vi.fn(() => Promise.resolve(categoryRecord({ parentId: otherId })));
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn((householdId: string, categoryId: string) =>
          Promise.resolve(
            categoryRecord(categoryId === rootId ? {} : { id: otherId, name: 'Transport' }),
          ),
        ),
        update,
      }),
    );

    const response = await service.updateCategory(access, rootId, { parentId: otherId });

    expect(response.category.parentId).toBe(otherId);
    expect(update).toHaveBeenCalledWith(access.householdId, rootId, { parentId: otherId });
  });

  it('maps a concurrent removal during update to not found', async () => {
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        update: vi.fn(() => Promise.resolve(null)),
      }),
    );

    await expect(service.updateCategory(access, rootId, { name: 'Food' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CategoriesService delete', () => {
  it('rejects a category outside the household as not found', async () => {
    const service = new CategoriesService(
      createRepository({ findInHousehold: vi.fn(() => Promise.resolve(null)) }),
    );

    await expect(service.deleteCategory(access, rootId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives a category that has subcategories', async () => {
    const archive = vi.fn(() => Promise.resolve(categoryRecord({ isActive: false })));
    const deleteById = vi.fn(() => Promise.resolve(true));
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        hasChildren: vi.fn(() => Promise.resolve(true)),
        archive,
        deleteById,
      }),
    );

    await service.deleteCategory(access, rootId);

    expect(archive).toHaveBeenCalledWith(access.householdId, rootId);
    expect(deleteById).not.toHaveBeenCalled();
  });

  it('hard-deletes a category without references', async () => {
    const archive = vi.fn(() => Promise.resolve(categoryRecord({ isActive: false })));
    const deleteById = vi.fn(() => Promise.resolve(true));
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        hasChildren: vi.fn(() => Promise.resolve(false)),
        archive,
        deleteById,
      }),
    );

    await service.deleteCategory(access, rootId);

    expect(deleteById).toHaveBeenCalledWith(access.householdId, rootId);
    expect(archive).not.toHaveBeenCalled();
  });

  it('falls back to archiving when a subcategory appears concurrently', async () => {
    const archive = vi.fn(() => Promise.resolve(categoryRecord({ isActive: false })));
    const service = new CategoriesService(
      createRepository({
        findInHousehold: vi.fn(() => Promise.resolve(categoryRecord())),
        hasChildren: vi.fn(() => Promise.resolve(false)),
        deleteById: vi.fn(() => Promise.reject(new CategoryInUseError())),
        archive,
      }),
    );

    await service.deleteCategory(access, rootId);

    expect(archive).toHaveBeenCalledWith(access.householdId, rootId);
  });
});
