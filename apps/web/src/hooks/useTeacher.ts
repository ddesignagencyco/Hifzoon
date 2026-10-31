'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { teacherEnrolmentsApi } from '@/lib/api/modules/enrolments-teacher';
import { ProfileChanges, resolveTeacherProfileId, teacherApi } from '@/lib/api/modules/teacher';
import { deviceTimeZone, isValidTimeZone } from '@/components/teacher/zoned-time';
import { teacherMeApi } from '@/lib/api/modules/teacher-me';

/** Query keys for every teacher-portal hook (`useTeacher*.ts`). */
export const teacherKeys = {
  me: ['teacher', 'me'] as const,
  all: ['teacher'] as const,
  enrolmentsRoot: ['teacher', 'enrolments'] as const,
  enrolments: (teacherUserId: string, studentId?: string) =>
    ['teacher', 'enrolments', teacherUserId, studentId ?? 'all'] as const,
  nextLesson: (enrolmentId: string) => ['teacher', 'next-lesson', enrolmentId] as const,
  lessonCards: (studentId: string) => ['teacher', 'lesson-cards', studentId] as const,
  lessonCard: (id: string) => ['teacher', 'lesson-card', id] as const,
  timetableRoot: ['teacher', 'timetable'] as const,
  timetable: (teacherId: string, from: string, to: string, tz: string) =>
    ['teacher', 'timetable', teacherId, from, to, tz] as const,
  availability: (teacherId: string) => ['teacher', 'availability', teacherId] as const,
  briefRoot: ['teacher', 'brief'] as const,
  brief: (classId: string) => ['teacher', 'brief', classId] as const,
  publicProfileRoot: ['teacher', 'public-profile'] as const,
  publicProfile: (userId: string) => ['teacher', 'public-profile', userId] as const,
  rating: (teacherId: string) => ['teacher', 'rating', teacherId] as const,
  payslips: ['teacher', 'payslips'] as const,
};

/** The signed-in teacher's own enrolments (filtered by user id). */
export function useTeacherEnrolments(teacherUserId: string | undefined, studentId?: string) {
  return useQuery({
    queryKey: teacherKeys.enrolments(teacherUserId ?? '', studentId),
    queryFn: () =>
      teacherEnrolmentsApi.list({ teacherUserId: teacherUserId as string, ...(studentId ? { studentId } : {}) }),
    enabled: Boolean(teacherUserId),
    staleTime: 60 * 1000,
  });
}

/**
 * Who the signed-in teacher is: user id (from `/auth/me`), teacher **profile** id
 * (resolved from their enrolments — see `resolveTeacherProfileId`) and display zone.
 */
/** The signed-in teacher's own profile (`GET /teachers/me`, backend M1) — works before approval. */
export function useOwnTeacherProfile(enabled = true) {
  return useQuery({
    queryKey: teacherKeys.me,
    queryFn: teacherMeApi.me,
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useTeacherIdentity() {
  const { currentUser } = useAuth();
  const enrolments = useTeacherEnrolments(currentUser?.id);
  // `GET /teachers/me` (M1) gives the profile id for every teacher, approved or not.
  // Enrolments stay a fallback for an API without the route.
  const me = useOwnTeacherProfile(Boolean(currentUser));
  const profileZone = currentUser?.timeZone;
  const zone = isValidTimeZone(profileZone) ? profileZone : deviceTimeZone();
  const fromEnrolments = enrolments.data ? resolveTeacherProfileId(enrolments.data) : null;
  const teacherId = me.data?.id ?? fromEnrolments ?? null;
  const settled = !me.isLoading && Boolean(enrolments.data);
  return {
    user: currentUser,
    userId: currentUser?.id,
    teacherId,
    zone,
    enrolments,
    profile: me.data ?? null,
    /** Query-shaped view for `QueryState`; `data` is the profile id, or `null` when it cannot be resolved. */
    query: {
      data: teacherId ?? (settled ? null : undefined),
      isLoading: !currentUser || (!teacherId && (me.isLoading || enrolments.isLoading)),
      isError: !teacherId && me.isError && enrolments.isError,
      error: me.error ?? enrolments.error,
      refetch: () => {
        void me.refetch();
        return enrolments.refetch();
      },
    },
  };
}

export function useTeacherBrief(classId: string | undefined) {
  return useQuery({
    queryKey: teacherKeys.brief(classId ?? ''),
    queryFn: () => teacherApi.brief(classId as string),
    enabled: Boolean(classId),
  });
}

export function useTeacherPublicProfile(userId: string | undefined) {
  return useQuery({
    queryKey: teacherKeys.publicProfile(userId ?? ''),
    queryFn: () => teacherApi.publicProfile(userId as string),
    enabled: Boolean(userId),
    retry: false,
  });
}

export function useTeacherRating(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: teacherKeys.rating(teacherId ?? ''),
    queryFn: () => teacherApi.rating(teacherId as string),
    enabled: Boolean(teacherId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRequestProfileChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: ProfileChanges) => teacherApi.requestProfileChange(changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.publicProfileRoot }),
  });
}

export function useWithdrawProfileChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: teacherMeApi.withdrawPendingChange,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.me }),
  });
}

/** `GET /qa/reviews/mine` — the teacher's own QA reviews (Teacher → Quality reviews). */
export function useMyQaReviews() {
  return useQuery({ queryKey: [...teacherKeys.all, 'qa-reviews'], queryFn: teacherApi.myReviews });
}

/** `POST /qa/reviews/:id/reply` — used on Teacher → Quality reviews. */
export function useReplyToQaReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, teacherReply }: { reviewId: string; teacherReply: string }) =>
      teacherApi.replyToReview(reviewId, teacherReply),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.all }),
  });
}
