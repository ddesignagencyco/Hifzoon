'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { AyahRef, mushafApi, MushafLayout, isValidPage } from '@/lib/api/modules/mushaf';
import { fetchPublicQuranPage } from '@/lib/api/modules/quran-public';

export const mushafKeys = {
  all: ['mushaf'] as const,
  layouts: ['mushaf', 'layouts'] as const,
  page: (layout: MushafLayout, page: number) => ['mushaf', 'page', layout, page] as const,
  words: (layout: MushafLayout, surah: number, ayah: number) => ['mushaf', 'words', layout, surah, ayah] as const,
};

/** The backend caches page content for up to 6 days, so a long client cache is safe. */
const CONTENT_STALE_MS = 30 * 60 * 1000;

export function useMushafLayouts() {
  return useQuery({
    queryKey: mushafKeys.layouts,
    queryFn: mushafApi.layouts,
    staleTime: Infinity,
  });
}

export function useMushafPage(layout: MushafLayout | null | undefined, page: number | null | undefined) {
  const enabled = !!layout && typeof page === 'number' && isValidPage(page);
  return useQuery({
    queryKey: mushafKeys.page(layout ?? 'MADANI_15', page ?? 0),
    queryFn: () => mushafApi.page(layout as MushafLayout, page as number),
    enabled,
    staleTime: CONTENT_STALE_MS,
  });
}

/** Word data for every ayah on a page (one request per ayah, cached individually). */
/** Public Madani page text (Quran.com) when the API has no licensed provider. */
export function usePublicQuranPage(page: number | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['mushaf', 'public-text', page ?? 0],
    queryFn: () => fetchPublicQuranPage(page as number),
    enabled: enabled && typeof page === 'number' && isValidPage(page),
    staleTime: Infinity,
    // Unreachable? Show the ayah structure straight away rather than wait for a retry.
    retry: false,
  });
}

export function useMushafPageWords(layout: MushafLayout | null | undefined, ayahs: AyahRef[], enabled = true) {
  return useQueries({
    queries: ayahs.map((ref) => ({
      queryKey: mushafKeys.words(layout ?? 'MADANI_15', ref.surah, ref.ayah),
      queryFn: () => mushafApi.ayahWords({ layout: layout as MushafLayout, surah: ref.surah, ayah: ref.ayah }),
      enabled: enabled && !!layout,
      staleTime: CONTENT_STALE_MS,
    })),
  });
}
