/**
 * Billing API Client & React Query Integration
 *
 * Unified API endpoints and React Query query/mutation factories
 * for all billing-related data fetching.
 */

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

const DEFAULT_CURRENCY = 'AUD';
const DEFAULT_LOCALE = 'en-AU';

// === Types ===

export type TransactionStatus = 'posted' | 'pending' | 'void';
export type TransactionCategory =
  | 'token_purchase'
  | 'token_consume'
  | 'subscription_invoice'
  | 'credit_adjustment'
  | 'payment'
  | 'refund'
  | 'manual';
export type TransactionDirection = 'debit' | 'credit';

export interface TokenProduct {
  key: string;
  name: string;
  description?: string;
  token_amount: number;
  price_amount: string;
  currency: string;
  is_active: boolean;
  metadata?: Record<string, any>;
}

export interface TokenProductsResponse {
  balance?: number;
  products: TokenProduct[];
}

export interface TransactionInitiator {
  id: string;
  username?: string | null;
  email?: string | null;
}

export interface Transaction {
  id: string;
  category: TransactionCategory;
  direction: TransactionDirection;
  amount: string;
  currency: string;
  occurred_at: string;
  status: TransactionStatus;
  description?: string;
  workspace_id?: string | number;
  metadata?: Record<string, any>;
  initiator?: TransactionInitiator;
}

export interface PaginatedTransactions {
  count: number;
  next: string | null;
  previous: string | null;
  results: Transaction[];
}

export interface PaginatedList<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | string;

export interface SubscriptionBillingOwner {
  id: string;
  username?: string | null;
  email?: string | null;
}

export interface BillingPlan {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  monthly_price: string;
  max_users: number | null;
  max_storage_gb: number | null;
  is_current: boolean;
  currency?: string | null;
}

export interface WorkspaceSubscription {
  id: string | number;
  workspace_id?: string;
  workspace_name?: string;
  plan: BillingPlan | null;
  plan_key?: string | null;
  pending_plan?: BillingPlan | null;
  pending_plan_key?: string | null;
  status: SubscriptionStatus;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  canceled_at?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  auto_renew_enabled: boolean;
  renewal_attempt_count?: number;
  last_renewal_attempt_at?: string | null;
  last_renewal_status?: string | null;
  notes?: string | null;
  latest_invoice_message?: string | null;
  billing_owner?: SubscriptionBillingOwner | null;
}

export interface WorkspacePlanList {
  plans: BillingPlan[];
  current_plan: {
    key: string | null;
    name: string | null;
  };
  subscription_id?: string | null;
}

export interface WorkspaceUsageSnapshot {
  member_count: number;
  max_users: number;
  storage_used_gb: number;
  max_storage_gb: number;
}

export interface WorkspaceBillingOwnerResponse {
  owner: SubscriptionBillingOwner | null;
  stripe_customer_id?: string | null;
  credit_balance?: string;
}

export interface Invoice {
  id: string;
  workspace_id?: string;
  stripe_invoice_id: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  total_amount: string;
  amount_due: string;
  currency: string;
  hosted_invoice_url?: string;
  pdf_storage_path?: string;
  issued_at?: string;
  due_at?: string;
  paid_at?: string;
  canceled_at?: string;
  last_payment_attempt_at?: string;
  failure_reason?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  initiator?: TransactionInitiator | null;
}

export interface Payment {
  id: string;
  workspace_id?: string;
  amount: string;
  currency: string;
  status: 'requires_payment_method' | 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  payment_method?: string;
  failure_code?: string;
  failure_message?: string;
  retryable_until?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  invoice?: Invoice | null;
  initiator?: TransactionInitiator | null;
}

