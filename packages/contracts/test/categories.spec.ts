import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CategorySchema,
  CreateCategoryRequestSchema,
  ListCategoriesResponseSchema,
  UpdateCategoryRequestSchema,
  type CreateCategoryRequest,
  type UpdateCategoryRequest,
} from '../src/index.js';

const validCategory = {
  id: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
  householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
  kind: 'EXPENSE',
  parentId: null,
  name: 'Groceries',
  icon: 'shopping-cart',
  color: '#1C4F47',
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

describe('M2 category contracts', () => {
  it('trims category names and rejects extra fields on create', () => {
    expect(
      CreateCategoryRequestSchema.parse({
        kind: 'EXPENSE',
        name: '  Groceries ',
        icon: 'shopping-cart',
        color: '#1C4F47',
      }),
    ).toEqual({
      kind: 'EXPENSE',
      name: 'Groceries',
      icon: 'shopping-cart',
      color: '#1C4F47',
    });
    expect(
      CreateCategoryRequestSchema.safeParse({
        kind: 'EXPENSE',
        name: 'Groceries',
        icon: 'shopping-cart',
        color: '#1C4F47',
        householdId: '7f9d2c2a-16b1-4a4a-9d43-2f3f2c9c0a11',
      }).success,
    ).toBe(false);
    expectTypeOf<CreateCategoryRequest['kind']>().toEqualTypeOf<'EXPENSE' | 'INCOME'>();
  });

  it('accepts an optional parent id and sort order on create', () => {
    expect(
      CreateCategoryRequestSchema.parse({
        kind: 'EXPENSE',
        name: 'Supermarket',
        icon: 'store',
        color: '#B4632F',
        parentId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
        sortOrder: 3,
      }),
    ).toEqual({
      kind: 'EXPENSE',
      name: 'Supermarket',
      icon: 'store',
      color: '#B4632F',
      parentId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
      sortOrder: 3,
    });
  });

  it('rejects invalid create payloads', () => {
    const base = {
      kind: 'EXPENSE',
      name: 'Groceries',
      icon: 'shopping-cart',
      color: '#1C4F47',
    };

    expect(CreateCategoryRequestSchema.safeParse({ ...base, kind: 'TRANSFER' }).success).toBe(
      false,
    );
    expect(CreateCategoryRequestSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
    expect(CreateCategoryRequestSchema.safeParse({ ...base, name: 'a'.repeat(101) }).success).toBe(
      false,
    );
    expect(CreateCategoryRequestSchema.safeParse({ ...base, name: 'a'.repeat(100) }).success).toBe(
      true,
    );
    expect(CreateCategoryRequestSchema.safeParse({ ...base, color: 'green' }).success).toBe(false);
    expect(CreateCategoryRequestSchema.safeParse({ ...base, parentId: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(CreateCategoryRequestSchema.safeParse({ ...base, sortOrder: 1.5 }).success).toBe(false);
    expect(CreateCategoryRequestSchema.safeParse({ ...base, sortOrder: -1 }).success).toBe(false);
  });

  it('allows partial updates including archiving', () => {
    expect(UpdateCategoryRequestSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(UpdateCategoryRequestSchema.parse({ name: '  Food ', sortOrder: 2 })).toEqual({
      name: 'Food',
      sortOrder: 2,
    });
    expect(UpdateCategoryRequestSchema.parse({ parentId: null })).toEqual({ parentId: null });
    expect(UpdateCategoryRequestSchema.safeParse({ kind: 'INCOME' }).success).toBe(false);
    expect(UpdateCategoryRequestSchema.safeParse({ name: '' }).success).toBe(false);
    expectTypeOf<UpdateCategoryRequest['isActive']>().toEqualTypeOf<boolean | undefined>();
  });

  it('keeps category entities strict', () => {
    expect(CategorySchema.parse(validCategory)).toEqual(validCategory);
    expect(CategorySchema.safeParse({ ...validCategory, deletedAt: null }).success).toBe(false);
    expect(CategorySchema.safeParse({ ...validCategory, createdAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  it('lists categories under a categories key', () => {
    expect(ListCategoriesResponseSchema.parse({ categories: [validCategory] })).toEqual({
      categories: [validCategory],
    });
    expect(
      ListCategoriesResponseSchema.safeParse({ categories: [validCategory], total: 1 }).success,
    ).toBe(false);
  });
});
