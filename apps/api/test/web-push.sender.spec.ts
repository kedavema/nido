import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type * as WebPushModule from 'web-push';
import { WebPushError } from 'web-push';

import { NotificationsController } from '../src/notifications/notifications.controller.js';
import type { PushMessage, PushTarget } from '../src/notifications/push-sender.js';
import { createVapidKeys, type VapidKeys } from '../src/notifications/vapid-keys.js';
import { classifyWebPushError, WebPushSender } from '../src/notifications/web-push.sender.js';

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock('web-push', async () => {
  const actual = await vi.importActual<typeof WebPushModule>('web-push');
  return { ...actual, sendNotification };
});

const vapid: VapidKeys = {
  publicKey: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo4M0gs0i1oEKgPpWG5Kb3sVjA',
  privateKey: 'kzB1kU7cUlEgU4wnJq7hLHTEPPPWBUxIkq7wRFvOO7c',
  subject: 'mailto:hola@nido.example',
};

const target: PushTarget = {
  deviceId: '0b2b1f7a-2f8d-4a6b-8f1e-9c7d6e5f4a3b',
  credential: {
    kind: 'WEB_PUSH',
    endpoint: 'https://web.push.apple.com/QWERTY-abc_123',
    keys: { p256dh: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo', auth: 'tBHItJI5svbpez7KI4CCXg' },
  },
};

const message: PushMessage = {
  title: 'Vence mañana',
  body: 'Tenés un gasto fijo que vence mañana.',
  occurrenceId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
};

function webPushError(statusCode: number): WebPushError {
  return new WebPushError('rejected', statusCode, {}, '', target.credential.kind);
}

describe('WebPushSender', () => {
  it('encrypts and sends the subscription payload', async () => {
    sendNotification.mockResolvedValueOnce({ statusCode: 201 });

    await expect(new WebPushSender(vapid).send(target, message)).resolves.toEqual({ kind: 'sent' });

    const [subscription, payload, options] = sendNotification.mock.calls[0] ?? [];
    expect(subscription).toEqual({
      endpoint: 'https://web.push.apple.com/QWERTY-abc_123',
      keys: { p256dh: 'BLc4xRzKlKORKWlbdgFaBrrPK3ydWAHo', auth: 'tBHItJI5svbpez7KI4CCXg' },
    });
    // Exactly the three fields the service worker reads — no amount, description or token.
    expect(JSON.parse(String(payload))).toEqual({
      title: 'Vence mañana',
      body: 'Tenés un gasto fijo que vence mañana.',
      occurrenceId: message.occurrenceId,
    });
    expect(options).toMatchObject({ TTL: 43_200, vapidDetails: vapid });
  });

  it('expires rather than being held for days', async () => {
    sendNotification.mockResolvedValueOnce({ statusCode: 201 });

    await new WebPushSender(vapid).send(target, message);

    // A due-date reminder delivered three days late is noise, not a reminder.
    const options = sendNotification.mock.calls[0]?.[2] as { TTL: number };
    expect(options.TTL).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it('fails closed when VAPID is not configured', async () => {
    sendNotification.mockClear();
    const result = await new WebPushSender(null).send(target, message);

    // Unconfigured is not a temporary outage, so retrying would only spend attempts on a channel
    // that cannot work until the deployment changes.
    expect(result).toEqual({ kind: 'permanent' });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('refuses a credential from the other channel', async () => {
    const result = await new WebPushSender(vapid).send(
      {
        deviceId: target.deviceId,
        credential: { kind: 'EXPO', token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' },
      },
      message,
    );

    expect(result).toEqual({ kind: 'permanent' });
  });

  it('reports a gone subscription so the installation is retired', async () => {
    sendNotification.mockRejectedValueOnce(webPushError(410));

    await expect(new WebPushSender(vapid).send(target, message)).resolves.toEqual({
      kind: 'invalid_credential',
    });
  });
});

describe('classifyWebPushError', () => {
  it.each([
    [404, 'invalid_credential'],
    [410, 'invalid_credential'],
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
    [400, 'permanent'],
    [403, 'permanent'],
    [413, 'permanent'],
  ])('maps status %i to %s', (statusCode, kind) => {
    expect(classifyWebPushError(webPushError(statusCode))).toEqual({ kind });
  });

  it('treats an error with no status code as a request that never got an answer', () => {
    // DNS, TLS, socket or timeout: nothing here says the subscription is bad.
    expect(classifyWebPushError(new Error('socket hang up'))).toEqual({ kind: 'transient' });
  });
});

describe('createVapidKeys', () => {
  const complete = {
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: vapid.subject,
  };

  it('returns null when Web Push is simply not configured', () => {
    expect(createVapidKeys({})).toBeNull();
  });

  it('builds the pair when all three are present', () => {
    expect(createVapidKeys(complete)).toEqual(vapid);
  });

  it('rejects a half-configured pair', () => {
    expect(() => createVapidKeys({ VAPID_PUBLIC_KEY: vapid.publicKey })).toThrow(
      /configured together/u,
    );
  });

  it('rejects a subject that is not a mailto or https contact', () => {
    // RFC 8292: push services use it to reach us about a misbehaving sender.
    expect(() => createVapidKeys({ ...complete, VAPID_SUBJECT: 'nido' })).toThrow(/mailto:/u);
  });
});

describe('NotificationsController', () => {
  it('serves only the public half of the pair', () => {
    const response = new NotificationsController(vapid).getVapidPublicKey();

    expect(response).toEqual({ publicKey: vapid.publicKey });
    expect(JSON.stringify(response)).not.toContain(vapid.privateKey);
  });

  it('answers unavailable when Web Push is not configured', () => {
    expect(() => new NotificationsController(null).getVapidPublicKey()).toThrow(
      ServiceUnavailableException,
    );
  });
});