function parseInvoice(raw: unknown): Invoice {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid invoice payload');
  }
  const obj = raw as Record<string, unknown>;
  const id = toStringOrNull(obj.id);
  if (!id) throw new Error('Invoice id missing');

  return {
    id,
    workspace_id: toStringOrNull(obj.workspace_id) ?? undefined,
    stripe_invoice_id: toStringOrNull(obj.stripe_invoice_id) ?? 'unknown',
    status: toStringOrNull(obj.status) as Invoice['status'] ?? 'open',
    total_amount: toStringOrNull(obj.total_amount) ?? '0',
    amount_due: toStringOrNull(obj.amount_due) ?? '0',
    currency: normalizeCurrencyCode(toStringOrNull(obj.currency) ?? DEFAULT_CURRENCY),
    hosted_invoice_url: toStringOrNull(obj.hosted_invoice_url) ?? undefined,
    pdf_storage_path: toStringOrNull(obj.pdf_storage_path) ?? undefined,
    issued_at: toStringOrNull(obj.issued_at) ?? undefined,
    due_at: toStringOrNull(obj.due_at) ?? undefined,
    paid_at: toStringOrNull(obj.paid_at) ?? undefined,
    canceled_at: toStringOrNull(obj.canceled_at) ?? undefined,
    last_payment_attempt_at: toStringOrNull(obj.last_payment_attempt_at) ?? undefined,
    failure_reason: toStringOrNull(obj.failure_reason) ?? undefined,
    metadata: (obj.metadata && typeof obj.metadata === 'object')
      ? (obj.metadata as Record<string, unknown>)
      : {},
    created_at: toStringOrNull(obj.created_at) ?? new Date().toISOString(),
    updated_at: toStringOrNull(obj.updated_at) ?? new Date().toISOString(),
    initiator: parseTransactionInitiator(obj.initiator),
  };
}

function parsePayment(raw: unknown): Payment {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid payment payload');
  }
  const obj = raw as Record<string, unknown>;
  const id = toStringOrNull(obj.id);
  if (!id) throw new Error('Payment id missing');

  return {
    id,
    workspace_id: toStringOrNull(obj.workspace_id) ?? undefined,
    amount: toStringOrNull(obj.amount) ?? '0',
    currency: normalizeCurrencyCode(toStringOrNull(obj.currency) ?? DEFAULT_CURRENCY),
    status: toStringOrNull(obj.status) as Payment['status'] ?? 'processing',
    payment_method: toStringOrNull(obj.payment_method) ?? undefined,
    failure_code: toStringOrNull(obj.failure_code) ?? undefined,
    failure_message: toStringOrNull(obj.failure_message) ?? undefined,
    retryable_until: toStringOrNull(obj.retryable_until) ?? undefined,
    metadata: (obj.metadata && typeof obj.metadata === 'object')
      ? (obj.metadata as Record<string, unknown>)
      : {},
    created_at: toStringOrNull(obj.created_at) ?? new Date().toISOString(),
    updated_at: toStringOrNull(obj.updated_at) ?? new Date().toISOString(),
    invoice: obj.invoice ? parseInvoice(obj.invoice) : null,
    initiator: parseTransactionInitiator(obj.initiator),
  };
}

function parseTransactionInitiator(raw: unknown): TransactionInitiator | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = toStringOrNull(obj.id);
  if (!id) return null;
  return {
    id,
    username: toStringOrNull(obj.username) ?? undefined,
    email: toStringOrNull(obj.email) ?? undefined,
  };
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  status: 'received' | 'processing' | 'processed' | 'ignored' | 'failed';
  created_at: string;
  attempts: number;
  last_attempt_at?: string;
  error_message?: string;
}

export interface PurchaseTokenRequest {
  product_key: string;
  quantity?: number;
}

export interface PurchasePlanRequest {
  target_plan: string;
  effective_timing?: 'immediate' | 'next_period';
  effective_date?: string;
  reason?: string;
  billing_cycle?: 'monthly' | 'annual';
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PlanChangeRequestRecord {
  id: string;
  change_type: string;
  effective_timing: string;
  effective_date?: string | null;
  status: string;
  reason?: string | null;
  admin_notes?: string | null;
  requested_at?: string | null;
  processed_at?: string | null;
  requested_by?: SubscriptionBillingOwner | null;
  processed_by?: SubscriptionBillingOwner | null;
  from_plan?: BillingPlan | null;
  to_plan?: BillingPlan | null;
}

export interface PlanChangeResponse {
  plan_change_request: PlanChangeRequestRecord;
  subscription: WorkspaceSubscription;
}

export interface WorkspaceAutoRenewResponse {
  auto_renew_enabled: boolean;
  status: string;
  current_plan_id: string;
  workspace_id: string;
  previous?: boolean | null;
}

export interface UserBillingProfileSummary {
  user: {
    id: string;
    username?: string | null;
    email?: string | null;
  };
  stripe_customer_id: string;
  default_payment_method_id?: string;
  credit_balance: string;
  currency: string;
  last_synced_at?: string | null;
  last_stripe_balance: string;
  created_at: string;
  updated_at: string;
}

// === Error Handling ===

export class BillingAPIError extends Error {
  constructor(
    public status: number,
    public code?: string,
    message?: string,
    public errors?: Record<string, string[]>
  ) {
    super(message || `Billing API Error (${status})`);
    this.name = 'BillingAPIError';
  }
}

/**
 * Parse API error response and throw BillingAPIError
 */
async function handleErrorResponse(res: Response): Promise<never> {
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response
  }

