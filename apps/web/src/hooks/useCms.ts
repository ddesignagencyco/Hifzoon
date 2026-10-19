'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cmsAdminApi, CmsFilters, SavePostInput } from '@/lib/api/modules/cms-admin';

export const cmsKeys = {
  all: ['cms'] as const,
  posts: (filters: CmsFilters) => ['cms', 'posts', filters] as const,
  postsAll: ['cms', 'posts'] as const,
  faq: (locale: string) => ['cms', 'faq', locale] as const,
  faqAll: ['cms', 'faq'] as const,
};

export function useCmsPosts(filters: CmsFilters) {
  return useQuery({
    queryKey: cmsKeys.posts(filters),
    queryFn: () => cmsAdminApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useSaveCmsPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SavePostInput) => cmsAdminApi.save(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.postsAll }),
  });
}

export function useDeleteCmsPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cmsAdminApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.postsAll }),
  });
}

export function usePublishedFaq(locale: string) {
  return useQuery({ queryKey: cmsKeys.faq(locale), queryFn: () => cmsAdminApi.publicFaq(locale) });
}

export function useModerateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => cmsAdminApi.moderateFaq(id, approved),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cmsKeys.faqAll });
      // The public FAQ hook (`useFaqs`) reads the same data.
      qc.invalidateQueries({ queryKey: ['faqs'] });
    },
  });
}
