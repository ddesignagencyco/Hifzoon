'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddChildInput,
  BookSlotInput,
  bookingApi,
  CreateFamilyInput,
  OpenSlotsQuery,
} from '@/lib/api/modules/public-booking';

export const bookingKeys = {
  // `courseId` is part of the key: open-slots returns different slots per course, and a
  // key without it served the previously viewed course's slots from cache.
  slots: (q: OpenSlotsQuery) =>
    [
      'booking',
      'slots',
      q.from,
      q.to,
      q.visitorZone,
      q.durationMinutes ?? 30,
      q.courseId ?? '',
      q.gender ?? '',
      q.language ?? '',
    ] as const,
  teachers: (subject: string) => ['booking', 'teachers', subject] as const,
  families: ['booking', 'families'] as const,
  students: (familyId: string) => ['booking', 'students', familyId] as const,
  consent: (studentId: string) => ['booking', 'consent', studentId] as const,
};

export function useOpenSlots(query: OpenSlotsQuery, enabled = true) {
  return useQuery({
    queryKey: bookingKeys.slots(query),
    queryFn: () => bookingApi.openSlots(query),
    enabled,
    staleTime: 30 * 1000,
  });
}

/**
 * Teachers who list a course code as a subject.
 *
 * Not a substitute for the `courseId` filter on `open-slots`, which also accepts teachers
 * who teach the course through an active enrolment without listing the code. Prefer
 * passing `courseId`; this is for showing who to choose from before a course is picked.
 */
export function useSubjectTeachers(subject: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.teachers(subject ?? ''),
    queryFn: () => bookingApi.teachers({ subject }),
    enabled: !!subject,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyFamilies(enabled: boolean) {
  return useQuery({ queryKey: bookingKeys.families, queryFn: bookingApi.myFamilies, enabled });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFamilyInput) => bookingApi.createFamily(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.families }),
  });
}

export function useFamilyStudents(familyId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.students(familyId ?? ''),
    queryFn: () => bookingApi.students(familyId!),
    enabled: !!familyId,
  });
}

export function useAddChild(familyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddChildInput) => bookingApi.addChild(familyId!, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookingKeys.students(familyId ?? '') }),
  });
}

export function useStudentConsent(studentId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.consent(studentId ?? ''),
    queryFn: () => bookingApi.consent(studentId!),
    enabled: !!studentId,
  });
}

export function useGrantDataConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => bookingApi.grantDataCollection(studentId),
    onSuccess: (_d, studentId) => queryClient.invalidateQueries({ queryKey: bookingKeys.consent(studentId) }),
  });
}

export function useBookTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BookSlotInput) => bookingApi.book(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking', 'slots'] }),
  });
}
