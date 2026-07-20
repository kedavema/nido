import type { PaymentSourceType } from '@nido/domain-types';

export interface PaymentSourceRecord {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly type: PaymentSourceType;
  readonly ownerUserId: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePaymentSourceRecordInput {
  readonly householdId: string;
  readonly name: string;
  readonly type: PaymentSourceType;
  readonly ownerUserId: string | null;
}

export interface UpdatePaymentSourceRecordChanges {
  readonly name?: string;
  readonly type?: PaymentSourceType;
  readonly ownerUserId?: string | null;
  readonly isActive?: boolean;
}
