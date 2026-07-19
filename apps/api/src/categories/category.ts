import type { CategoryKind } from '@nido/domain-types';

export interface CategoryRecord {
  readonly id: string;
  readonly householdId: string;
  readonly kind: CategoryKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCategoryRecordInput {
  readonly householdId: string;
  readonly kind: CategoryKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number | undefined;
}

export interface UpdateCategoryRecordChanges {
  readonly name?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
  readonly isActive?: boolean;
}
