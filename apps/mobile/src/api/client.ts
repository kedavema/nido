import {
  AcceptHouseholdInviteResponseSchema,
  CreateCategoryRequestSchema,
  CreateCategoryResponseSchema,
  CreateHouseholdInviteRequestSchema,
  CreateHouseholdInviteResponseSchema,
  CreateHouseholdRequestSchema,
  CreateHouseholdResponseSchema,
  CreatePaymentSourceRequestSchema,
  CreatePaymentSourceResponseSchema,
  CreateRecurringItemRequestSchema,
  CreateRecurringItemResponseSchema,
  CreateTransactionRequestSchema,
  CreateTransactionResponseSchema,
  GetHouseholdMembersResponseSchema,
  GetMeResponseSchema,
  InviteTokenSchema,
  ListCategoriesResponseSchema,
  ListOccurrencesQuerySchema,
  ListOccurrencesResponseSchema,
  ListPaymentSourcesResponseSchema,
  ListRecurringItemsResponseSchema,
  ListTransactionsQuerySchema,
  ListTransactionsResponseSchema,
  MonthlySummaryQuerySchema,
  MonthlySummaryResponseSchema,
  SettleOccurrenceRequestSchema,
  SettleOccurrenceResponseSchema,
  UpdateCategoryRequestSchema,
  UpdateCategoryResponseSchema,
  UpdatePaymentSourceRequestSchema,
  UpdatePaymentSourceResponseSchema,
  UpdateRecurringItemRequestSchema,
  UpdateRecurringItemResponseSchema,
  UpdateTransactionRequestSchema,
  UpdateTransactionResponseSchema,
  type AcceptHouseholdInviteResponse,
  type CreateCategoryRequest,
  type CreateCategoryResponse,
  type CreateHouseholdInviteResponse,
  type CreateHouseholdResponse,
  type CreatePaymentSourceRequest,
  type CreatePaymentSourceResponse,
  type CreateRecurringItemRequest,
  type CreateRecurringItemResponse,
  type CreateTransactionRequest,
  type CreateTransactionResponse,
  type GetHouseholdMembersResponse,
  type GetMeResponse,
  type ListCategoriesResponse,
  type ListOccurrencesQuery,
  type ListOccurrencesResponse,
  type ListPaymentSourcesResponse,
  type ListRecurringItemsResponse,
  type ListTransactionsQuery,
  type ListTransactionsResponse,
  type MonthlySummaryQuery,
  type MonthlySummaryResponse,
  type SettleOccurrenceRequest,
  type SettleOccurrenceResponse,
  type UpdateCategoryRequest,
  type UpdateCategoryResponse,
  type UpdatePaymentSourceRequest,
  type UpdatePaymentSourceResponse,
  type UpdateRecurringItemRequest,
  type UpdateRecurringItemResponse,
  type UpdateTransactionRequest,
  type UpdateTransactionResponse,
} from '@nido/contracts';
import { z } from 'zod';

export type GetIdToken = () => Promise<string | null>;
export type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

interface ApiClientOptions {
  readonly baseUrl: string;
  readonly getIdToken: GetIdToken;
  readonly fetchImplementation?: FetchImplementation;
  readonly requestTimeoutMilliseconds?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MILLISECONDS = 15_000;

class RequestDeadlineError extends Error {}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly kind: 'authentication' | 'network' | 'response',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function networkError(): ApiError {
  return new ApiError(
    'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.',
    undefined,
    'network',
  );
}

async function withRequestDeadline<T>(
  timeoutMilliseconds: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      reject(new RequestDeadlineError());
    }, timeoutMilliseconds);
  });

  try {
    return await Promise.race([operation(abortController.signal), deadline]);
  } catch (error) {
    if (error instanceof RequestDeadlineError) {
      throw networkError();
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisá los datos e intentá de nuevo.';
    case 401:
      return 'Tu sesión venció. Volvé a iniciar sesión.';
    case 403:
      return 'No tenés permiso para realizar esta acción.';
    case 404:
      return 'No encontramos lo que buscabas.';
    case 409:
      return 'La acción ya fue realizada o entra en conflicto con el estado actual.';
    case 410:
      return 'La invitación venció y ya no puede usarse.';
    case 429:
      return 'Hiciste demasiados intentos. Esperá un momento y probá de nuevo.';
    default:
      return status >= 500
        ? 'Nido no pudo conectarse con el servicio. Intentá de nuevo.'
        : 'No pudimos completar la acción.';
  }
}

