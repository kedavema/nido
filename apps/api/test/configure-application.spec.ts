import type { NestExpressApplication } from '@nestjs/platform-express';
import { describe, expect, it, vi } from 'vitest';

import { configureApplication } from '../src/configure-application.js';

function fakeApplication(): {
  app: NestExpressApplication;
  set: ReturnType<typeof vi.fn>;
} {
  const set = vi.fn();
  const app = {
    disable: vi.fn(),
    set,
    enableShutdownHooks: vi.fn(),
    enableCors: vi.fn(),
    setGlobalPrefix: vi.fn(),
  } as unknown as NestExpressApplication;

  return { app, set };
}

describe('configureApplication', () => {
  it('does not trust any forwarded header when no proxy is declared', () => {
    const { app, set } = fakeApplication();

    configureApplication(app, { corsOrigins: ['http://localhost:8081'], trustedProxyHops: 0 });

    // Reaching the API directly means the socket address is the truth and any `X-Forwarded-For`
    // is a forgery, so the setting is left off entirely rather than set to 0.
    expect(set).not.toHaveBeenCalledWith('trust proxy', expect.anything());
  });

  it('treats an omitted hop count the same as none', () => {
    const { app, set } = fakeApplication();

    // The integration tests build the app without the option at all; that must stay the untrusting
    // configuration rather than silently becoming a trusted chain.
    configureApplication(app, { corsOrigins: ['http://localhost:8081'] });

    expect(set).not.toHaveBeenCalledWith('trust proxy', expect.anything());
  });

  it('trusts exactly the declared number of hops', () => {
    const { app, set } = fakeApplication();

    configureApplication(app, { corsOrigins: ['https://nido.pages.dev'], trustedProxyHops: 1 });

    // A number, never `true`: `true` would trust the whole chain and let a caller prepend an
    // address to hand themselves a fresh rate-limit bucket.
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });
});
