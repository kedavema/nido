import type { DeviceCredential, NotificationChannel } from '@nido/contracts';

export const PUSH_SENDERS = Symbol('PUSH_SENDERS');

/**
 * What the dispatcher hands a channel adapter. The credential is already decrypted, because only
 * the adapter knows how to talk to its provider — but it never leaves this object.
 */
export interface PushTarget {
  /** The `device_installations` row id, so a rejected credential can be deactivated. */
  readonly deviceId: string;
  readonly credential: DeviceCredential;
}

/**
 * Deliberately poor: this is rendered on a lock screen, so it carries no amount, no rule
 * description and no token (docs/system-design.md §13). `occurrenceId` is only there to build the
 * deep link, and the app resolves the details itself once the user is authenticated.
 */
export interface PushMessage {
  readonly title: string;
  readonly body: string;
  readonly occurrenceId: string;
}

/**
 * Outcome classes, not provider strings (ADR 0012). Mapping a provider's vocabulary onto these
 * four is the adapter's job, so the dispatcher's retry policy never learns a provider's grammar.
 */
export type PushSendResult =
  | { readonly kind: 'sent' }
  /** Quota, rate limit, 5xx, timeout — worth another attempt while the ceiling allows it. */
  | { readonly kind: 'transient' }
  /** Malformed or rejected in a way retrying cannot fix. */
  | { readonly kind: 'permanent' }
  /** The device is gone: unregistered token, or a subscription the push service returned 404/410 for. */
  | { readonly kind: 'invalid_credential' };

export interface PushSender {
  readonly channel: NotificationChannel;
  send(target: PushTarget, message: PushMessage): Promise<PushSendResult>;
}

/** Copy derived purely from the offset, so no financial data can leak into a notification. */
export function buildPushMessage(offsetDays: number, occurrenceId: string): PushMessage {
  if (offsetDays === 0) {
    return { title: 'Vence hoy', body: 'Tenés un gasto fijo que vence hoy.', occurrenceId };
  }
  if (offsetDays === 1) {
    return { title: 'Vence mañana', body: 'Tenés un gasto fijo que vence mañana.', occurrenceId };
  }
  return {
    title: `Vence en ${String(offsetDays)} días`,
    body: 'Tenés un gasto fijo próximo a vencer.',
    occurrenceId,
  };
}
