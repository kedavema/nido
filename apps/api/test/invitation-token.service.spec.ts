import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InvitationTokenService } from '../src/households/invitation-token.service.js';

describe('InvitationTokenService', () => {
  const service = new InvitationTokenService();

  it('creates a 32-byte base64url token', () => {
    const token = service.generate();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('stores a deterministic SHA-256 digest rather than plaintext', () => {
    const token = service.generate();
    const hash = service.hash(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain(token);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
  });
});
