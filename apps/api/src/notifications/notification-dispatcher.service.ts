import { Inject, Injectable } from '@nestjs/common';
import type { DeviceCredential, NotificationChannel } from '@nido/contracts';

import { CLOCK, type Clock } from '../common/clock.js';
import {
  CREDENTIAL_CIPHER,
  credentialAad,
  CredentialDecryptionError,
  type CredentialCipher,
} from './credential-cipher.js';
import {
  MAX_DELIVERY_ATTEMPTS,
  NOTIFICATION_DELIVERIES_REPOSITORY,
  type ClaimedDelivery,
  type DeliveryOutcome,
  type NotificationDeliveriesRepository,
  type StoredInstallation,
} from './notification-deliveries.repository.js';
import {
  buildPushMessage,
  PUSH_SENDERS,
  type PushSender,
  type PushSendResult,
} from './push-sender.js';

export interface DispatchSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly failed: number;
}

const NOTHING_DISPATCHED: DispatchSummary = { claimed: 0, sent: 0, failed: 0 };

@Injectable()
export class NotificationDispatcherService {
  private readonly sendersByChannel: ReadonlyMap<NotificationChannel, PushSender>;

  constructor(
    @Inject(NOTIFICATION_DELIVERIES_REPOSITORY)
    private readonly deliveries: NotificationDeliveriesRepository,
    @Inject(PUSH_SENDERS)
    senders: readonly PushSender[],
    @Inject(CREDENTIAL_CIPHER)
    private readonly cipher: CredentialCipher | null,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {
    this.sendersByChannel = new Map(senders.map((sender) => [sender.channel, sender]));
  }

  async dispatch(options: { householdId?: string; limit: number }): Promise<DispatchSummary> {
    // No keyring means no credential can be opened, so there is nothing to send and nothing to
    // usefully retry. Claiming here would only burn attempts on a misconfiguration (ADR 0004).
    if (this.cipher === null) {
      return NOTHING_DISPATCHED;
    }

    const now = this.clock.now();
    const claimed = await this.deliveries.claim(now, options.limit, options.householdId);

    let sent = 0;
    let failed = 0;
    for (const delivery of claimed) {
      const outcome = await this.deliver(delivery, this.cipher, now);
      await this.deliveries.finalize(delivery.id, outcome, now);
      if (outcome.kind === 'sent') {
        sent += 1;
      } else if (outcome.kind === 'failed') {
        failed += 1;
      }
    }

    return { claimed: claimed.length, sent, failed };
  }

  private async deliver(
    delivery: ClaimedDelivery,
    cipher: CredentialCipher,
    now: Date,
  ): Promise<DeliveryOutcome> {
    const installations = await this.deliveries.findActiveInstallations(delivery.userId);
    if (installations.length === 0) {
      // Nothing to retry against: the responsible user has no active device. Retrying would just
      // spend the remaining attempts re-discovering the same emptiness.
      return { kind: 'failed', errorKind: 'PERMANENT' };
    }

    const message = buildPushMessage(delivery.offsetDays, delivery.occurrenceId);
    let anySent = false;
    let anyTransient = false;

    for (const installation of installations) {
      const result = await this.sendTo(installation, message, cipher);
      if (result.kind === 'sent') {
        anySent = true;
      } else if (result.kind === 'transient') {
        anyTransient = true;
      } else if (result.kind === 'invalid_credential') {
        // The device is gone. Retire it so it stops being fanned out to, and so the user's next
        // registration is not blocked by a stale active row.
        await this.deliveries.deactivateInstallation(installation.deviceId, now);
      }
    }

    // One accepting installation is enough: the reminder reached the person, which is what the
    // delivery represents. A sibling device that failed was already handled above.
    if (anySent) {
      return { kind: 'sent' };
    }
    if (anyTransient && delivery.attempts < MAX_DELIVERY_ATTEMPTS) {
      return { kind: 'retry', errorKind: 'TRANSIENT' };
    }
    return { kind: 'failed', errorKind: anyTransient ? 'TRANSIENT' : 'PERMANENT' };
  }

  private async sendTo(
    installation: StoredInstallation,
    message: ReturnType<typeof buildPushMessage>,
    cipher: CredentialCipher,
  ): Promise<PushSendResult> {
    const sender = this.sendersByChannel.get(installation.channel);
    if (sender === undefined) {
      return { kind: 'permanent' };
    }

    let credential: DeviceCredential;
    try {
      credential = parseCredential(
        installation.channel,
        cipher.decrypt(
          installation.credentialCiphertext,
          credentialAad(installation.installationId, installation.channel),
        ),
      );
    } catch (error) {
      if (error instanceof CredentialDecryptionError) {
        // An unopenable ciphertext is indistinguishable from a dead device from here — the row can
        // never be used again — so it takes the same path and the caller retires it.
        return { kind: 'invalid_credential' };
      }
      throw error;
    }

    return sender.send({ deviceId: installation.deviceId, credential }, message);
  }
}

/** Inverse of the serialization the registration path applies before sealing. */
export function parseCredential(channel: NotificationChannel, plaintext: string): DeviceCredential {
  if (channel === 'EXPO') {
    return { kind: 'EXPO', token: plaintext };
  }
  const parsed = JSON.parse(plaintext) as { endpoint: string; p256dh: string; auth: string };
  return {
    kind: 'WEB_PUSH',
    endpoint: parsed.endpoint,
    keys: { p256dh: parsed.p256dh, auth: parsed.auth },
  };
}
