import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginApiWakeRetry,
  isApiWaking,
  resetApiWakeStateForTests,
  subscribeToApiWaking,
} from './wake-state';

afterEach(() => {
  resetApiWakeStateForTests();
});

describe('api wake state', () => {
  it('is idle until a retry begins', () => {
    expect(isApiWaking()).toBe(false);
  });

  it('reports waking between begin and end', () => {
    const end = beginApiWakeRetry();
    expect(isApiWaking()).toBe(true);

    end();
    expect(isApiWaking()).toBe(false);
  });

  /**
   * The reason this is a counter. Inicio fires four requests at once; if the first to finish
   * cleared the flag, the screen would drop the explanation while three requests were still
   * waiting on the same cold start.
   */
  it('stays waking until the last concurrent retry ends', () => {
    const first = beginApiWakeRetry();
    const second = beginApiWakeRetry();

    first();
    expect(isApiWaking()).toBe(true);

    second();
    expect(isApiWaking()).toBe(false);
  });

  it('ignores a repeated release rather than counting it twice', () => {
    const first = beginApiWakeRetry();
    const second = beginApiWakeRetry();

    first();
    first();
    expect(isApiWaking()).toBe(true);

    second();
    expect(isApiWaking()).toBe(false);
  });

  it('notifies subscribers only when the state actually flips', () => {
    const listener = vi.fn();
    subscribeToApiWaking(listener);

    const first = beginApiWakeRetry();
    expect(listener).toHaveBeenCalledTimes(1);

    // Already waking — a second concurrent retry changes no observable state.
    const second = beginApiWakeRetry();
    expect(listener).toHaveBeenCalledTimes(1);

    first();
    expect(listener).toHaveBeenCalledTimes(1);

    second();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToApiWaking(listener);

    unsubscribe();
    beginApiWakeRetry()();

    expect(listener).not.toHaveBeenCalled();
  });
});
