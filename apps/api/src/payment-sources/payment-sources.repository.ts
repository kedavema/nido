import type {
  CreatePaymentSourceRecordInput,
  PaymentSourceRecord,
  UpdatePaymentSourceRecordChanges,
} from './payment-source.js';

export const PAYMENT_SOURCES_REPOSITORY = Symbol('PAYMENT_SOURCES_REPOSITORY');

/** The owner row vanished between validation and the write (foreign key race). */
export class PaymentSourceOwnerMissingError extends Error {}

/**
 * The row cannot be hard-deleted because other rows still reference it.
 * Nothing references payment sources until M3 transactions arrive, but the
 * delete flow already archives on this error so M3 only adds the reference.
 */
export class PaymentSourceInUseError extends Error {}

export interface PaymentSourcesRepository {
  listForHousehold(householdId: string): Promise<readonly PaymentSourceRecord[]>;
  findInHousehold(
    householdId: string,
    paymentSourceId: string,
  ): Promise<PaymentSourceRecord | null>;
  create(input: CreatePaymentSourceRecordInput): Promise<PaymentSourceRecord>;
  update(
    householdId: string,
    paymentSourceId: string,
    changes: UpdatePaymentSourceRecordChanges,
  ): Promise<PaymentSourceRecord | null>;
  archive(householdId: string, paymentSourceId: string): Promise<PaymentSourceRecord | null>;
  deleteById(householdId: string, paymentSourceId: string): Promise<boolean>;
}
