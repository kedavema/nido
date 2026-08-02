import type { NotificationChannel } from '@nido/contracts';

export const NOTIFICATION_DELIVERIES_REPOSITORY = Symbol('NOTIFICATION_DELIVERIES_REPOSITORY');

/** Max attempts per delivery (ADR 0012); the schema enforces the same ceiling. */
export const MAX_DELIVERY_ATTEMPTS = 3;

/** How long a claimed row may sit in SENDING before it is treated as an abandoned claim. */
export const CLAIM_TIMEOUT_MINUTES = 15;

export interface ClaimedDelivery {
  readonly id: string;
  readonly userId: string;
  readonly occurrenceId: string;
  readonly offsetDays: number;
  /** Already incremented by the claim, so this is the attempt being made right now. */
  readonly attempts: number;
}

export interface StoredInstallation {
  readonly deviceId: string;
  readonly installationId: string;
  readonly channel: NotificationChannel;
  readonly credentialCiphertext: string;
}

export type DeliveryOutcome =
  | { readonly kind: 'sent' }
  | {
      readonly kind: 'failed';
      readonly errorKind: 'TRANSIENT' | 'PERMANENT' | 'INVALID_CREDENTIAL';
    }
  | { readonly kind: 'retry'; readonly errorKind: 'TRANSIENT' };

export interface NotificationDeliveriesRepository {
  /**
   * Atomically claims up to `limit` deliveries that are due. Uses `FOR UPDATE SKIP LOCKED`, so two
   * concurrent runs — the cron and an app open, or two cron invocations — never claim the same
   * row. Attempts are incremented here rather than on failure, so a process that dies mid-send has
   * already consumed its attempt and the ceiling holds across a crash.
   *
   * Rows stuck in SENDING past the claim timeout are picked up again by the same query, which is
   * the crash recovery path; it does not hand back the attempt they already spent.
   */
  claim(now: Date, limit: number, householdId?: string): Promise<readonly ClaimedDelivery[]>;

  /** Active installations of a user, with their still-encrypted credential. */
  findActiveInstallations(userId: string): Promise<readonly StoredInstallation[]>;

  finalize(deliveryId: string, outcome: DeliveryOutcome, now: Date): Promise<void>;

  /** Retires an installation whose credential the provider rejected as gone. */
  deactivateInstallation(deviceId: string, now: Date): Promise<void>;
}
