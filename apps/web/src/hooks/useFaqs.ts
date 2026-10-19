'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchFaqs } from '@/lib/api/client';

export const FAQS_QUERY_KEY = ['faqs'] as const;

export function useFaqs() {
  const query = useQuery<Array<{ q: string; a: string }>, Error>({
    queryKey: FAQS_QUERY_KEY,
    queryFn: fetchFaqs,
    staleTime: 10 * 60 * 1000,
  });

  return {
    faqs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
