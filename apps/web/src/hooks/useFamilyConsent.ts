'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consentApi, ConsentPurpose, DataRequestType } from '@/lib/api/modules/consent';
import { familyKeys } from './useFamily';

export const consentKeys = {
  all: ['consent'] as const,
  student: (studentId: string) => ['consent', 'student', studentId] as const,
  dataRequests: (familyId: string) => ['consent', 'data-requests', familyId] as const,
  privacy: (familyId: string) => ['consent', 'privacy', familyId] as const,
};

export function useStudentConsent(studentId: string | null | undefined) {
  return useQuery({
    queryKey: consentKeys.student(studentId ?? ''),
    queryFn: () => consentApi.forStudent(studentId as string),
    enabled: Boolean(studentId),
  });
}

export function useGrantConsent(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (purposes: ConsentPurpose[]) => consentApi.grant(studentId, { purposes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: consentKeys.all }),
  });
}

export function useWithdrawConsent(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { purposes: ConsentPurpose[]; reason?: string }) => consentApi.withdraw(studentId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: consentKeys.all }),
  });
}

export function useStartGuardianVerification(familyId: string) {
  return useMutation({ mutationFn: () => consentApi.startVerification(familyId) });
}

export function useConfirmGuardianVerification(familyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => consentApi.confirmVerification(familyId, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKeys.all }),
  });
}

export function useDataRequests(familyId: string | null | undefined) {
  return useQuery({
    queryKey: consentKeys.dataRequests(familyId ?? ''),
    queryFn: () => consentApi.listDataRequests(familyId as string),
    enabled: Boolean(familyId),
  });
}

export function useCreateDataRequest(familyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: DataRequestType; studentId?: string }) => consentApi.createDataRequest(familyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: consentKeys.dataRequests(familyId) }),
        qc.invalidateQueries({ queryKey: consentKeys.privacy(familyId) }),
      ]),
  });
}

export function usePrivacySummary(familyId: string | null | undefined) {
  return useQuery({
    queryKey: consentKeys.privacy(familyId ?? ''),
    queryFn: () => consentApi.privacySummary(familyId as string),
    enabled: Boolean(familyId),
  });
}