function buildQueryString(params: Readonly<Record<string, string | undefined>>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query.length === 0 ? '' : `?${query}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      'La respuesta del servicio no tiene el formato esperado.',
      response.status,
      'response',
    );
  }
}

export interface NidoApiClient {
  getMe(): Promise<GetMeResponse>;
  createHousehold(name: string): Promise<CreateHouseholdResponse>;
  getHouseholdMembers(householdId: string): Promise<GetHouseholdMembersResponse>;
  createHouseholdInvite(householdId: string, email: string): Promise<CreateHouseholdInviteResponse>;
  acceptHouseholdInvite(token: string): Promise<AcceptHouseholdInviteResponse>;
  listCategories(householdId: string): Promise<ListCategoriesResponse>;
  createCategory(
    householdId: string,
    input: CreateCategoryRequest,
  ): Promise<CreateCategoryResponse>;
  updateCategory(
    householdId: string,
    categoryId: string,
    input: UpdateCategoryRequest,
  ): Promise<UpdateCategoryResponse>;
  deleteCategory(householdId: string, categoryId: string): Promise<void>;
  listPaymentSources(householdId: string): Promise<ListPaymentSourcesResponse>;
  createPaymentSource(
    householdId: string,
    input: CreatePaymentSourceRequest,
  ): Promise<CreatePaymentSourceResponse>;
  updatePaymentSource(
    householdId: string,
    paymentSourceId: string,
    input: UpdatePaymentSourceRequest,
  ): Promise<UpdatePaymentSourceResponse>;
  deletePaymentSource(householdId: string, paymentSourceId: string): Promise<void>;
  listTransactions(
    householdId: string,
    query?: ListTransactionsQuery,
  ): Promise<ListTransactionsResponse>;
  getTransaction(householdId: string, transactionId: string): Promise<CreateTransactionResponse>;
  createTransaction(
    householdId: string,
    input: CreateTransactionRequest,
  ): Promise<CreateTransactionResponse>;
  updateTransaction(
    householdId: string,
    transactionId: string,
    input: UpdateTransactionRequest,
  ): Promise<UpdateTransactionResponse>;
  deleteTransaction(householdId: string, transactionId: string): Promise<void>;
  getMonthlySummary(
    householdId: string,
    query: MonthlySummaryQuery,
  ): Promise<MonthlySummaryResponse>;
  listRecurringItems(householdId: string): Promise<ListRecurringItemsResponse>;
  createRecurringItem(
    householdId: string,
    input: CreateRecurringItemRequest,
  ): Promise<CreateRecurringItemResponse>;
  updateRecurringItem(
    householdId: string,
    recurringItemId: string,
    input: UpdateRecurringItemRequest,
  ): Promise<UpdateRecurringItemResponse>;
  deleteRecurringItem(householdId: string, recurringItemId: string): Promise<void>;
  listOccurrences(
    householdId: string,
    query?: ListOccurrencesQuery,
  ): Promise<ListOccurrencesResponse>;
  settleOccurrence(
    householdId: string,
    occurrenceId: string,
    input: SettleOccurrenceRequest,
  ): Promise<SettleOccurrenceResponse>;
}

export function createNidoApiClient({
  baseUrl,
  getIdToken,
  fetchImplementation = (input, init) => fetch(input, init),
  requestTimeoutMilliseconds = DEFAULT_REQUEST_TIMEOUT_MILLISECONDS,
}: ApiClientOptions): NidoApiClient {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: {
      readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      readonly body?: Readonly<Record<string, unknown>>;
      /**
       * Extra request headers beyond the always-sent `Accept`/`Authorization`/`Content-Type`.
       * Kept narrow and call-site-specific (e.g. `Idempotency-Key` for `createTransaction`)
       * rather than exposing a generic arbitrary-headers parameter on every method.
       */
      readonly extraHeaders?: Readonly<Record<string, string>> | undefined;
    } = {},
  ): Promise<T> {
    return withRequestDeadline(requestTimeoutMilliseconds, async (signal) => {
      let token: string | null;
      try {
        token = await getIdToken();
      } catch {
        throw networkError();
      }

      if (token === null) {
        throw new ApiError('Necesitás iniciar sesión para continuar.', 401, 'authentication');
      }

      let response: Response;

      try {
        response = await fetchImplementation(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...options.extraHeaders,
          },
          signal,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
      } catch {
        throw networkError();
      }

      if (!response.ok) {
        throw new ApiError(messageForStatus(response.status), response.status, 'response');
      }

      if (response.status === 204) {
        return undefined as T;
      }

      let payload: unknown;
      try {
        payload = await readJson(response);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        throw networkError();
      }

      const parsed = schema.safeParse(payload);

      if (!parsed.success) {
        throw new ApiError(
          'La respuesta del servicio no tiene el formato esperado.',
          response.status,
          'response',
        );
      }

      return parsed.data;
    });
  }

  return {
    getMe() {
      return request('/v1/me', GetMeResponseSchema);
    },
    createHousehold(name) {
      const body = CreateHouseholdRequestSchema.parse({ name });
      return request('/v1/households', CreateHouseholdResponseSchema, { method: 'POST', body });
    },
    getHouseholdMembers(householdId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/members`,
        GetHouseholdMembersResponseSchema,
      );
    },
    createHouseholdInvite(householdId, email) {
      const body = CreateHouseholdInviteRequestSchema.parse({ email });
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/invites`,
        CreateHouseholdInviteResponseSchema,
        { method: 'POST', body },
      );
    },
    acceptHouseholdInvite(token) {
      const validToken = InviteTokenSchema.parse(token);
      return request(
        `/v1/invites/${encodeURIComponent(validToken)}/accept`,
        AcceptHouseholdInviteResponseSchema,
        { method: 'POST', body: {} },
      );
    },
    listCategories(householdId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/categories`,
        ListCategoriesResponseSchema,
      );
    },
    createCategory(householdId, input) {
      const body = CreateCategoryRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/categories`,
        CreateCategoryResponseSchema,
        { method: 'POST', body },
      );
    },
    updateCategory(householdId, categoryId, input) {
      const body = UpdateCategoryRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/categories/${encodeURIComponent(categoryId)}`,
        UpdateCategoryResponseSchema,
        { method: 'PATCH', body },
      );
    },
    deleteCategory(householdId, categoryId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/categories/${encodeURIComponent(categoryId)}`,
        z.void(),
        { method: 'DELETE' },
      );
    },
    listPaymentSources(householdId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/payment-sources`,
        ListPaymentSourcesResponseSchema,
      );
    },
    createPaymentSource(householdId, input) {
      const body = CreatePaymentSourceRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/payment-sources`,
        CreatePaymentSourceResponseSchema,
        { method: 'POST', body },
      );
    },
    updatePaymentSource(householdId, paymentSourceId, input) {
      const body = UpdatePaymentSourceRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/payment-sources/${encodeURIComponent(paymentSourceId)}`,
        UpdatePaymentSourceResponseSchema,
        { method: 'PATCH', body },
      );
    },
    deletePaymentSource(householdId, paymentSourceId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/payment-sources/${encodeURIComponent(paymentSourceId)}`,
        z.void(),
        { method: 'DELETE' },
      );
    },
    listTransactions(householdId, query = {}) {
      const validQuery = ListTransactionsQuerySchema.parse(query);
      const queryString = buildQueryString(validQuery);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/transactions${queryString}`,
        ListTransactionsResponseSchema,
      );
    },
    getTransaction(householdId, transactionId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/transactions/${encodeURIComponent(transactionId)}`,
        CreateTransactionResponseSchema,
      );
    },
    createTransaction(householdId, input) {
      const body = CreateTransactionRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/transactions`,
        CreateTransactionResponseSchema,
        {
          method: 'POST',
          body,
          // ADR 0003: the API requires `Idempotency-Key` to be present and equal to the body's
          // `clientMutationId` whenever that field is set.
          extraHeaders:
            input.clientMutationId === undefined
              ? undefined
              : { 'Idempotency-Key': input.clientMutationId },
        },
      );
    },
    updateTransaction(householdId, transactionId, input) {
      const body = UpdateTransactionRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/transactions/${encodeURIComponent(transactionId)}`,
        UpdateTransactionResponseSchema,
        { method: 'PATCH', body },
      );
    },
    deleteTransaction(householdId, transactionId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/transactions/${encodeURIComponent(transactionId)}`,
        z.void(),
        { method: 'DELETE' },
      );
    },
    getMonthlySummary(householdId, query) {
      const validQuery = MonthlySummaryQuerySchema.parse(query);
      const queryString = buildQueryString(validQuery);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/reports/monthly-summary${queryString}`,
        MonthlySummaryResponseSchema,
      );
    },
    listRecurringItems(householdId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/recurring-items`,
        ListRecurringItemsResponseSchema,
      );
    },
    createRecurringItem(householdId, input) {
      const body = CreateRecurringItemRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/recurring-items`,
        CreateRecurringItemResponseSchema,
        { method: 'POST', body },
      );
    },
    updateRecurringItem(householdId, recurringItemId, input) {
      const body = UpdateRecurringItemRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/recurring-items/${encodeURIComponent(recurringItemId)}`,
        UpdateRecurringItemResponseSchema,
        { method: 'PATCH', body },
      );
    },
    deleteRecurringItem(householdId, recurringItemId) {
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/recurring-items/${encodeURIComponent(recurringItemId)}`,
        z.void(),
        { method: 'DELETE' },
      );
    },
    listOccurrences(householdId, query = {}) {
      const validQuery = ListOccurrencesQuerySchema.parse(query);
      // `status` normalizes to an array and repeats as `?status=A&status=B` (Express parses
      // repeated keys back into an array); `from`/`to` are plain scalars.
      const searchParams = new URLSearchParams();
      for (const status of validQuery.status ?? []) {
        searchParams.append('status', status);
      }
      if (validQuery.from !== undefined) searchParams.set('from', validQuery.from);
      if (validQuery.to !== undefined) searchParams.set('to', validQuery.to);
      const queryString = searchParams.toString();
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/occurrences${queryString === '' ? '' : `?${queryString}`}`,
        ListOccurrencesResponseSchema,
      );
    },
    settleOccurrence(householdId, occurrenceId, input) {
      const body = SettleOccurrenceRequestSchema.parse(input);
      return request(
        `/v1/households/${encodeURIComponent(householdId)}/occurrences/${encodeURIComponent(occurrenceId)}/settle`,
        SettleOccurrenceResponseSchema,
        { method: 'POST', body },
      );
    },
  };
}
