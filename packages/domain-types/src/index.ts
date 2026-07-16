export const SUPPORTED_CURRENCY_CODES = ['PYG', 'USD'] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export const NIDO_TIME_ZONE = 'America/Asuncion' as const;

export type NidoTimeZone = typeof NIDO_TIME_ZONE;
