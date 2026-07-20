import { Injectable } from '@nestjs/common';
import { PAYMENT_SOURCE_TYPES, type PaymentSourceType } from '@nido/domain-types';

import { PrismaService } from '../database/prisma.service.js';
import type {
  CreatePaymentSourceRecordInput,
  PaymentSourceRecord,
  UpdatePaymentSourceRecordChanges,
} from './payment-source.js';
import {
  PaymentSourceInUseError,
  PaymentSourceOwnerMissingError,
  type PaymentSourcesRepository,
} from './payment-sources.repository.js';

const OWNER_FOREIGN_KEY = 'payment_sources_owner_user_id_fkey';
const FOREIGN_KEY_VIOLATION_CODE = '23503';
// ON DELETE RESTRICT raises restrict_violation (23001), not foreign_key_violation
// (23503), when a dependent row blocks the delete.
const RESTRICT_VIOLATION_CODE = '23001';

@Injectable()
export class PrismaPaymentSourcesRepository implements PaymentSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForHousehold(householdId: string): Promise<readonly PaymentSourceRecord[]> {
    const paymentSources = await this.prisma.paymentSource.findMany({
      where: { householdId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return paymentSources.map(toPaymentSourceRecord);
  }

  async findInHousehold(
    householdId: string,
    paymentSourceId: string,
  ): Promise<PaymentSourceRecord | null> {
    const paymentSource = await this.prisma.paymentSource.findFirst({
      where: { id: paymentSourceId, householdId },
    });
    return paymentSource === null ? null : toPaymentSourceRecord(paymentSource);
  }

  async create(input: CreatePaymentSourceRecordInput): Promise<PaymentSourceRecord> {
    try {
      const paymentSource = await this.prisma.paymentSource.create({
        data: {
          householdId: input.householdId,
          name: input.name,
          type: input.type,
          ownerUserId: input.ownerUserId,
        },
      });
      return toPaymentSourceRecord(paymentSource);
    } catch (error) {
      throw translateWriteError(error);
    }
  }

  async update(
    householdId: string,
    paymentSourceId: string,
    changes: UpdatePaymentSourceRecordChanges,
  ): Promise<PaymentSourceRecord | null> {
    try {
      const paymentSource = await this.prisma.paymentSource.update({
        where: { id: paymentSourceId, householdId },
        data: changes,
      });
      return toPaymentSourceRecord(paymentSource);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw translateWriteError(error);
    }
  }

  async archive(householdId: string, paymentSourceId: string): Promise<PaymentSourceRecord | null> {
    try {
      const paymentSource = await this.prisma.paymentSource.update({
        where: { id: paymentSourceId, householdId },
        data: { isActive: false },
      });
      return toPaymentSourceRecord(paymentSource);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteById(householdId: string, paymentSourceId: string): Promise<boolean> {
    try {
      await this.prisma.paymentSource.delete({ where: { id: paymentSourceId, householdId } });
      return true;
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return false;
      }
      if (isForeignKeyError(error)) {
        throw new PaymentSourceInUseError('Payment source is still referenced by other rows');
      }
      throw error;
    }
  }
}

function toPaymentSourceRecord(paymentSource: {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly type: string;
  readonly ownerUserId: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): PaymentSourceRecord {
  return {
    id: paymentSource.id,
    householdId: paymentSource.householdId,
    name: paymentSource.name,
    type: toPaymentSourceType(paymentSource.type),
    ownerUserId: paymentSource.ownerUserId,
    isActive: paymentSource.isActive,
    createdAt: paymentSource.createdAt,
    updatedAt: paymentSource.updatedAt,
  };
}

function toPaymentSourceType(value: string): PaymentSourceType {
  if ((PAYMENT_SOURCE_TYPES as readonly string[]).includes(value)) {
    return value as PaymentSourceType;
  }
  throw new Error('Unsupported payment source type');
}

/**
 * Maps database-level failures to domain errors as a backstop for races that
 * slip past the service pre-checks. The membership guard pins the household,
 * so the only foreign key a create/update can trip is the informative owner
 * (`owner_user_id`) whose row vanished after the membership pre-check.
 */
function translateWriteError(error: unknown): unknown {
  if (isForeignKeyError(error)) {
    return new PaymentSourceOwnerMissingError('Payment source owner no longer exists');
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
    hasPostgresCode(error, RESTRICT_VIOLATION_CODE) ||
    collectErrorText(error).includes(OWNER_FOREIGN_KEY)
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
