import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.spec.ts'],
    fileParallelism: false,
    globalSetup: ['./test/integration/global-setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
