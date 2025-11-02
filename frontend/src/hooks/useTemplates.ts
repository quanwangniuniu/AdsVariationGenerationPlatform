import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  PaginatedTemplates,
  Template,
  TemplateCreateInput,
  TemplateListParams,
  TemplateUpdateInput,
  createTemplate,
  deleteTemplate,
  listTemplates,
  mapTemplateError,
  toApiError,
  updateTemplate,
} from '@/api/templates';

export interface UseTemplatesOptions extends TemplateListParams {
  enabled?: boolean;
}

export interface TemplateMutationHandlers {
  onSuccess?: (template: Template) => void;
  onError?: (error: ApiError) => void;
}

const DEFAULT_PARAMS: Required<TemplateListParams> = {
  page: 1,
  pageSize: 10,
  ordering: '-created_at',
};

function buildListParams(params?: TemplateListParams): Required<TemplateListParams> {
  return {
    page: params?.page ?? DEFAULT_PARAMS.page,
    pageSize: params?.pageSize ?? DEFAULT_PARAMS.pageSize,
    ordering: params?.ordering ?? DEFAULT_PARAMS.ordering,
  };
}

function listKey(params: Required<TemplateListParams>) {
  return ['templates', 'list', params] as const;
}

export function useTemplates(options?: UseTemplatesOptions) {
  const { enabled = true, ...queryParams } = options ?? {};
  const resolved = buildListParams(queryParams);

  const query = useQuery<PaginatedTemplates, ApiError>({
    queryKey: listKey(resolved),
    queryFn: async () => listTemplates(resolved),
    keepPreviousData: true,
    enabled,
  });

  return {
    ...query,
    params: resolved,
  };
}

export function useTemplateMutations(params?: UseTemplatesOptions, handlers: TemplateMutationHandlers = {}) {
  const resolved = buildListParams(params);
  const queryClient = useQueryClient();
  const queryKey = listKey(resolved);

  const create = useMutation<Template, ApiError, TemplateCreateInput>({
    mutationFn: async (input) => createTemplate(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PaginatedTemplates>(queryKey);

      const optimistic: Template = {
        id: `optimistic-${Date.now()}`,
        title: typeof input.title === 'string' && input.title.trim().length > 0 ? input.title.trim() : null,
        content: input.content,
        word_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<PaginatedTemplates>(queryKey, (current) => {
        const base = current ?? { count: 0, next: null, previous: null, results: [] };
        return {
          ...base,
          count: (base.count ?? 0) + 1,
          results: [optimistic, ...(base.results ?? [])],
        };
      });

      return { previous, optimisticId: optimistic.id };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      handlers.onError?.(error);
    },
    onSuccess: (template, _input, context) => {
      queryClient.setQueryData<PaginatedTemplates>(queryKey, (current) => {
        if (!current) {
          return {
            count: 1,
            next: null,
            previous: null,
            results: [template],
          };
        }
        return {
          ...current,
          results: current.results.map((item) => (item.id === context?.optimisticId ? template : item)),
        };
      });
      handlers.onSuccess?.(template);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const update = useMutation<Template, ApiError, { id: string; payload: TemplateUpdateInput }>({
    mutationFn: async ({ id, payload }) => updateTemplate(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PaginatedTemplates>(queryKey);
      queryClient.setQueryData<PaginatedTemplates>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          results: current.results.map((item) =>
            item.id === id
              ? {
                  ...item,
                  title: Object.prototype.hasOwnProperty.call(payload, 'title')
                    ? typeof payload.title === 'string' && payload.title.trim().length > 0
                      ? payload.title.trim()
                      : null
                    : item.title,
                  content: Object.prototype.hasOwnProperty.call(payload, 'content') && payload.content !== undefined
                    ? payload.content
                    : item.content,
                }
              : item,
          ),
        };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      handlers.onError?.(error);
    },
    onSuccess: (template) => {
      queryClient.setQueryData<PaginatedTemplates>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          results: current.results.map((item) => (item.id === template.id ? template : item)),
        };
      });
      handlers.onSuccess?.(template);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const remove = useMutation<void, ApiError, string>({
    mutationFn: async (id) => deleteTemplate(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PaginatedTemplates>(queryKey);
      queryClient.setQueryData<PaginatedTemplates>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          count: Math.max(0, (current.count ?? 0) - 1),
          results: current.results.filter((item) => item.id !== id),
        };
      });
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      handlers.onError?.(error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const errorMessage = useCallback(
    (error: ApiError | null | undefined) => {
      if (!error) return null;
      return mapTemplateError(error);
    },
    [],
  );

  return {
    create,
    update,
    remove,
    queryKey,
    getErrorMessage: errorMessage,
  };
}

export function ensureApiError(error: unknown): ApiError {
  return toApiError(error);
}

