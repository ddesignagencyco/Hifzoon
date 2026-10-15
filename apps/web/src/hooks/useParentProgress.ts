'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { parentProgressApi } from '@/lib/api/modules/parent-progress';
import { lessonsReadApi, MistakeFilters } from '@/lib/api/modules/lessons-read';

export const parentKeys = {
  all: ['parent'] as const,
  dashboard: (studentId: string) => ['parent', 'dashboard', studentId] as const,
  charts: (studentId: string, months: number) => ['parent', 'charts', studentId, months] as const,
  reportCard: (studentId: string, year: number, month: number) =>
    ['parent', 'report-card', studentId, year, month] as const,
  lessonCards: (studentId: string) => ['parent', 'lesson-cards', studentId] as const,
  lessonCard: (lessonCardId: string) => ['parent', 'lesson-card', lessonCardId] as const,
  mistakes: (studentId: string, filters: MistakeFilters) => ['parent', 'mistakes', studentId, filters] as const,
};

export function useStudentDashboard(studentId: string | null | undefined) {
  return useQuery({
    queryKey: parentKeys.dashboard(studentId ?? ''),
    queryFn: () => parentProgressApi.dashboard(studentId as string),
    enabled: Boolean(studentId),
    staleTime: 30_000,
  });
}

/** One dashboard query per child — the backend is deliberately per-student. */
export function useStudentDashboards(studentIds: string[]) {
  return useQueries({
    queries: studentIds.map((id) => ({
      queryKey: parentKeys.dashboard(id),
      queryFn: () => parentProgressApi.dashboard(id),
      staleTime: 30_000,
    })),
  });
}

export function useProgressChart(studentId: string, months: number) {
  return useQuery({
    queryKey: parentKeys.charts(studentId, months),
    queryFn: () => parentProgressApi.charts(studentId, months),
    enabled: Boolean(studentId),
  });
}

export function useReportCard(studentId: string, year: number, month: number) {
  return useQuery({
    queryKey: parentKeys.reportCard(studentId, year, month),
    queryFn: () => parentProgressApi.reportCard(studentId, year, month),
    enabled: Boolean(studentId),
  });
}

export function useLessonCards(studentId: string) {
  return useQuery({
    queryKey: parentKeys.lessonCards(studentId),
    queryFn: () => lessonsReadApi.listForStudent(studentId),
    enabled: Boolean(studentId),
  });
}

export function useLessonCard(lessonCardId: string | null) {
  return useQuery({
    queryKey: parentKeys.lessonCard(lessonCardId ?? ''),
    queryFn: () => lessonsReadApi.get(lessonCardId as string),
    enabled: Boolean(lessonCardId),
  });
}

export function useStudentMistakes(studentId: string, filters: MistakeFilters) {
  return useQuery({
    queryKey: parentKeys.mistakes(studentId, filters),
    queryFn: () => lessonsReadApi.mistakes(studentId, filters),
    enabled: Boolean(studentId),
  });
}
