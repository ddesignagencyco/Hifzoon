'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hifzApi } from '@/lib/api/modules/hifz';

export const hifzKeys = {
  pages: (studentId: string) => ['hifz', 'pages', studentId] as const,
  page: (studentId: string, page: number) => ['hifz', 'page', studentId, page] as const,
};

export function useHifzPages(studentId: string | null | undefined) {
  return useQuery({
    queryKey: hifzKeys.pages(studentId ?? ''),
    queryFn: () => hifzApi.pages(studentId as string),
    enabled: Boolean(studentId),
    staleTime: 60 * 1000,
  });
}

export function useHifzPage(studentId: string, page: number | null) {
  return useQuery({
    queryKey: hifzKeys.page(studentId, page ?? 0),
    queryFn: () => hifzApi.page(studentId, page as number),
    enabled: page !== null,
  });
}

export function useInitializeHifz(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => hifzApi.initialize(studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: hifzKeys.pages(studentId) }),
  });
}