  throw new BillingAPIError(
    res.status,
    payload?.code || payload?.error_code || `HTTP_${res.status}`,
    payload?.message || payload?.error || payload?.detail || res.statusText,
    payload?.errors,
  );
}

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const name = 'csrftoken';
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Base fetch wrapper with error handling
 */
async function apiFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
  // Get authentication token from localStorage
  const token =
    (typeof window !== 'undefined' && window.sessionStorage.getItem('authToken')) ||
    (typeof window !== 'undefined' && window.localStorage.getItem('authToken'));

  // Get CSRF token from cookie
  const csrfToken = getCsrfToken();

  const headers = {
    'Content-Type': 'application/json',
    // Include token if available (primary authentication method)
    ...(token && { 'Authorization': `Token ${token}` }),
    // Include CSRF token for POST/PUT/PATCH/DELETE requests
    ...(csrfToken && { 'X-CSRFToken': csrfToken }),
    ...init?.headers,
  };

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: headers,
  });

  if (!res.ok) {
    await handleErrorResponse(res);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return null as T;
  }

  return res.json();
}

// === Query Keys ===

export const billingKeys = {
  all: ['billing'] as const,

  user: {
    all: ['billing', 'user'] as const,
    products: () => ['billing', 'user', 'products'] as const,
    profile: () => ['billing', 'user', 'profile'] as const,
    subscriptions: () => ['billing', 'user', 'subscriptions'] as const,
    transactions: (params: Record<string, any>) =>
      ['billing', 'user', 'transactions', params] as const,
    invoices: (params: Record<string, any>) =>
      ['billing', 'user', 'invoices', params] as const,
    payments: (params: Record<string, any>) =>
      ['billing', 'user', 'payments', params] as const,
  },

  workspace: {
    all: (workspaceId: string) => ['billing', 'workspace', workspaceId] as const,
    products: (workspaceId: string) =>
      ['billing', 'workspace', workspaceId, 'products'] as const,
    subscription: (workspaceId: string) =>
      ['billing', 'workspace', workspaceId, 'subscription'] as const,
    plans: (workspaceId: string) =>
      ['billing', 'workspace', workspaceId, 'plans'] as const,
    transactions: (workspaceId: string, params: Record<string, any>) =>
      ['billing', 'workspace', workspaceId, 'transactions', params] as const,
    invoices: (workspaceId: string, params: Record<string, any>) =>
      ['billing', 'workspace', workspaceId, 'invoices', params] as const,
    payments: (workspaceId: string, params: Record<string, any>) =>
      ['billing', 'workspace', workspaceId, 'payments', params] as const,
    webhooks: (workspaceId: string, params: Record<string, any>) =>
      ['billing', 'workspace', workspaceId, 'webhooks', params] as const,
    autoRenew: (workspaceId: string) =>
      ['billing', 'workspace', workspaceId, 'auto-renew'] as const,
    usage: (workspaceId: string) =>
      ['billing', 'workspace', workspaceId, 'usage'] as const,
    owner: (workspaceId: string) =>
      ['billing', 'workspace', workspaceId, 'owner'] as const,
  },
} as const;

// === User Billing APIs ===

/**
 * GET /api/billing/token-products/
 */
