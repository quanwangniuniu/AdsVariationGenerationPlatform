import axiosInstance from '@/lib/axiosConfig';
import { appendAuthHeaders } from '@/lib/authHelpers';

export interface AdVariant {
  id: number;
  original_ad: string;
  original_ad_title: string;
  original_ad_image: string | null;
  user: number;
  user_username: string;
  variant_title: string;
  variant_description: string;
  variant_image_url: string | null;
  ai_agent_platform: string;
  generation_status: 'pending' | 'processing' | 'completed' | 'failed';
  ai_prompt_used: string | null;
  generation_requested_at: string;
  generation_completed_at: string | null;
  generation_duration: number | null;
  confidence_score: number | null;
  token_transaction_id: string | null;
}

export interface PaginatedAdVariants {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdVariant[];
}

export interface WorkspaceAdVariant extends AdVariant {
  workspace: string;
  workspace_id: string;
  requested_by: string | null;
}

export interface AdVariantListParams {
  page?: number;
  pageSize?: number;
  ordering?: string;
  status?: string;
  search?: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function normalizePaginated<T>(payload: unknown): PaginatedResponse<T> {
  if (Array.isArray(payload)) {
    return {
      count: payload.length,
      next: null,
      previous: null,
      results: payload as T[],
    };
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const results = Array.isArray(data.results) ? (data.results as T[]) : [];
    const count =
      typeof data.count === 'number'
        ? data.count
        : typeof data.count === 'string'
        ? Number.parseInt(data.count, 10) || results.length
        : results.length;

    return {
      count,
      next: typeof data.next === 'string' ? data.next : null,
      previous: typeof data.previous === 'string' ? data.previous : null,
      results,
    };
  }

  return { count: 0, next: null, previous: null, results: [] };
}

function buildHeaders(token: string | null) {
  return appendAuthHeaders(
    token ? { Authorization: `Token ${token}` } : undefined,
  );
}

export async function listAdVariants(
  token: string | null,
  params: AdVariantListParams = {},
): Promise<PaginatedAdVariants> {
  const query = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? 12,
    ordering: params.ordering,
    generation_status: params.status,
    search: params.search,
  };

  const response = await axiosInstance.get(
    '/api/advariants/ad-variants/',
    {
      params: query,
      headers: buildHeaders(token),
    },
  );

  return normalizePaginated<AdVariant>(response.data);
}

export async function listWorkspaceAdVariants(
  workspaceId: string,
  token: string | null,
  params: AdVariantListParams = {},
): Promise<PaginatedAdVariants> {
  const query = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? 12,
    ordering: params.ordering,
    generation_status: params.status,
    search: params.search,
  };

  const response = await axiosInstance.get(
    `/api/advariants/workspaces/${workspaceId}/ai-variants/`,
    {
      params: query,
      headers: buildHeaders(token),
    },
  );

  return normalizePaginated<WorkspaceAdVariant>(response.data);
}
