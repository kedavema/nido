import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('health endpoints', () => {
  let app: NestExpressApplication | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/nido_test');

    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { configureApplication } = await import('../src/configure-application.js');
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(['live', 'ready'])(
    'serves an unversioned deterministic /health/%s response',
    async (endpoint) => {
      const response = await fetch(`${baseUrl}/health/${endpoint}`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('x-powered-by')).toBeNull();
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'ok' });
    },
  );

  it('does not expose a version-prefixed health route', async () => {
    const response = await fetch(`${baseUrl}/v1/health/live`);

    expect(response.status).toBe(404);
  });
});
