import { describe, expect, it, vi } from 'vitest';

import type { NotificationDispatcherService } from '../src/notifications/notification-dispatcher.service.js';
import {
  APP_DISPATCH_BATCH_LIMIT,
  JOB_DISPATCH_BATCH_LIMIT,
  NotificationDispatchService,
} from '../src/notifications/notification-dispatch.service.js';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const OTHER_HOUSEHOLD = '22222222-2222-4222-8222-222222222222';

/** A dispatcher whose in-flight call can be resolved by the test, to hold the guard open. */
function deferredDispatcher(): {
  service: NotificationDispatchService;
  dispatch: ReturnType<typeof vi.fn>;
  release: () => void;
} {
  // One resolver per call, not one shared slot: the tests below start two dispatches at once, and
  // keeping only the latest resolver would leave the first promise pending forever.
  const resolvers: ((summary: { claimed: number; sent: number; failed: number }) => void)[] = [];
  const dispatch = vi.fn(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  );

  const service = new NotificationDispatchService({
    dispatch,
  } as unknown as NotificationDispatcherService);

  return {
    service,
    dispatch,
    release: () => {
      for (const resolve of resolvers.splice(0)) {
        resolve({ claimed: 1, sent: 1, failed: 0 });
      }
    },
  };
}

describe('NotificationDispatchService', () => {
  it('reports the dispatcher summary with skipped false', async () => {
    const dispatch = vi.fn().mockResolvedValue({ claimed: 3, sent: 2, failed: 1 });
    const service = new NotificationDispatchService({
      dispatch,
    } as unknown as NotificationDispatcherService);

    await expect(service.dispatchHousehold(HOUSEHOLD)).resolves.toEqual({
      claimed: 3,
      sent: 2,
      failed: 1,
      skipped: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      householdId: HOUSEHOLD,
      limit: APP_DISPATCH_BATCH_LIMIT,
    });
  });

  it('sweeps every household with the larger batch when the scheduler calls', async () => {
    const dispatch = vi.fn().mockResolvedValue({ claimed: 0, sent: 0, failed: 0 });
    const service = new NotificationDispatchService({
      dispatch,
    } as unknown as NotificationDispatcherService);

    await service.dispatchAll();

    // No householdId at all: the job drains across households in one claim.
    expect(dispatch).toHaveBeenCalledWith({ limit: JOB_DISPATCH_BATCH_LIMIT });
  });

  it('returns immediately instead of queueing behind a run already in flight', async () => {
    const { service, dispatch, release } = deferredDispatcher();

    const first = service.dispatchHousehold(HOUSEHOLD);
    const second = await service.dispatchHousehold(HOUSEHOLD);

    expect(second).toEqual({ claimed: 0, sent: 0, failed: 0, skipped: true });
    // The point of skipping: the second caller never reached the dispatcher at all.
    expect(dispatch).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('does not let one household block another', async () => {
    const { service, dispatch, release } = deferredDispatcher();

    const first = service.dispatchHousehold(HOUSEHOLD);
    const other = service.dispatchHousehold(OTHER_HOUSEHOLD);

    expect(dispatch).toHaveBeenCalledTimes(2);

    release();
    await Promise.all([first, other]);
  });

  it('does not let the scheduler and an app open block each other', async () => {
    const { service, dispatch, release } = deferredDispatcher();

    const job = service.dispatchAll();
    const app = service.dispatchHousehold(HOUSEHOLD);

    // Different keys, so both run; `FOR UPDATE SKIP LOCKED` in the claim is what keeps them from
    // taking the same rows.
    expect(dispatch).toHaveBeenCalledTimes(2);

    release();
    await Promise.all([job, app]);
  });

  it('releases the guard after the run finishes', async () => {
    const dispatch = vi.fn().mockResolvedValue({ claimed: 0, sent: 0, failed: 0 });
    const service = new NotificationDispatchService({
      dispatch,
    } as unknown as NotificationDispatcherService);

    await service.dispatchHousehold(HOUSEHOLD);
    const second = await service.dispatchHousehold(HOUSEHOLD);

    expect(second.skipped).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('releases the guard when the dispatcher throws', async () => {
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider exploded'))
      .mockResolvedValue({ claimed: 0, sent: 0, failed: 0 });
    const service = new NotificationDispatchService({
      dispatch,
    } as unknown as NotificationDispatcherService);

    await expect(service.dispatchHousehold(HOUSEHOLD)).rejects.toThrow('provider exploded');

    // Without the `finally`, this household would report `skipped` forever after one failure.
    await expect(service.dispatchHousehold(HOUSEHOLD)).resolves.toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: false,
    });
  });
});
