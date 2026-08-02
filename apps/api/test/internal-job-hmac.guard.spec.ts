import { randomUUID } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from '../src/config/environment.js';
import {
  CLOCK_SKEW_SECONDS,
  InternalJobHmacGuard,
  NONCE_HEADER,
  signJobRequest,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from '../src/notifications/internal-job-hmac.guard.js';
import type { InternalJobNoncesRepository } from '../src/notifications/internal-job-nonces.repository.js';

const secret = 'a'.repeat(48);
const now = new Date('2026-08-10T15:00:00.000Z');
const currentTimestamp = String(Math.floor(now.getTime() / 1000));

function configFor(value: string | undefined): ConfigService<Environment, true> {
  return { get: () => value } as unknown as ConfigService<Environment, true>;
}

function nonceStore(remembered = true) {
  const remember = vi.fn(() => Promise.resolve(remembered));
  const prune = vi.fn(() => Promise.resolve());
  const repository: InternalJobNoncesRepository = { remember, prune };
  return { repository, remember, prune };
}

function contextFor(
  headers: Record<string, string | string[] | undefined>,
  rawBody = Buffer.alloc(0),
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, rawBody }) }),
  } as unknown as ExecutionContext;
}

function signedHeaders(
  options: {
    readonly timestamp?: string;
    readonly nonce?: string;
    readonly body?: Buffer;
    readonly signingSecret?: string;
  } = {},
): Record<string, string> {
  const timestamp = options.timestamp ?? currentTimestamp;
  const nonce = options.nonce ?? randomUUID();
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
    [SIGNATURE_HEADER]: signJobRequest(
      options.signingSecret ?? secret,
      timestamp,
      nonce,
      options.body ?? Buffer.alloc(0),
    ),
  };
}

function guardWith(
  config = configFor(secret),
  nonces: InternalJobNoncesRepository = nonceStore().repository,
): InternalJobHmacGuard {
  return new InternalJobHmacGuard(config, nonces, { now: () => now });
}

describe('InternalJobHmacGuard', () => {
  it('accepts a correctly signed request', async () => {
    await expect(guardWith().canActivate(contextFor(signedHeaders()))).resolves.toBe(true);
  });

  it('signs the exact bytes that arrived', async () => {
    const body = Buffer.from('{"limit":50}', 'utf8');

    await expect(guardWith().canActivate(contextFor(signedHeaders({ body }), body))).resolves.toBe(
      true,
    );

    // Re-serializing the parsed body would change these bytes and still verify, which is exactly
    // the gap rawBody closes.
    const tampered = Buffer.from('{ "limit": 50 }', 'utf8');
    await expect(
      guardWith().canActivate(contextFor(signedHeaders({ body }), tampered)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a signature made with another secret', async () => {
    const headers = signedHeaders({ signingSecret: 'b'.repeat(48) });

    await expect(guardWith().canActivate(contextFor(headers))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('stays closed when no secret is configured', async () => {
    // Unconfigured must not mean "let everyone in": an open job route is worse than a job that
    // never runs.
    await expect(
      guardWith(configFor(undefined)).canActivate(contextFor(signedHeaders())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['too far in the past', -(CLOCK_SKEW_SECONDS + 60)],
    ['too far in the future', CLOCK_SKEW_SECONDS + 60],
  ])('refuses a timestamp %s', async (_label, offsetSeconds) => {
    const timestamp = String(Math.floor(now.getTime() / 1000) + offsetSeconds);

    await expect(
      guardWith().canActivate(contextFor(signedHeaders({ timestamp }))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a timestamp at the edge of the window', async () => {
    const timestamp = String(Math.floor(now.getTime() / 1000) - CLOCK_SKEW_SECONDS);

    await expect(guardWith().canActivate(contextFor(signedHeaders({ timestamp })))).resolves.toBe(
      true,
    );
  });

  it('refuses a replayed nonce', async () => {
    const { repository, remember } = nonceStore(false);
    const headers = signedHeaders();

    await expect(
      guardWith(configFor(secret), repository).canActivate(contextFor(headers)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The store is what rejects it, and the duplicate insert is the check — no read-then-write gap.
    expect(remember).toHaveBeenCalledWith(headers[NONCE_HEADER], now);
  });

  it('prunes only after a request authenticates', async () => {
    const accepted = nonceStore();
    await guardWith(configFor(secret), accepted.repository).canActivate(
      contextFor(signedHeaders()),
    );
    expect(accepted.prune).toHaveBeenCalledWith(now);

    const rejected = nonceStore();
    await expect(
      guardWith(configFor(secret), rejected.repository).canActivate(
        contextFor(signedHeaders({ signingSecret: 'c'.repeat(48) })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rejected.prune).not.toHaveBeenCalled();
  });

  it.each([
    ['no headers at all', {}],
    ['a missing signature', { [TIMESTAMP_HEADER]: currentTimestamp, [NONCE_HEADER]: 'n' }],
    ['a non-numeric timestamp', { ...signedHeaders({ timestamp: 'yesterday' }) }],
    ['a repeated header', { ...signedHeaders(), [NONCE_HEADER]: ['a', 'b'] }],
  ])('refuses a request with %s', async (_label, headers) => {
    await expect(guardWith().canActivate(contextFor(headers))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('signJobRequest', () => {
  it('is deterministic and changes with every input', () => {
    const base = signJobRequest(secret, currentTimestamp, 'nonce-1', Buffer.alloc(0));

    expect(signJobRequest(secret, currentTimestamp, 'nonce-1', Buffer.alloc(0))).toBe(base);
    expect(base.startsWith('v1=')).toBe(true);
    expect(signJobRequest(secret, currentTimestamp, 'nonce-2', Buffer.alloc(0))).not.toBe(base);
    expect(signJobRequest(secret, '0', 'nonce-1', Buffer.alloc(0))).not.toBe(base);
    expect(signJobRequest(secret, currentTimestamp, 'nonce-1', Buffer.from('x'))).not.toBe(base);
    expect(signJobRequest('d'.repeat(48), currentTimestamp, 'nonce-1', Buffer.alloc(0))).not.toBe(
      base,
    );
  });
});
