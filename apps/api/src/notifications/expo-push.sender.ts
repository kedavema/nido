import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@nido/contracts';

import type { PushMessage, PushSender, PushSendResult, PushTarget } from './push-sender.js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * The free API instance sleeps and providers stall; a hung request must not hold a claim open
 * until the fifteen-minute reclaim timeout, so the adapter gives up first and reports transient.
 */
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

/** Android notification channel created by the client at registration time. */
const ANDROID_CHANNEL_ID = 'default';

interface ExpoTicket {
  readonly status?: string;
  readonly details?: { readonly error?: string };
}

interface ExpoResponse {
  readonly data?: ExpoTicket | readonly ExpoTicket[];
}

/**
 * Expo Push behind the `PushSender` port. Deliberately a plain `fetch` rather than
 * `expo-server-sdk`: the endpoint is one unauthenticated HTTPS POST, and keeping it here means the
 * only place that knows Expo's vocabulary is this file (ADR 0004).
 */
@Injectable()
export class ExpoPushSender implements PushSender {
  readonly channel: NotificationChannel = 'EXPO';

  async send(target: PushTarget, message: PushMessage): Promise<PushSendResult> {
    if (target.credential.kind !== 'EXPO') {
      return { kind: 'permanent' };
    }

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify([
          {
            to: target.credential.token,
            title: message.title,
            body: message.body,
            channelId: ANDROID_CHANNEL_ID,
            priority: 'high',
            // Only what the deep link needs. No amount, description or token ever goes here.
            data: { kind: 'occurrence_due', occurrenceId: message.occurrenceId },
          },
        ]),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch {
      // Network failure, DNS, or the timeout above: nothing here says the message is unsendable,
      // only that this attempt did not get through.
      return { kind: 'transient' };
    }

    if (!response.ok) {
      // 429 and 5xx are worth another attempt; any other 4xx is a request we built wrong, and
      // building it the same way again would fail identically.
      return response.status === 429 || response.status >= 500
        ? { kind: 'transient' }
        : { kind: 'permanent' };
    }

    let ticket: ExpoTicket | undefined;
    try {
      const payload = (await response.json()) as ExpoResponse;
      const tickets = payload.data;
      ticket = tickets === undefined || !isTicketList(tickets) ? tickets : tickets[0];
    } catch {
      return { kind: 'transient' };
    }

    if (ticket === undefined) {
      return { kind: 'transient' };
    }
    if (ticket.status === 'ok') {
      // "ok" means Expo accepted it, not that the phone showed it. Receipts would tell us more,
      // but they need a second round trip and a store; the retry ceiling already bounds the cost
      // of being wrong here.
      return { kind: 'sent' };
    }

    return classifyExpoError(ticket.details?.error);
  }
}

/** Expo answers a single message with either a lone ticket or a one-element list. */
function isTicketList(value: ExpoTicket | readonly ExpoTicket[]): value is readonly ExpoTicket[] {
  return Array.isArray(value);
}

/** Maps Expo's error vocabulary onto the four outcome classes the dispatcher understands. */
export function classifyExpoError(error: string | undefined): PushSendResult {
  switch (error) {
    case undefined:
      // Bounded by the attempt ceiling, so a ticket with no error code cannot retry forever.
      return { kind: 'transient' };
    case 'DeviceNotRegistered':
      // The device uninstalled the app or revoked the token: the row can never work again.
      return { kind: 'invalid_credential' };
    case 'MessageRateExceeded':
      return { kind: 'transient' };
    case 'MessageTooBig':
    case 'InvalidCredentials':
    case 'MismatchSenderId':
      // Our own configuration or payload is wrong; sending the same thing again cannot fix it.
      return { kind: 'permanent' };
    default:
      // Unknown provider-side errors get the benefit of the doubt, bounded by the attempt ceiling.
      return { kind: 'transient' };
  }
}
