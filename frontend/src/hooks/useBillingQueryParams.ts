import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

interface UseBillingQueryParamsOptions {
  pageKey?: string;
  orderingKey?: string;
  defaultOrdering?: string;
}

export function useBillingQueryParams(options: UseBillingQueryParamsOptions = {}) {
  const { pageKey = 'page', orderingKey = 'ordering', defaultOrdering = '' } = options;

  const searchParams = useSearchParams();
  const router = useRouter();

  const page = useMemo(() => {
    const pageStr = searchParams.get(pageKey);
    return pageStr ? parseInt(pageStr, 10) : 1;
  }, [searchParams, pageKey]);

  const ordering = useMemo(() => {
    return searchParams.get(orderingKey) || defaultOrdering;
  }, [searchParams, orderingKey, defaultOrdering]);

  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newPage > 1) {
        params.set(pageKey, newPage.toString());
      } else {
        params.delete(pageKey);
      }
      router.push(`?${params.toString()}`);
    },
    [searchParams, router, pageKey]
  );

  const setOrdering = useCallback(
    (newOrdering: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newOrdering) {
        params.set(orderingKey, newOrdering);
      } else {
        params.delete(orderingKey);
      }
      // Reset to page 1 when changing ordering
      params.delete(pageKey);
      router.push(`?${params.toString()}`);
    },
    [searchParams, router, orderingKey, pageKey]
  );

  const getParam = useCallback(
    (key: string) => {
      return searchParams.get(key);
    },
    [searchParams]
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  const removeParam = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(key);
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  return {
    page,
    ordering,
    setPage,
    setOrdering,
    getParam,
    setParam,
    removeParam,
    searchParams,
  };
}

