import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createNidoApiClient, type FetchImplementation } from './client';

const meResponse = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ale@example.com',
    displayName: 'Ale',
    avatarUrl: null,
    timezone: 'America/Asuncion',
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
  },
  households: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Nido API client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends only the Firebase bearer token and validates a successful response', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(meResponse)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(client.getMe()).resolves.toEqual(meResponse);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/v1/me');
    expect(init).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer firebase-id-token',
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not make a request without an authenticated Firebase session', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(meResponse)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve(null),
      fetchImplementation,
    });

    await expect(client.getMe()).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'authentication',
      status: 401,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects malformed success payloads without exposing them in the error', async () => {
    const privatePayload = { unexpected: 'private-payload-value' };
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () => Promise.resolve(jsonResponse(privatePayload)),
    });

    await expect(client.getMe()).rejects.toBeInstanceOf(ApiError);

    try {
      await client.getMe();
    } catch (error) {
      expect((error as Error).message).not.toContain(privatePayload.unexpected);
    }
  });

  it('normalizes network and server failures to safe user-facing errors', async () => {
    const offlineClient = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () => Promise.reject(new Error('socket details must not escape')),
    });
    const forbiddenClient = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () =>
        Promise.resolve(jsonResponse({ message: 'sensitive detail' }, 403)),
    });

    await expect(offlineClient.getMe()).rejects.toMatchObject({ kind: 'network' });
    await expect(forbiddenClient.getMe()).rejects.toMatchObject({
      message: 'No tenés permiso para realizar esta acción.',
      status: 403,
    });
  });

  it('aborts and normalizes a request that exceeds its deadline', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<FetchImplementation>(() => new Promise(() => undefined));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
    });

    const assertion = expect(client.getMe()).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    const signal = fetchImplementation.mock.calls[0]?.[1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(true);
  });

  it('bounds Firebase token acquisition inside the same request deadline', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(meResponse)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => new Promise(() => undefined),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
    });

    const assertion = expect(client.getMe()).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('bounds response-body consumption inside the same request deadline', async () => {
    vi.useFakeTimers();
    const response = jsonResponse(meResponse);
    vi.spyOn(response, 'text').mockImplementation(() => new Promise(() => undefined));
    const fetchImplementation = vi.fn<FetchImplementation>(() => Promise.resolve(response));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
    });

    const assertion = expect(client.getMe()).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchImplementation.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  });
});
