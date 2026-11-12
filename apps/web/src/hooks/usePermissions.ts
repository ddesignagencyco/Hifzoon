'use client';

import { useQuery } from '@tanstack/react-query';
import { permissionsApi } from '@/lib/api/modules/permissions-admin';

/**
 * The signed-in person's effective permission keys (`GET /admin/permissions/mine`).
 * `can(key)` is only for hiding controls; the API still enforces every permission.
 * While loading (or if the call fails) `can` is false, so buttons stay hidden rather than 403.
 */
export function useMyPermissions() {
  const query = useQuery({
    queryKey: ['admin', 'permissions', 'mine'],
    queryFn: permissionsApi.mine,
    staleTime: 5 * 60 * 1000,
  });
  const keys = new Set(query.data?.permissions ?? []);
  return { can: (key: string) => keys.has(key), isLoading: query.isLoading };
}