export const userTokenProductsQuery = queryOptions({
  queryKey: billingKeys.user.products(),
  queryFn: async () => {
    return apiFetch<TokenProductsResponse>('/api/billing/token-products/');
  },
  staleTime: 5 * 60 * 1000,
});

/**
 * GET /api/billing/profile/credit/
 */
export const userBillingProfileQuery = queryOptions({
  queryKey: billingKeys.user.profile(),
  queryFn: async () => {
    return apiFetch<UserBillingProfileSummary>('/api/billing/profile/credit/');
  },
  staleTime: 60 * 1000,
});

export const userWorkspaceSubscriptionsQuery = queryOptions({
  queryKey: billingKeys.user.subscriptions(),
  queryFn: async () => {
    const payload = await apiFetch<unknown>('/api/billing/workspaces/subscriptions/');
    if (!Array.isArray(payload)) {
      throw new Error('Invalid subscription list payload');
    }
    return payload.map((item) => parseWorkspaceSubscription(item));
  },
  staleTime: 60 * 1000,
});

/**
 * GET /api/billing/transactions/
 */
export function userTransactionsQuery(params: {
  page?: number;
  page_size?: number;
  ordering?: string;
  category?: TransactionCategory;
  status?: TransactionStatus;
  direction?: TransactionDirection;
  currency?: string;
  occurred_after?: string;
  occurred_before?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.user.transactions(params),
    queryFn: async () => {
      const url = `/api/billing/transactions/?${searchParams}`;
      return apiFetch<PaginatedTransactions>(url);
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * GET /api/billing/invoices/
 */
export function userInvoicesQuery(params: {
  page?: number;
  status?: string;
  currency?: string;
  issued_after?: string;
  issued_before?: string;
  due_before?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.user.invoices(params),
    queryFn: async () => {
      const query = searchParams.toString();
      const url = `/api/billing/invoices/${query ? `?${query}` : ''}`;
      const response = await apiFetch<PaginatedList<unknown>>(url);
      return {
        ...response,
        results: (response.results || []).map(parseInvoice),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * GET /api/billing/payments/
 */
export function userPaymentsQuery(params: {
  page?: number;
  status?: string;
  created_after?: string;
  created_before?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.user.payments(params),
    queryFn: async () => {
      const query = searchParams.toString();
      const url = `/api/billing/payments/${query ? `?${query}` : ''}`;
      const response = await apiFetch<PaginatedList<unknown>>(url);
      return {
        ...response,
        results: (response.results || []).map(parsePayment),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRetryUserPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      return apiFetch<{ payment: Payment; invoice: Invoice | null }>(
        `/api/billing/payments/${paymentId}/retry/`,
        {
          method: 'POST',
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.user.payments({}) });
      queryClient.invalidateQueries({ queryKey: billingKeys.user.transactions({}) });
      queryClient.invalidateQueries({ queryKey: billingKeys.user.profile() });
    },
  });
}

export function useRefundUserPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      amount,
      currency,
      reason,
    }: {
      paymentId: string;
      amount: string;
      currency?: string;
      reason?: string;
    }) => {
      return apiFetch<{ payment: Payment; refund: Record<string, unknown> }>(
        `/api/billing/payments/${paymentId}/refund/`,
        {
          method: 'POST',
          body: JSON.stringify({ amount, currency, reason }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.user.payments({}) });
      queryClient.invalidateQueries({ queryKey: billingKeys.user.transactions({}) });
      queryClient.invalidateQueries({ queryKey: billingKeys.user.profile() });
    },
  });
}

/**
 * POST /api/billing/purchase/ - Purchase tokens (User)
 */
export function usePurchaseUserTokens() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PurchaseTokenRequest) => {
      const idempotencyKey = crypto.randomUUID();
      return apiFetch<CheckoutResponse>('/api/billing/purchase/', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      // Invalidate user token products and transactions
      queryClient.invalidateQueries({ queryKey: billingKeys.user.products() });
      queryClient.invalidateQueries({ queryKey: billingKeys.user.all });
      queryClient.invalidateQueries({ queryKey: billingKeys.user.profile() });
    },
  });
}

// === Workspace Billing APIs ===

/**
 * GET /api/billing/workspaces/{id}/billing/token-products/
 */
