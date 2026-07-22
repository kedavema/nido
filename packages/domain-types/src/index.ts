export const SUPPORTED_CURRENCY_CODES = ['PYG', 'USD'] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export const NIDO_TIME_ZONE = 'America/Asuncion' as const;

export type NidoTimeZone = typeof NIDO_TIME_ZONE;

export const HOUSEHOLD_ROLES = ['OWNER', 'MEMBER'] as const;

export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const HOUSEHOLD_MEMBER_STATUSES = ['ACTIVE', 'REMOVED'] as const;

export type HouseholdMemberStatus = (typeof HOUSEHOLD_MEMBER_STATUSES)[number];

export const CATEGORY_KINDS = ['EXPENSE', 'INCOME'] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const PAYMENT_SOURCE_TYPES = [
  'BANK_ACCOUNT',
  'CASH',
  'CREDIT_CARD',
  'DIGITAL_WALLET',
  'OTHER',
] as const;

export type PaymentSourceType = (typeof PAYMENT_SOURCE_TYPES)[number];

export const TRANSACTION_TYPES = ['EXPENSE', 'INCOME'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_ORIGINS = ['MANUAL', 'IMPORT', 'RECURRING'] as const;

export type TransactionOrigin = (typeof TRANSACTION_ORIGINS)[number];

export const FREQUENCY_KINDS = ['ONE_TIME', 'MONTHLY', 'YEARLY', 'EVERY_N_MONTHS'] as const;

export type FrequencyKind = (typeof FREQUENCY_KINDS)[number];

export { calculateOccurrenceDueDate } from './frequency.js';
