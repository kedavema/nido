import { describe, expect, it } from 'vitest';

import { createInvitationRequestGuard } from './invitation-request-guard';

describe('createInvitationRequestGuard', () => {
  it('invalidates a pending request when the invitation view loses focus', () => {
    const guard = createInvitationRequestGuard();
    const isCurrentRequest = guard.begin();

    guard.invalidate();

    expect(isCurrentRequest()).toBe(false);
  });

  it('keeps an invalidated request stale after a new request begins', () => {
    const guard = createInvitationRequestGuard();
    const isPreviousRequest = guard.begin();

    guard.invalidate();
    const isCurrentRequest = guard.begin();

    expect(isPreviousRequest()).toBe(false);
    expect(isCurrentRequest()).toBe(true);
  });
});