export function workspaceTokenProductsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.workspace.products(workspaceId),
    queryFn: async () => {
      return apiFetch<TokenProductsResponse>(
        `/api/billing/workspaces/${workspaceId}/billing/token-products/`
      );
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/subscription/
 */
export function workspaceSubscriptionQuery(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.workspace.subscription(workspaceId),
    queryFn: async () => {
      const result = await apiFetch<unknown>(
        `/api/billing/workspaces/${workspaceId}/billing/subscription/`
      );
      if (result === null) {
        return null;
      }
      return parseWorkspaceSubscription(result);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/plans/
 */
export function workspacePlansQuery(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.workspace.plans(workspaceId),
    queryFn: async () => {
      const response = await apiFetch<unknown>(
        `/api/billing/workspaces/${workspaceId}/billing/plans/`
      );
      return parseWorkspacePlanList(response);
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/transactions
 */
export function workspaceTransactionsQuery(
  workspaceId: string,
  params: {
    page?: number;
    page_size?: number;
    ordering?: string;
    category?: TransactionCategory;
    status?: TransactionStatus;
    occurred_after?: string;
    occurred_before?: string;
  } = {}
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.workspace.transactions(workspaceId, params),
    queryFn: async () => {
      const url = `/api/billing/workspaces/${workspaceId}/billing/transactions/?${searchParams}`;
      return apiFetch<PaginatedTransactions>(url);
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/invoices/
 */
export function workspaceInvoicesQuery(
  workspaceId: string,
  params: {
    page?: number;
    status?: string;
    currency?: string;
    issued_after?: string;
    issued_before?: string;
  } = {}
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.workspace.invoices(workspaceId, params),
    queryFn: async () => {
      const url = `/api/billing/workspaces/${workspaceId}/billing/invoices/?${searchParams}`;
      return apiFetch<{ count: number; results: Invoice[] }>(url);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/payments/
 */
export function workspacePaymentsQuery(
  workspaceId: string,
  params: { page?: number; status?: string; created_after?: string; created_before?: string } = {}
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.workspace.payments(workspaceId, params),
    queryFn: async () => {
      const url = `/api/billing/workspaces/${workspaceId}/billing/payments/?${searchParams}`;
      return apiFetch<{ count: number; results: Payment[] }>(url);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/webhook-events/
 */
export function workspaceWebhookEventsQuery(
  workspaceId: string,
  params: { page?: number; status?: string; event_type?: string; created_after?: string; created_before?: string } = {}
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) searchParams.set(key, String(value));
  });

  return queryOptions({
    queryKey: billingKeys.workspace.webhooks(workspaceId, params),
    queryFn: async () => {
      const url = `/api/billing/workspaces/${workspaceId}/billing/webhook-events/?${searchParams}`;
      return apiFetch<{ count: number; results: WebhookEvent[] }>(url);
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/subscription/auto-renew/
 */
export function workspaceAutoRenewQuery(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.workspace.autoRenew(workspaceId),
    queryFn: async () => {
      const payload = await apiFetch<unknown>(
        `/api/billing/workspaces/${workspaceId}/billing/subscription/auto-renew/`
      );
      return parseWorkspaceAutoRenew(payload);
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/usage/
 */
export function workspaceUsageQuery(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.workspace.usage(workspaceId),
    queryFn: async () => {
      return apiFetch<WorkspaceUsageSnapshot>(
        `/api/billing/workspaces/${workspaceId}/billing/usage/`
      );
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * GET /api/billing/workspaces/{id}/billing/subscription/owner/
 */
export function workspaceBillingOwnerQuery(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.workspace.owner(workspaceId),
    queryFn: async () => {
      return apiFetch<WorkspaceBillingOwnerResponse>(
        `/api/billing/workspaces/${workspaceId}/billing/subscription/owner/`
      );
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!workspaceId,
  });
}

/**
 * POST /api/billing/workspaces/{id}/billing/purchase/ - Purchase tokens (Workspace)
 */
export function usePurchaseWorkspaceTokens(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PurchaseTokenRequest) => {
      const idempotencyKey = crypto.randomUUID();
      return apiFetch<CheckoutResponse>(
        `/api/billing/workspaces/${workspaceId}/billing/purchase/`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(data),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.products(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.all(workspaceId),
      });
    },
  });
}

/**
 * POST /api/billing/workspaces/{id}/billing/purchase/plan/ - Change subscription plan
 */
export function usePurchaseWorkspacePlan(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PurchasePlanRequest) => {
      const idempotencyKey = crypto.randomUUID();
      const response = await apiFetch<unknown>(
        `/api/billing/workspaces/${workspaceId}/billing/purchase/plan/`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(data),
        }
      );
      if (isCheckoutResponse(response)) {
        return response;
      }
      return parsePlanChangeResponse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.subscription(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.all(workspaceId),
      });
    },
  });
}

/**
 * PATCH /api/billing/workspaces/{id}/billing/subscription/auto-renew/
 */
export function useToggleWorkspaceAutoRenew(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enabled }: { enabled: boolean }) => {
      return apiFetch<WorkspaceAutoRenewResponse>(
        `/api/billing/workspaces/${workspaceId}/billing/subscription/auto-renew/`,
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.subscription(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.autoRenew(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.all(workspaceId),
      });
    },
  });
}

/**
 * DELETE /api/billing/workspaces/{id}/billing/subscription/owner/
 */
export function useReleaseWorkspaceBillingOwner(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiFetch<void>(
        `/api/billing/workspaces/${workspaceId}/billing/subscription/owner/`,
        {
          method: 'DELETE',
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.owner(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.subscription(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: billingKeys.workspace.all(workspaceId),
      });
    },
  });
}

/**
 * Download invoice PDF
 * Returns blob URL for download
 */
export async function downloadInvoicePDF(
  invoiceId: string,
  options: { workspaceId?: string } = {}
): Promise<string> {
  const { workspaceId } = options;
  const url = workspaceId
    ? `/api/billing/workspaces/${workspaceId}/billing/invoices/${invoiceId}/pdf`
    : `/api/billing/invoices/${invoiceId}/pdf/`;

  const res = await fetch(url, {
    credentials: 'include',
  });

  if (!res.ok) {
    await handleErrorResponse(res);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function normalizeCurrencyCode(value?: string | null): string {
  const normalized = typeof value === 'string' && value.trim().length > 0
    ? value.trim().toUpperCase()
    : DEFAULT_CURRENCY;
  return normalized;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseBillingOwner(raw: unknown): SubscriptionBillingOwner | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = toStringOrNull(obj.id);
  if (!id) return null;
  return {
    id,
    username: toStringOrNull(obj.username),
    email: toStringOrNull(obj.email),
  };
}

function parseBillingPlan(raw: unknown): BillingPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = toStringOrNull(obj.id) ?? crypto.randomUUID();
  const key = toStringOrNull(obj.key) ?? toStringOrNull(obj.plan_key) ?? 'unknown';
  const name = toStringOrNull(obj.name) ?? key;
  return {
    id,
    key,
    name,
    description: toStringOrNull(obj.description),
    monthly_price: toStringOrNull(obj.monthly_price) ?? '0',
    max_users: toNumber(obj.max_users),
    max_storage_gb: toNumber(obj.max_storage_gb),
    is_current: Boolean(obj.is_current),
    currency: obj.currency ? normalizeCurrencyCode(toStringOrNull(obj.currency)) : null,
  };
}

export function parseWorkspaceSubscription(raw: unknown): WorkspaceSubscription {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid subscription payload');
  }
  const obj = raw as Record<string, unknown>;
  const plan = parseBillingPlan(obj.plan ?? null);
  const pendingPlan = parseBillingPlan(obj.pending_plan ?? null);
  return {
    id: String(obj.id ?? ''),
    workspace_id: toStringOrNull(obj.workspace_id) ?? undefined,
    workspace_name: toStringOrNull(obj.workspace_name) ?? undefined,
    plan,
    plan_key: toStringOrNull(obj.plan_key) ?? plan?.key ?? null,
    pending_plan: pendingPlan,
    pending_plan_key: toStringOrNull(obj.pending_plan_key),
    status: (toStringOrNull(obj.status) ?? 'active') as SubscriptionStatus,
    current_period_start: toStringOrNull(obj.current_period_start),
    current_period_end: toStringOrNull(obj.current_period_end),
    trial_end: toStringOrNull(obj.trial_end),
    canceled_at: toStringOrNull(obj.canceled_at),
    stripe_subscription_id: toStringOrNull(obj.stripe_subscription_id),
    stripe_customer_id: toStringOrNull(obj.stripe_customer_id),
    auto_renew_enabled: Boolean(obj.auto_renew_enabled),
    renewal_attempt_count: toNumber(obj.renewal_attempt_count) ?? undefined,
    last_renewal_attempt_at: toStringOrNull(obj.last_renewal_attempt_at),
    last_renewal_status: toStringOrNull(obj.last_renewal_status),
    notes: toStringOrNull(obj.notes),
    latest_invoice_message: toStringOrNull(obj.latest_invoice_message),
    billing_owner: parseBillingOwner(obj.billing_owner),
  };
}

export function parseWorkspacePlanList(raw: unknown): WorkspacePlanList {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid plans payload');
  }
  const obj = raw as Record<string, unknown>;
  const plansRaw = Array.isArray(obj.plans) ? obj.plans : [];
  const plans = plansRaw
    .map((plan) => parseBillingPlan(plan))
    .filter((plan): plan is BillingPlan => Boolean(plan));
  const currentPlanRaw = (obj.current_plan as Record<string, unknown>) || {};
  return {
    plans,
    current_plan: {
      key: toStringOrNull(currentPlanRaw?.key ?? null),
      name: toStringOrNull(currentPlanRaw?.name ?? null),
    },
    subscription_id: toStringOrNull(obj.subscription_id),
  };
}

export function parseWorkspaceAutoRenew(raw: unknown): WorkspaceAutoRenewResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid auto-renew payload');
  }
  const obj = raw as Record<string, unknown>;
  return {
    auto_renew_enabled: Boolean(obj.auto_renew_enabled),
    status: toStringOrNull(obj.status) ?? 'unknown',
    current_plan_id: toStringOrNull(obj.current_plan_id) ?? '',
    workspace_id: toStringOrNull(obj.workspace_id) ?? '',
    previous: typeof obj.previous === 'boolean' ? obj.previous : null,
  };
}

