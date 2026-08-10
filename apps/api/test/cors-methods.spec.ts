import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CORS_ALLOWED_METHODS } from '../src/configure-application.js';

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url));

/**
 * Matches the Nest routing decorators. Read from source rather than from `METHOD_METADATA`
 * because reflecting on the real classes means importing every controller, and through them the
 * services and the Prisma client — a database-shaped dependency for a question that is answered
 * by the decorator alone.
 */
const ROUTE_DECORATOR = /@(Get|Post|Put|Patch|Delete|Head|All)\s*\(/gu;

async function controllerFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await controllerFiles(path)));
    } else if (entry.name.endsWith('.controller.ts')) {
      found.push(path);
    }
  }

  return found;
}

async function routedMethods(): Promise<ReadonlySet<string>> {
  const files = await controllerFiles(SOURCE_ROOT);
  const methods = new Set<string>();

  for (const file of files) {
    const source = await readFile(file, 'utf8');

    for (const match of source.matchAll(ROUTE_DECORATOR)) {
      const verb = match[1];

      if (verb !== undefined) {
        methods.add(verb.toUpperCase());
      }
    }
  }

  return methods;
}

describe('CORS allowed methods', () => {
  it('covers every verb the controllers answer', async () => {
    const allowed: readonly string[] = CORS_ALLOWED_METHODS;
    const routed = await routedMethods();
    const missing = [...routed].filter((method) => !allowed.includes(method)).sort();

    expect(missing).toEqual([]);
  });

  it('permits the preflight request itself', () => {
    expect([...CORS_ALLOWED_METHODS]).toContain('OPTIONS');
  });

  it('finds controllers to check, so an empty scan cannot pass silently', async () => {
    const routed = await routedMethods();

    expect(routed.size).toBeGreaterThan(0);
    expect([...routed]).toContain('GET');
  });
});
