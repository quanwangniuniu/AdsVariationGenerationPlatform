import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface Options {
  startKey: string;
  endKey: string;
}

export function useBillingDateRange({ startKey, endKey }: Options) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const startValue = searchParams.get(startKey) || undefined;
  const endValue = searchParams.get(endKey) || undefined;

  const update = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const setStartValue = useCallback(
    (value: string | undefined) => {
      update((params) => {
        if (!value) {
          params.delete(startKey);
        } else {
          params.set(startKey, value);
        }
      });
    },
    [update, startKey]
  );

  const setEndValue = useCallback(
    (value: string | undefined) => {
      update((params) => {
        if (!value) {
          params.delete(endKey);
        } else {
          params.set(endKey, value);
        }
      });
    },
    [update, endKey]
  );

  return {
    startValue,
    endValue,
    setStartValue,
    setEndValue,
  };
}