function parsePlanChangeRequest(raw: unknown): PlanChangeRequestRecord {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid plan change request payload');
  }
  const obj = raw as Record<string, unknown>;
  return {
    id: toStringOrNull(obj.id) ?? '',
    change_type: toStringOrNull(obj.change_type) ?? 'change',
    effective_timing: toStringOrNull(obj.effective_timing) ?? 'immediate',
    effective_date: toStringOrNull(obj.effective_date),
    status: toStringOrNull(obj.status) ?? 'pending',
    reason: toStringOrNull(obj.reason),
    admin_notes: toStringOrNull(obj.admin_notes),
    requested_at: toStringOrNull(obj.requested_at),
    processed_at: toStringOrNull(obj.processed_at),
    requested_by: parseBillingOwner(obj.requested_by),
    processed_by: parseBillingOwner(obj.processed_by),
    from_plan: parseBillingPlan(obj.from_plan),
    to_plan: parseBillingPlan(obj.to_plan),
  };
}

function parsePlanChangeResponse(raw: unknown): PlanChangeResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid plan change payload');
  }
  const obj = raw as Record<string, unknown>;
  return {
    plan_change_request: parsePlanChangeRequest(obj.plan_change_request),
    subscription: parseWorkspaceSubscription(obj.subscription),
  };
}

function isCheckoutResponse(raw: unknown): raw is CheckoutResponse {
  return (
    !!raw &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>).checkout_url === 'string'
  );
}

/**
 * Format currency amount with Intl
 */
export function formatCurrency(
  amount: string | number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE
): string {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const numericAmount = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(numericAmount)) {
    return `${normalizedCurrency} ${amount}`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    currencyDisplay: 'code',  // Display 'AUD' instead of '$'
  }).format(numericAmount);
}

/**
 * Format date/time
 */
export function formatDateTime(
  dateString: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
  locale: string = DEFAULT_LOCALE
): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(dateString));
}

/**
 * Format date only
 */
export function formatDate(dateString: string, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(dateString)
  );
}
