import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  AuthenticatedUserSchema,
  CreateTransactionRequestSchema,
  MonthlySummaryResponseSchema,
  TransactionSchema,
} from '../src/index.js';

/**
 * Shared cross-language contract fixtures (see docs/flutter-architecture.md
 * §Modelos): the Dart client in `apps/flutter` parses these same files, so a
 * contract change that edits a fixture forces both sides to move together.
 */
const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDirectory, name), 'utf8')) as unknown;
}

const cases: readonly { readonly file: string; readonly schema: z.ZodType }[] = [
  { file: 'transaction.pyg.json', schema: TransactionSchema },
  { file: 'transaction.usd.json', schema: TransactionSchema },
  { file: 'create-transaction-request.usd.json', schema: CreateTransactionRequestSchema },
  { file: 'monthly-summary.json', schema: MonthlySummaryResponseSchema },
  { file: 'authenticated-user.json', schema: AuthenticatedUserSchema },
];

describe('shared contract fixtures', () => {
  it.each(cases)('$file satisfies its schema', ({ file, schema }) => {
    const result = schema.safeParse(loadFixture(file));
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });
});
