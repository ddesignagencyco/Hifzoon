import { useQuery } from '@tanstack/react-query';
import { http } from '../http';

/**
 * Duas board content: `GET /content/duas` (apps/api/src/modules/content). Hisn al-Muslim,
 * imported from hisnmuslim.com into the API, so the browser never calls a third party.
 */

export interface DuaItem {
  /** Entry number in Hisn al-Muslim. */
  id: number;
  title: string;
  arabic: string;
  /** Empty when the source gives none. */
  transliteration: string;
  /** Meaning per language; the source publishes English only. */
  translation: Partial<Record<'en' | 'ur', string>>;
  repeat: number;
  reference: string;
}

export interface DuaCategory {
  /** Chapter number in Hisn al-Muslim. */
  id: number;
  title: string;
  titleAr: string;
  duas: DuaItem[];
}

export interface DuaCollection {
  source: { name: string; author: string; url: string; languages: string[]; importedAt: string };
  categories: DuaCategory[];
}

export const duasApi = {
  list: () => http.get<DuaCollection>('/content/duas'),
};

export const DUAS_QUERY_KEY = ['content', 'duas'] as const;

/** The dua chapters, fetched once per session (the content changes only on re-import). */
export function useDuaCollection(enabled = true) {
  return useQuery({
    queryKey: DUAS_QUERY_KEY,
    queryFn: duasApi.list,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
