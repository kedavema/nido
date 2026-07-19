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
