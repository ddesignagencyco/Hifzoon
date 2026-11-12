'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coursesExtrasApi, ExamAssignInput } from '@/lib/api/modules/courses-extras';
import { coursesAdminKeys } from './useCoursesAdmin';

export function useAdminCourseList(includeArchived: boolean) {
  return useQuery({ queryKey: ['courses-admin', 'admin-list', includeArchived], queryFn: () => coursesExtrasApi.adminList(includeArchived) });
}

/** Lifecycle changes alter the public catalogue and enrolment pickers too, so every course view refreshes. */
export function useCourseLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i:
      | { kind: 'update'; id: string; body: { name?: string; description?: string; locale?: string } }
      | { kind: 'active'; id: string; active: boolean }
      | { kind: 'archive'; id: string }
      | { kind: 'restore'; id: string }): Promise<unknown> =>
      i.kind === 'update' ? coursesExtrasApi.update(i.id, i.body)
        : i.kind === 'active' ? coursesExtrasApi.setActive(i.id, i.active)
        : i.kind === 'archive' ? coursesExtrasApi.archive(i.id)
        : coursesExtrasApi.restore(i.id),
    onSettled: () => qc.invalidateQueries({ queryKey: coursesAdminKeys.all }),
  });
}

export function useLessonFiles(lessonId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['courses-admin', 'curriculum'] });
  return {
    upload: useMutation({ mutationFn: (file: File) => coursesExtrasApi.uploadMaterial(lessonId, file), onSettled: refresh }),
    remove: useMutation({ mutationFn: (fileId: string) => coursesExtrasApi.deleteMaterial(lessonId, fileId), onSettled: refresh }),
  };
}

export function useExamAdmin(enrolmentId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['assessments'] });
    qc.invalidateQueries({ queryKey: coursesAdminKeys.all });
  };
  return {
    assign: useMutation({ mutationFn: (b: ExamAssignInput) => coursesExtrasApi.assignExam(enrolmentId, b), onSuccess: refresh }),
    reassign: useMutation({ mutationFn: (v: { id: string; examinerId?: string; scheduledFor?: string }) => coursesExtrasApi.reassignExam(v.id, { examinerId: v.examinerId, scheduledFor: v.scheduledFor }), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => coursesExtrasApi.cancelExam(id), onSuccess: refresh }),
  };
}

export function useMyExams() {
  return useQuery({ queryKey: ['courses', 'exams', 'mine'], queryFn: coursesExtrasApi.myExams });
}

export function useRecordExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; rubricScores: Record<string, number>; notes?: string }) =>
      coursesExtrasApi.recordExam(v.id, { rubricScores: v.rubricScores, notes: v.notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses', 'exams', 'mine'] });
      // A passed LEVEL exam moves the child up a level.
      qc.invalidateQueries({ queryKey: coursesAdminKeys.all });
      qc.invalidateQueries({ queryKey: ['assessments'] });
    },
  });
}

export function useExaminers() {
  return useQuery({ queryKey: ['courses', 'examiners'], queryFn: () => coursesExtrasApi.examiners(), staleTime: 60_000 });
}
