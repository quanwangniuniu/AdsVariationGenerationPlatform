import axiosInstance from '@/lib/axiosConfig';
import { appendAuthHeaders } from '@/lib/authHelpers';

export interface Creative {
  ad_creative_id: string;
  advertiser_name?: string;
  format: 'text' | 'image' | 'video' | string;
  image_url?: string | null;
  video_link?: string | null;
  width?: number | null;
  height?: number | null;
  target_domain?: string | null;
  first_shown?: string | null;
  last_shown?: string | null;
  details_link?: string | null;
  region?: string | null;
  platform?: string | null;
  fetched_at?: string | null;
  creative_title?: string | null;
  title?: string | null;
}

export interface PaginatedCreatives {
  count: number;
  next: string | null;
  previous: string | null;
  results: Creative[];
}

export interface CreativeListParams {
  page?: number;
  pageSize?: number;
  ordering?: string;
  format?: string;
  platform?: string;
  search?: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function normalizeCreatives(payload: unknown): PaginatedResponse<Creative> {
  if (Array.isArray(payload)) {
    return {
      count: payload.length,
      next: null,
      previous: null,
      results: payload as Creative[],
    };
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const results = Array.isArray(data.results) ? (data.results as Creative[]) : [];
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

function authHeaders(token: string | null) {
  return appendAuthHeaders(
    token ? { Authorization: `Token ${token}` } : undefined,
  );
}

export async function listCreatives(
  token: string | null,
  params: CreativeListParams = {},
): Promise<PaginatedCreatives> {
  const query = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? 12,
    ordering: params.ordering,
    format: params.format,
    platform: params.platform,
    search: params.search,
  };

  const response = await axiosInstance.get<PaginatedCreatives>(
    '/api/adspark/creatives/',
    {
      params: query,
      headers: authHeaders(token),
    },
  );

  return normalizeCreatives(response.data);
}

export async function getCreative(
  token: string | null,
  id: string,
): Promise<Creative> {
  const response = await axiosInstance.get<Creative>(
    `/api/adspark/creatives/${id}/`,
    {
      headers: authHeaders(token),
    },
  );
  return response.data;
}
