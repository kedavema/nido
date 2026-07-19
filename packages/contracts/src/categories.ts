import { CATEGORY_KINDS } from '@nido/domain-types';
import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './identity.js';

export const CategoryKindSchema = z.enum(CATEGORY_KINDS);

export const CategoryNameSchema = z.string().trim().min(1).max(100);

export const CategoryIconSchema = z.string().trim().min(1).max(50);

export const CategoryColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);

export const CategorySortOrderSchema = z.int().min(0);

export const CategorySchema = z.strictObject({
  id: UuidSchema,
  householdId: UuidSchema,
  kind: CategoryKindSchema,
  parentId: UuidSchema.nullable(),
  name: CategoryNameSchema,
  icon: CategoryIconSchema,
  color: CategoryColorSchema,
  sortOrder: CategorySortOrderSchema,
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CreateCategoryRequestSchema = z.strictObject({
  kind: CategoryKindSchema,
  name: CategoryNameSchema,
  icon: CategoryIconSchema,
  color: CategoryColorSchema,
  parentId: UuidSchema.optional(),
  sortOrder: CategorySortOrderSchema.optional(),
});

export const UpdateCategoryRequestSchema = z.strictObject({
  name: CategoryNameSchema.optional(),
  icon: CategoryIconSchema.optional(),
  color: CategoryColorSchema.optional(),
  parentId: UuidSchema.nullable().optional(),
  sortOrder: CategorySortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});

export const CreateCategoryResponseSchema = z.strictObject({
  category: CategorySchema,
});

export const UpdateCategoryResponseSchema = CreateCategoryResponseSchema;

export const ListCategoriesResponseSchema = z.strictObject({
  categories: z.array(CategorySchema),
});

export type CategoryKind = z.infer<typeof CategoryKindSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequestSchema>;
export type CreateCategoryResponse = z.infer<typeof CreateCategoryResponseSchema>;
export type UpdateCategoryResponse = z.infer<typeof UpdateCategoryResponseSchema>;
export type ListCategoriesResponse = z.infer<typeof ListCategoriesResponseSchema>;
