'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { opsAdminApi, FamilyPatch, Granularity, StaffInviteRole, StudentPatch } from '@/lib/api/modules/ops-admin';
import { permissionsApi, StaffRole } from '@/lib/api/modules/permissions-admin';

export const opsKeys = {
  family: (id: string) => ['ops', 'family', id] as const,
  student: (id: string) => ['ops', 'student', id] as const,
  sessions: (id: string) => ['ops', 'sessions', id] as const,
  matrix: ['admin', 'permissions', 'matrix'] as const,
};

export function useFamilyDetail(id: string) {
  return useQuery({ queryKey: opsKeys.family(id), queryFn: () => opsAdminApi.family(id), retry: false });
}

export function useUpdateFamily(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FamilyPatch) => opsAdminApi.updateFamily(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: opsKeys.family(id) });
      qc.invalidateQueries({ queryKey: ['admin-console', 'search'] });
    },
  });
}

export function useStudentDetail(id: string) {
  return useQuery({ queryKey: opsKeys.student(id), queryFn: () => opsAdminApi.student(id), retry: false });
}

export function useUpdateStudent(id: string, familyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StudentPatch) => opsAdminApi.updateStudent(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: opsKeys.student(id) });
      if (familyId) qc.invalidateQueries({ queryKey: opsKeys.family(familyId) });
      qc.invalidateQueries({ queryKey: ['admin-console', 'search'] });
    },
  });
}

export function useAnalytics(p: { from?: string; to?: string; granularity: Granularity }) {
  return useQuery({ queryKey: ['ops', 'analytics', p], queryFn: () => opsAdminApi.analytics(p), retry: false, staleTime: 60_000 });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name: string; phone?: string; roles: StaffInviteRole[] }) => opsAdminApi.createStaff(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-console', 'search'] }),
  });
}

/** Recovery actions on one account; sessions list refreshes after any of them. */
export function useAccountRecovery(userId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: opsKeys.sessions(userId) });
  return {
    resendInvite: useMutation({ mutationFn: () => opsAdminApi.resendInvite(userId), onSuccess: done }),
    passwordReset: useMutation({ mutationFn: () => opsAdminApi.passwordReset(userId), onSuccess: done }),
    resetTwoFactor: useMutation({ mutationFn: () => opsAdminApi.resetTwoFactor(userId), onSuccess: done }),
    revokeSessions: useMutation({ mutationFn: () => opsAdminApi.revokeSessions(userId), onSuccess: done }),
  };
}

export function useUserSessions(userId: string, enabled = true) {
  return useQuery({ queryKey: opsKeys.sessions(userId), queryFn: () => opsAdminApi.sessions(userId), enabled });
}

export function usePermissionMatrix() {
  return useQuery({ queryKey: opsKeys.matrix, queryFn: permissionsApi.matrix });
}

export function useSetPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { role: StaffRole; permission: string; granted: boolean }) => permissionsApi.set(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: opsKeys.matrix });
      qc.invalidateQueries({ queryKey: ['admin', 'permissions', 'mine'] });
    },
  });
}
