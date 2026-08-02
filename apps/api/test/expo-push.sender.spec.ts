import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyExpoError, ExpoPushSender } from '../src/notifications/expo-push.sender.js';
import type { PushMessage, PushTarget } from '../src/notifications/push-sender.js';

const target: PushTarget = {
  deviceId: '0b2b1f7a-2f8d-4a6b-8f1e-9c7d6e5f4a3b',
  credential: { kind: 'EXPO', token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' },
};

const message: PushMessage = {
  title: 'Vence hoy',
  body: 'Tenés un gasto fijo que vence hoy.',
  occurrenceId: '4ddf0a0a-63de-4aaa-b6b2-4934320baade',
};

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, ...response } as Response)),
  );
}

function ticketResponse(ticket: unknown): void {
  stubFetch({ json: () => Promise.resolve({ data: [ticket] }) });
}

describe('ExpoPushSender', () => {
  const sender = new ExpoPushSender();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports sent when Expo accepts the ticket', async () => {
    ticketResponse({ status: 'ok', id: 'ticket-1' });

    await expect(sender.send(target, message)).resolves.toEqual({ kind: 'sent' });
  });

  it('sends the Android channel, high priority, and only the deep-link data', async () => {
    ticketResponse({ status: 'ok', id: 'ticket-1' });

    await sender.send(target, message);

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '');
    expect(body).toEqual([
      {
        to: target.credential.kind === 'EXPO' ? target.credential.token : '',
        title: 'Vence hoy',
        body: 'Tenés un gasto fijo que vence hoy.',
        channelId: 'default',
        priority: 'high',
        data: { kind: 'occurrence_due', occurrenceId: message.occurrenceId },
      },
    ]);
  });

  it('gives up on a hung request rather than holding the claim open', async () => {
    // A stalled provider must not keep a delivery in SENDING until the reclaim timeout.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('The operation was aborted.', 'TimeoutError'))),
    );

    await expect(sender.send(target, message)).resolves.toEqual({ kind: 'transient' });
  });

  it('treats a network failure as worth another attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );

    await expect(sender.send(target, message)).resolves.toEqual({ kind: 'transient' });
  });

  it.each([
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
    [400, 'permanent'],
    [404, 'permanent'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    stubFetch({ ok: false, status, json: () => Promise.resolve({}) });

    await expect(sender.send(target, message)).resolves.toEqual({ kind });
  });

  it('treats an unreadable body as transient', async () => {
    stubFetch({ json: () => Promise.reject(new SyntaxError('Unexpected token')) });

    await expect(sender.send(target, message)).resolves.toEqual({ kind: 'transient' });
  });

  it('accepts a single ticket object as well as an array', async () => {
    stubFetch({ json: () => Promise.resolve({ data: { status: 'ok', id: 'ticket-1' } }) });

    await expect(sender.send(target, message)).resolves.toEqual({ kind: 'sent' });
  });

  it('refuses a credential that is not an Expo token', async () => {
    stubFetch({ json: () => Promise.resolve({ data: [{ status: 'ok' }] }) });

    const webPush = await sender.send(
      {
        deviceId: target.deviceId,
        credential: {
          kind: 'WEB_PUSH',
          endpoint: 'https://push.example/x',
          keys: { p256dh: 'BLc4', auth: 'tBHI' },
        },
      },
      message,
    );

    expect(webPush).toEqual({ kind: 'permanent' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a dead device from its ticket', async () => {
    ticketResponse({ status: 'error', details: { error: 'DeviceNotRegistered' } });

    // The dispatcher retires the installation on this result, so the token stops being used.
    await expect(sender.send(target, message)).resolves.toEqual({ kind: 'invalid_credential' });
  });
});

describe('classifyExpoError', () => {
  it.each([
    ['DeviceNotRegistered', 'invalid_credential'],
    ['MessageRateExceeded', 'transient'],
    ['MessageTooBig', 'permanent'],
    ['InvalidCredentials', 'permanent'],
    ['MismatchSenderId', 'permanent'],
  ])('maps %s to %s', (error, kind) => {
    expect(classifyExpoError(error)).toEqual({ kind });
  });

  it.each([undefined, 'SomethingExpoAddedLater'])(
    'gives an unrecognized error %s the benefit of the doubt',
    (error) => {
      // Bounded by the three-attempt ceiling, so an unknown error cannot retry forever.
      expect(classifyExpoError(error)).toEqual({ kind: 'transient' });
    },
  );
});
