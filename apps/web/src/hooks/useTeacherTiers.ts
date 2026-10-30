'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateTeacherTierInput,
  teacherTiersApi,
  UpdateTeacherTierInput,
} from '@/lib/api/modules/backend-updates-oct2026';
import { billingAdminApi } from '@/lib/api/modules/billing-admin';
import { http } from '@/lib/api/http';
import { financeKeys } from './useFinance';
import { billingKeys } from './useBilling';
import { PLANS_QUERY_KEY } from './usePlans';

export const tierKeys = {
  all: ['teacher-tiers'] as const,
  publicTiers: ['teacher-tiers', 'public-teachers'] as const,
};

interface PublicTeacherTierRow {
  id: string;
  tier: { code: string; name: string; badgeIcon: string | null } | null;
}

/**
 * Current tier of a teacher profile, read from the public directory (the only teacher read
 * that carries it for admins). `undefined` = not listed publicly yet.
 */
export function usePublicTeacherTier(profileId: string) {
  const query = useQuery({
    queryKey: tierKeys.publicTiers,
    queryFn: () => http.get<PublicTeacherTierRow[]>('/teachers/public'),
    staleTime: 60 * 1000,
  });
  const row = query.data?.find((t) => t.id === profileId);
  return { ...query, listed: Boolean(row), tier: row?.tier ?? null };
}

export function useTeacherTiers(enabled = true) {
  return useQuery({ queryKey: tierKeys.all, queryFn: teacherTiersApi.list, staleTime: 5 * 60 * 1000, enabled });
}

export function useCreateTeacherTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTeacherTierInput) => teacherTiersApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tierKeys.all }),
  });
}

export function useUpdateTeacherTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTeacherTierInput }) => teacherTiersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tierKeys.all }),
  });
}

/** Assigns (or clears with `null`) a teacher's tier. Callers refresh their own teacher queries. */
export function useAssignTeacherTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, tierId }: { profileId: string; tierId: string | null }) =>
      teacherTiersApi.assign(profileId, tierId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tierKeys.publicTiers });
      qc.invalidateQueries({ queryKey: ['teachers'] });
    },
  });
}

export function useSetPlanTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, tierId }: { planId: string; tierId: string | null }) =>
      billingAdminApi.setPlanTier(planId, tierId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.plans });
      qc.invalidateQueries({ queryKey: billingKeys.plans });
      qc.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    },
  });
}
