import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@nido/contracts';
import { sendNotification, WebPushError } from 'web-push';

import type { PushMessage, PushSender, PushSendResult, PushTarget } from './push-sender.js';
import { VAPID_KEYS, type VapidKeys } from './vapid-keys.js';

/**
 * A due-date reminder that arrives days late is noise, so it expires rather than being held by the
 * push service until the device reconnects.
 */
const TTL_SECONDS = 12 * 60 * 60;

/**
 * Web Push behind the `PushSender` port. Unlike the Expo adapter this one does use a library: the
 * ECDH/AES128GCM encryption of RFC 8291 is not something to hand-roll. The dependency stays inside
 * this file, so the domain never sees it (ADR 0004).
 */
@Injectable()
export class WebPushSender implements PushSender {
  readonly channel: NotificationChannel = 'WEB_PUSH';

  constructor(
    @Inject(VAPID_KEYS)
    private readonly vapid: VapidKeys | null,
  ) {}

  async send(target: PushTarget, message: PushMessage): Promise<PushSendResult> {
    if (target.credential.kind !== 'WEB_PUSH') {
      return { kind: 'permanent' };
    }
    if (this.vapid === null) {
      // Fail closed (ADR 0004): unconfigured is not a temporary outage, and retrying would only
      // spend attempts on a channel that cannot work until someone changes the deployment.
      return { kind: 'permanent' };
    }

    try {
      await sendNotification(
        {
          endpoint: target.credential.endpoint,
          keys: { p256dh: target.credential.keys.p256dh, auth: target.credential.keys.auth },
        },
        // The service worker reads exactly these fields. No amount, description or token.
        JSON.stringify({
          title: message.title,
          body: message.body,
          occurrenceId: message.occurrenceId,
        }),
        {
          TTL: TTL_SECONDS,
          vapidDetails: {
            subject: this.vapid.subject,
            publicKey: this.vapid.publicKey,
            privateKey: this.vapid.privateKey,
          },
        },
      );
      return { kind: 'sent' };
    } catch (error) {
      return classifyWebPushError(error);
    }
  }
}

/** Maps push-service responses onto the four outcome classes the dispatcher understands. */
export function classifyWebPushError(error: unknown): PushSendResult {
  if (!(error instanceof WebPushError)) {
    // No status code means the request never got an answer: DNS, TLS, socket, timeout.
    return { kind: 'transient' };
  }

  const { statusCode } = error;
  if (statusCode === 404 || statusCode === 410) {
    // RFC 8030: the subscription is gone. The browser cleared it or the user uninstalled the PWA,
    // so the installation is retired rather than retried.
    return { kind: 'invalid_credential' };
  }
  if (statusCode === 429 || statusCode >= 500) {
    return { kind: 'transient' };
  }
  // 413 (payload too large), 400 (malformed), 403 (VAPID rejected): all describe what we sent.
  return { kind: 'permanent' };
}
