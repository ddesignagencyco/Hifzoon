'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddGuardianInput,
  AddStudentInput,
  CreateFamilyInput,
  familiesApi,
  FamilySummary,
  UpdateFamilyInput,
  UpdateStudentInput,
} from '@/lib/api/modules/families';

export const familyKeys = {
  all: ['family'] as const,
  list: ['family', 'list'] as const,
  detail: (familyId: string) => ['family', 'detail', familyId] as const,
  guardians: (familyId: string) => ['family', 'guardians', familyId] as const,
  students: (familyId: string) => ['family', 'students', familyId] as const,
};

// ── Active family (a guardian can belong to more than one) ───────────────────

const ACTIVE_FAMILY_KEY = 'hifzoon.parent.activeFamilyId';
const ACTIVE_FAMILY_EVENT = 'hifzoon:active-family';

function readActiveFamilyId(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(ACTIVE_FAMILY_KEY);
  } catch {
    return null;
  }
}

function subscribeActiveFamily(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(ACTIVE_FAMILY_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(ACTIVE_FAMILY_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setActiveFamilyId(familyId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_FAMILY_KEY, familyId);
  } catch {
    // Storage blocked — selection simply won't persist.
  }
  window.dispatchEvent(new Event(ACTIVE_FAMILY_EVENT));
}

export function useFamilies() {
  return useQuery({ queryKey: familyKeys.list, queryFn: familiesApi.list, staleTime: 60_000 });
}

/**
 * The family the portal is currently showing: the remembered choice if the guardian
 * still belongs to it, otherwise the first (oldest) family.
 */
export function useActiveFamily() {
  const families = useFamilies();
  const stored = useSyncExternalStore(subscribeActiveFamily, readActiveFamilyId, () => null);
  const list: FamilySummary[] = families.data ?? [];
  const active = list.find((f) => f.id === stored) ?? list[0] ?? null;
  const select = useCallback((id: string) => setActiveFamilyId(id), []);
  return {
    families,
    family: active,
    familyId: active?.id ?? null,
    /** The caller's own membership in the active family (verification state, primary flag). */
    membership: active?.members[0] ?? null,
    select,
  };
}

export function useFamilyDetail(familyId: string | null | undefined) {
  return useQuery({
    queryKey: familyKeys.detail(familyId ?? ''),
    queryFn: () => familiesApi.get(familyId as string),
    enabled: Boolean(familyId),
  });
}

export function useFamilyGuardians(familyId: string | null | undefined) {
  return useQuery({
    queryKey: familyKeys.guardians(familyId ?? ''),
    queryFn: () => familiesApi.listGuardians(familyId as string),
    enabled: Boolean(familyId),
  });
}

export function useFamilyStudents(familyId: string | null | undefined) {
  return useQuery({
    queryKey: familyKeys.students(familyId ?? ''),
    queryFn: () => familiesApi.listStudents(familyId as string),
    enabled: Boolean(familyId),
  });
}

export function useCreateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFamilyInput) => familiesApi.create(body),
    onSuccess: (family) => {
      setActiveFamilyId(family.id);
      void qc.invalidateQueries({ queryKey: familyKeys.all });
    },
  });
}

export function useUpdateFamily(familyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateFamilyInput) => familiesApi.update(familyId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKeys.all }),
  });
}

export function useAddGuardian(familyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddGuardianInput) => familiesApi.addGuardian(familyId, body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: familyKeys.guardians(familyId) }),
        qc.invalidateQueries({ queryKey: familyKeys.detail(familyId) }),
      ]),
  });
}

export function useAddStudent(familyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddStudentInput) => familiesApi.addStudent(familyId, body),
    // Not awaited on purpose: the add-child flow must move to its consent step before
    // the refreshed family list re-renders the screen around it.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: familyKeys.all });
      void qc.invalidateQueries({ queryKey: ['consent'] });
    },
  });
}

export function useUpdateStudent(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateStudentInput) => familiesApi.updateStudent(studentId, body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: familyKeys.all }),
        qc.invalidateQueries({ queryKey: ['parent', 'dashboard', studentId] }),
      ]),
  });
}
