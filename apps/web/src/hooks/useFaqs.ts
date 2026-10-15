'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchFaqs } from '@/lib/api/client';
import { KNOWLEDGE_BASE_FAQS } from '@/lib/data/baseline-catalog';

export const FAQS_QUERY_KEY = ['faqs'] as const;

export function useFaqs() {
  const query = useQuery<Array<{ q: string; a: string }>, Error>({
    queryKey: FAQS_QUERY_KEY,
    queryFn: fetchFaqs,
    placeholderData: KNOWLEDGE_BASE_FAQS,
    staleTime: 10 * 60 * 1000,
  });

  return {
    faqs: query.data ?? KNOWLEDGE_BASE_FAQS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
