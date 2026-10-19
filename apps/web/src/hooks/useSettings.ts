'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, SettingValue } from '@/lib/api/modules/settings';

export const settingsKeys = {
  all: ['admin-settings'] as const,
};

export function useAppSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: settingsApi.list });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, SettingValue>) => settingsApi.update(patch),
    // Invalidate on error too: the API applies keys one by one, so a failure may be partial.
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}

export function useClearMushafCache() {
  return useMutation({ mutationFn: (expiredOnly: boolean) => settingsApi.clearMushafCache(expiredOnly) });
}
