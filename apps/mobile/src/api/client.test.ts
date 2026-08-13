import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createNidoApiClient, type FetchImplementation } from './client';

const meResponse = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ale@example.com',
    displayName: 'Ale',
    avatarUrl: null,
    timezone: 'America/Asuncion',
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
  },
  households: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Nido API client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends only the Firebase bearer token and validates a successful response', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(meResponse)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(client.getMe()).resolves.toEqual(meResponse);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/v1/me');
    expect(init).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer firebase-id-token',
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not make a request without an authenticated Firebase session', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(meResponse)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve(null),
      fetchImplementation,
    });

    await expect(client.getMe()).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'authentication',
      status: 401,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects malformed success payloads without exposing them in the error', async () => {
    const privatePayload = { unexpected: 'private-payload-value' };
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () => Promise.resolve(jsonResponse(privatePayload)),
    });

    await expect(client.getMe()).rejects.toBeInstanceOf(ApiError);

    try {
      await client.getMe();
    } catch (error) {
      expect((error as Error).message).not.toContain(privatePayload.unexpected);
    }
  });

  it('normalizes network and server failures to safe user-facing errors', async () => {
    const offlineClient = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () => Promise.reject(new Error('socket details must not escape')),
    });
    const forbiddenClient = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () =>
        Promise.resolve(jsonResponse({ message: 'sensitive detail' }, 403)),
    });

    await expect(offlineClient.getMe()).rejects.toMatchObject({ kind: 'network' });
    await expect(forbiddenClient.getMe()).rejects.toMatchObject({
      message: 'No tenés permiso para realizar esta acción.',
      status: 403,
    });

    try {
      await offlineClient.getMe();
    } catch (error) {
      expect((error as Error).message).not.toContain('socket details must not escape');
    }
  });

  it('names the address it could not reach, since the browser will not say why', async () => {
    const client = createNidoApiClient({
      baseUrl: 'http://192.168.0.5:3000',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    await expect(client.getMe()).rejects.toMatchObject({
      kind: 'network',
      message:
        'No pudimos conectarnos a http://192.168.0.5:3000. Revisá tu conexión e intentá de nuevo.',
    });
  });

  it('aborts and normalizes a request that exceeds its deadline', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<FetchImplementation>(() => new Promise(() => undefined));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
      coldStartTimeoutMilliseconds: 50,
    });

    const assertion = expect(client.getMe()).rejects.toMatchObject({
      kind: 'network',
      reason: 'timeout',
      message: 'El servicio tardó demasiado en responder. Intentá de nuevo.',
    });
    // Two deadlines, because a GET that times out gets one cold-start retry before giving up.
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    const signal = fetchImplementation.mock.calls[0]?.[1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(true);
  });

  it('bounds Firebase token acquisition inside the same request deadline', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(meResponse)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => new Promise(() => undefined),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
      coldStartTimeoutMilliseconds: 50,
    });

    const assertion = expect(client.getMe()).rejects.toMatchObject({
      kind: 'network',
      message: 'El servicio tardó demasiado en responder. Intentá de nuevo.',
    });
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('bounds response-body consumption inside the same request deadline', async () => {
    vi.useFakeTimers();
    const response = jsonResponse(meResponse);
    vi.spyOn(response, 'text').mockImplementation(() => new Promise(() => undefined));
    const fetchImplementation = vi.fn<FetchImplementation>(() => Promise.resolve(response));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
      coldStartTimeoutMilliseconds: 50,
    });

    const assertion = expect(client.getMe()).rejects.toMatchObject({
      kind: 'network',
      message: 'El servicio tardó demasiado en responder. Intentá de nuevo.',
    });
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(fetchImplementation.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  });

  it('retries a timed-out GET once on the cold-start deadline and succeeds when the API wakes', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse(meResponse)));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
      coldStartTimeoutMilliseconds: 50,
    });

    const assertion = expect(client.getMe()).resolves.toMatchObject(meResponse);
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  /**
   * The safety rule. A mutation that outlived its deadline may still have been received and acted
   * on, and from here "never arrived" and "arrived, still working" look identical — so a retry
   * risks applying it twice. Expense creation has the offline queue and its idempotency keys.
   */
  it('does not retry a timed-out mutation', async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<FetchImplementation>(() => new Promise(() => undefined));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
      requestTimeoutMilliseconds: 25,
      coldStartTimeoutMilliseconds: 50,
    });

    const assertion = expect(client.createHousehold('Casa')).rejects.toMatchObject({
      kind: 'network',
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  /** Only a deadline earns the long retry — a dead host should fail fast, not after a minute. */
  it('does not retry an unreachable host', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(() => Promise.reject(new TypeError()));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(client.getMe()).rejects.toMatchObject({
      kind: 'network',
      reason: 'unreachable',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('uses PATCH and accepts empty DELETE responses for catalog mutations', async () => {
    const categoryId = '00000000-0000-4000-8000-000000000010';
    const householdId = '00000000-0000-4000-8000-000000000011';
    const category = {
      id: categoryId,
      householdId,
      kind: 'EXPENSE',
      parentId: null,
      name: 'Food',
      icon: 'restaurant',
      color: '#E67E22',
      sortOrder: 0,
      isActive: false,
      createdAt: '2026-07-16T12:00:00.000Z',
      updatedAt: '2026-07-16T12:00:00.000Z',
    } as const;
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ category }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(
      client.updateCategory(householdId, categoryId, { isActive: false }),
    ).resolves.toEqual({ category });
    await expect(client.deleteCategory(householdId, categoryId)).resolves.toBeUndefined();
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    });
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('creates and updates transactions with decimal-string amounts, never numbers', async () => {
    const householdId = '00000000-0000-4000-8000-000000000011';
    const transactionId = '00000000-0000-4000-8000-000000000012';
    const categoryId = '00000000-0000-4000-8000-000000000013';
    const transaction = {
      id: transactionId,
      householdId,
      type: 'EXPENSE',
      amount: '45.90',
      currency: 'USD',
      fxRateToBase: '7350',
      baseAmountPyg: '337365',
      occurredAt: '2026-07-15T12:00:00.000Z',
      localDate: '2026-07-15',
      categoryId,
      paymentSourceId: null,
      description: 'Amazon',
      notes: null,
      origin: 'MANUAL',
      createdBy: '00000000-0000-4000-8000-000000000001',
      updatedBy: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-15T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    } as const;
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ transaction }))
      .mockResolvedValueOnce(jsonResponse({ transaction }));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(
      client.createTransaction(householdId, {
        type: 'EXPENSE',
        amount: '45.90',
        currency: 'USD',
        fxRateToBase: '7350',
        occurredAt: '2026-07-15T12:00:00.000Z',
        categoryId,
        description: 'Amazon',
      }),
    ).resolves.toEqual({ transaction });
    await expect(
      client.updateTransaction(householdId, transactionId, {
        amount: '45.90',
        currency: 'USD',
        fxRateToBase: '7350',
      }),
    ).resolves.toEqual({ transaction });

    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      `https://api.example.com/v1/households/${householdId}/transactions`,
    );
    const createBody = JSON.parse(fetchImplementation.mock.calls[0]?.[1].body as string) as unknown;
    expect(createBody).toMatchObject({ amount: '45.90', fxRateToBase: '7350' });
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });

    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(
      `https://api.example.com/v1/households/${householdId}/transactions/${transactionId}`,
    );
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('sends Idempotency-Key only when clientMutationId is set, matching it exactly', async () => {
    const householdId = '00000000-0000-4000-8000-000000000011';
    const categoryId = '00000000-0000-4000-8000-000000000013';
    const clientMutationId = '00000000-0000-4000-8000-000000000099';
    const transaction = {
      id: '00000000-0000-4000-8000-000000000012',
      householdId,
      type: 'EXPENSE',
      amount: '10000',
      currency: 'PYG',
      fxRateToBase: null,
      baseAmountPyg: '10000',
      occurredAt: '2026-07-15T12:00:00.000Z',
      localDate: '2026-07-15',
      categoryId,
      paymentSourceId: null,
      description: 'Almuerzo',
      notes: null,
      origin: 'MANUAL',
      createdBy: '00000000-0000-4000-8000-000000000001',
      updatedBy: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-15T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    } as const;
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ transaction }))
      .mockResolvedValueOnce(jsonResponse({ transaction }));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await client.createTransaction(householdId, {
      type: 'EXPENSE',
      amount: '10000',
      currency: 'PYG',
      occurredAt: '2026-07-15T12:00:00.000Z',
      categoryId,
      description: 'Almuerzo',
      clientMutationId,
    });
    await client.createTransaction(householdId, {
      type: 'EXPENSE',
      amount: '10000',
      currency: 'PYG',
      occurredAt: '2026-07-15T12:00:00.000Z',
      categoryId,
      description: 'Almuerzo',
    });

    const withIdHeaders = fetchImplementation.mock.calls[0]?.[1].headers as Record<string, string>;
    expect(withIdHeaders['Idempotency-Key']).toBe(clientMutationId);

    const withoutIdHeaders = fetchImplementation.mock.calls[1]?.[1].headers as Record<
      string,
      string
    >;
    expect(withoutIdHeaders['Idempotency-Key']).toBeUndefined();
  });

  it('rejects an invalid transaction payload client-side, without making a request', () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    expect(() =>
      client.createTransaction('00000000-0000-4000-8000-000000000011', {
        type: 'EXPENSE',
        amount: '45.9', // PYG scale requires an integer, no decimals
        currency: 'PYG',
        occurredAt: '2026-07-15T12:00:00.000Z',
        categoryId: '00000000-0000-4000-8000-000000000013',
        description: 'Amazon',
      }),
    ).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('fetches the monthly summary with a yyyy-MM query param, preserving decimal-string amounts', async () => {
    const householdId = '00000000-0000-4000-8000-000000000011';
    const summary = {
      balance: '-620000',
      incomeTotal: '17700000',
      expenseTotal: '18320000',
      categoryBreakdown: [
        {
          categoryId: '00000000-0000-4000-8000-000000000020',
          categoryName: 'Alimentación',
          amount: '3410000',
          percentage: 24,
        },
      ],
      recentTransactions: [],
      budget: null,
    };
    const fetchImplementation = vi.fn<FetchImplementation>(() =>
      Promise.resolve(jsonResponse(summary)),
    );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(client.getMonthlySummary(householdId, { month: '2026-07' })).resolves.toEqual(
      summary,
    );
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      `https://api.example.com/v1/households/${householdId}/reports/monthly-summary?month=2026-07`,
    );
  });

  it('fetches and parses both report views for a validated month', async () => {
    const householdId = '00000000-0000-4000-8000-000000000011';
    const categoryReport = {
      month: '2026-07',
      totalExpensePyg: '3410000',
      categories: [
        {
          categoryId: '00000000-0000-4000-8000-000000000020',
          categoryName: 'Alimentación',
          amountPyg: '3410000',
          directAmountPyg: '1000000',
          percentageOfTotal: 100,
          subcategories: [
            {
              categoryId: '00000000-0000-4000-8000-000000000021',
              categoryName: 'Supermercado',
              amountPyg: '2410000',
              percentageOfTotal: 70.67,
            },
          ],
        },
      ],
    };
    const trendsReport = {
      month: '2026-07',
      points: [
        { month: '2026-05', incomePyg: '100', expensePyg: '20', balancePyg: '80' },
        { month: '2026-06', incomePyg: '200', expensePyg: '60', balancePyg: '140' },
        { month: '2026-07', incomePyg: '300', expensePyg: '90', balancePyg: '210' },
      ],
      totalExpensePyg: '90',
      paymentSources: [
        {
          paymentSourceId: null,
          paymentSourceName: 'Sin medio de pago',
          ownerUserId: null,
          scope: 'UNASSIGNED' as const,
          amountPyg: '90',
          percentageOfExpense: 100,
        },
      ],
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse(categoryReport))
      .mockResolvedValueOnce(jsonResponse(trendsReport));
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(
      client.getCategoryBreakdownReport(householdId, { month: '2026-07' }),
    ).resolves.toEqual(categoryReport);
    await expect(client.getTrendsReport(householdId, { month: '2026-07' })).resolves.toEqual(
      trendsReport,
    );

    const reportsPath = `https://api.example.com/v1/households/${householdId}/reports`;
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      `${reportsPath}/category-breakdown?month=2026-07`,
    );
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(`${reportsPath}/trends?month=2026-07`);
  });

  it('rejects invalid report months before making a request', () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    expect(() => client.getCategoryBreakdownReport('household', { month: '2026-7' })).toThrow();
    expect(() => client.getTrendsReport('household', { month: 'July' })).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects report responses that do not match the shared contract', async () => {
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation: () =>
        Promise.resolve(
          jsonResponse({ month: '2026-07', totalExpensePyg: '90', paymentSources: [] }),
        ),
    });

    await expect(client.getTrendsReport('household', { month: '2026-07' })).rejects.toMatchObject({
      kind: 'response',
    });
  });

  it('reads, replaces, and copies monthly budgets with validated decimal-string payloads', async () => {
    const householdId = '00000000-0000-4000-8000-000000000011';
    const budgetMonth = {
      id: '00000000-0000-4000-8000-000000000030',
      householdId,
      month: '2026-07',
      totalLimitPyg: '15000000',
      allocations: [
        {
          categoryId: '00000000-0000-4000-8000-000000000020',
          amountPyg: '3410000',
        },
      ],
      unallocatedPyg: '11590000',
      copiedFromId: null,
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ budgetMonth: null }))
      .mockResolvedValueOnce(jsonResponse({ budgetMonth }))
      .mockResolvedValueOnce(
        jsonResponse({
          budgetMonth: {
            ...budgetMonth,
            id: '00000000-0000-4000-8000-000000000031',
            month: '2026-08',
            copiedFromId: budgetMonth.id,
          },
        }),
      );
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    await expect(client.getBudgetMonth(householdId, '2026-07')).resolves.toEqual({
      budgetMonth: null,
    });
    await expect(
      client.upsertBudgetMonth(householdId, '2026-07', {
        totalLimitPyg: budgetMonth.totalLimitPyg,
        allocations: budgetMonth.allocations,
      }),
    ).resolves.toEqual({ budgetMonth });
    await expect(
      client.copyBudgetMonth(householdId, '2026-08', { sourceMonth: '2026-07' }),
    ).resolves.toMatchObject({ budgetMonth: { month: '2026-08', copiedFromId: budgetMonth.id } });

    const basePath = `https://api.example.com/v1/households/${householdId}/budgets`;
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(`${basePath}/2026-07`);
    expect(fetchImplementation.mock.calls[1]).toEqual([
      `${basePath}/2026-07`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          totalLimitPyg: budgetMonth.totalLimitPyg,
          allocations: budgetMonth.allocations,
        }),
      }),
    ]);
    expect(fetchImplementation.mock.calls[2]).toEqual([
      `${basePath}/2026-08/copy`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sourceMonth: '2026-07' }) }),
    ]);
  });

  it('rejects invalid budget months and amounts before making a request', () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    expect(() => client.getBudgetMonth('household', '2026-7')).toThrow();
    expect(() =>
      client.upsertBudgetMonth('household', '2026-07', {
        totalLimitPyg: '-1',
        allocations: [],
      }),
    ).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects an invalid monthly-summary query client-side, without making a request', () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = createNidoApiClient({
      baseUrl: 'https://api.example.com',
      getIdToken: () => Promise.resolve('firebase-id-token'),
      fetchImplementation,
    });

    expect(() =>
      client.getMonthlySummary('00000000-0000-4000-8000-000000000011', {
        month: '2026-7', // MonthSchema requires a zero-padded month
      }),
    ).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
