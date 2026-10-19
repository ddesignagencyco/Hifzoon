'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentApi, ContentListQuery, SubmitFaqInput } from '@/lib/api/modules/content-public';

export const contentKeys = {
  list: (q: ContentListQuery) => ['content', 'list', q.type ?? '', q.locale ?? 'en', q.country ?? '', q.limit ?? 20] as const,
  page: (slug: string, locale: string) => ['content', 'page', slug, locale] as const,
  faqs: (locale: string) => ['content', 'faqs', locale] as const,
  course: (codeOrId: string) => ['content', 'course', codeOrId.toLowerCase()] as const,
};

export function useContentList(q: ContentListQuery = {}) {
  return useQuery({ queryKey: contentKeys.list(q), queryFn: () => contentApi.list(q), staleTime: 5 * 60 * 1000 });
}

export function useContentPage(slug: string | undefined, locale = 'en') {
  return useQuery({
    queryKey: contentKeys.page(slug ?? '', locale),
    queryFn: () => contentApi.bySlug(slug!, locale),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => (error as { status?: number })?.status !== 404 && count < 2,
  });
}

export function useCourseDetail(codeOrId: string | undefined) {
  return useQuery({
    queryKey: contentKeys.course(codeOrId ?? ''),
    queryFn: () => contentApi.courseDetail(codeOrId!),
    enabled: !!codeOrId,
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => (error as { status?: number })?.status !== 404 && count < 2,
  });
}

export function useSubmitFaq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitFaqInput) => contentApi.submitFaq(input),
    // Submissions are unapproved, so the public list will not change — but refresh it in
    // case a moderator approved something meanwhile.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content', 'faqs'] }),
  });
}
