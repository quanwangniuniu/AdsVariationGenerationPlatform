/**
 * Template API client utilities.
 *
 * Provides typed helpers around the backend Template endpoints
 * alongside a consistent error surface for the UI layer.
 */

import axiosInstance from '@/lib/axiosConfig';
import type { AxiosError } from 'axios';

export interface Template {
  id: string;
  title: string | null;
  content: string;
  word_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface TemplateCreateInput {
  title?: string;
  content: string;
}

export interface TemplateUpdateInput {
  title?: string;
  content?: string;
}

export interface TemplateListParams {
  page?: number;
  pageSize?: number;
  ordering?: string;
}

export interface PaginatedTemplates {
  count: number;
  next: string | null;
  previous: string | null;
  results: Template[];
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

const DEFAULT_LIST: PaginatedTemplates = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

function toApiError(error: unknown): ApiError {
  if ((error as ApiError)?.code && (error as ApiError)?.message) {
    return error as ApiError;
  }

  if (isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const data = error.response?.data ?? {};
    const code: string = typeof data.code === 'string' ? data.code : defaultCodeForStatus(status);
    const message: string = typeof data.message === 'string' && data.message.trim().length > 0
      ? data.message
      : defaultMessageForStatus(status);

    return {
      status,
      code,
      message,
    };
  }

  return {
    status: 500,
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
  };
}

function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && (error as AxiosError).isAxiosError === true;
}

function defaultCodeForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return 'AUTH_REQUIRED';
  }
  if (status >= 500) {
    return 'TEMPLATE_SAVE_FAILED';
  }
  return 'TEMPLATE_VALIDATION_FAILED';
}

function defaultMessageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return 'Authentication required.';
  }
  if (status >= 500) {
    return 'Template could not be saved. Try again later.';
  }
  return 'Template could not be validated.';
}

function parseTemplate(payload: unknown): Template {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid template payload received from API.');
  }

  const data = payload as Record<string, unknown>;

  const id = typeof data.id === 'string' ? data.id : '';
  const title = typeof data.title === 'string' && data.title.trim().length > 0 ? data.title : null;
  const content = typeof data.content === 'string' ? data.content : '';
  const wordCount = typeof data.word_count === 'number' ? data.word_count : Number(data.word_count ?? 0);
  const createdAt = typeof data.created_at === 'string' ? data.created_at : new Date().toISOString();
  const updatedAt = typeof data.updated_at === 'string' ? data.updated_at : null;

  if (!id || !content) {
    throw new Error('Template payload missing required fields.');
  }

  return {
    id,
    title,
    content,
    word_count: Number.isFinite(wordCount) ? wordCount : 0,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function parseListResponse(payload: unknown): PaginatedTemplates {
  if (Array.isArray(payload)) {
    return {
      ...DEFAULT_LIST,
      count: payload.length,
      results: payload.map(parseTemplate),
    };
  }

  if (!payload || typeof payload !== 'object') {
    return DEFAULT_LIST;
  }

  const data = payload as Record<string, unknown>;
  const results = Array.isArray(data.results) ? data.results.map(parseTemplate) : [];
  const count = typeof data.count === 'number' ? data.count : Number(data.count ?? results.length ?? 0);

  return {
    count: Number.isFinite(count) ? count : results.length,
    next: typeof data.next === 'string' ? data.next : null,
    previous: typeof data.previous === 'string' ? data.previous : null,
    results,
  };
}

export async function listTemplates(params: TemplateListParams = {}): Promise<PaginatedTemplates> {
  const query = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? 10,
    ordering: params.ordering,
  };

  try {
    const response = await axiosInstance.get('/api/templates/', { params: query });
    return parseListResponse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createTemplate(payload: TemplateCreateInput): Promise<Template> {
  try {
    const body: Record<string, unknown> = {};
    if (typeof payload.title === 'string') {
      body.title = payload.title.trim();
    }
    body.content = payload.content;
    const response = await axiosInstance.post('/api/templates/', body);
    return parseTemplate(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateTemplate(id: string, payload: TemplateUpdateInput): Promise<Template> {
  try {
    const body: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
      body.title = typeof payload.title === 'string' ? payload.title.trim() : payload.title ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'content')) {
      body.content = payload.content;
    }
    const response = await axiosInstance.patch(`/api/templates/${id}/`, body);
    return parseTemplate(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  try {
    await axiosInstance.delete(`/api/templates/${id}/`);
  } catch (error) {
    throw toApiError(error);
  }
}

export function mapTemplateError(error: ApiError): string {
  switch (error.code) {
    case 'TEMPLATE_TOO_LONG':
      return 'Your template is too long (max 48 words).';
    case 'TEMPLATE_BLOCKED_BY_POLICY':
      return 'Your template violates content policy.';
    case 'TEMPLATE_EMPTY':
      return 'Template content is required.';
    case 'AUTH_REQUIRED':
    case 'UNAUTHORIZED':
      return 'Please sign in to continue.';
    case 'TEMPLATE_SAVE_FAILED':
    case 'TEMPLATE_UPDATE_FAILED':
      return 'The template could not be saved. Please try again.';
    default:
      return 'Something went wrong.';
  }
}

export function getWordCount(text: string): number {
  const matches = text.match(/[A-Za-z']+/g);
  return matches ? matches.length : 0;
}

export const WORD_LIMIT = 48;

export { toApiError };

