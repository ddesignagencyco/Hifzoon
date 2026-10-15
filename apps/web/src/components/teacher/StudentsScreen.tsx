'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { Card, CardBody, EmptyState, PageHeader, QueryState, StatusBadge } from '@/components/ui/primitives';
import { useTeacherIdentity } from '@/hooks/useTeacher';
import { groupEnrolmentsByStudent } from '@/lib/api/modules/enrolments-teacher';

/** `/teacher/students` — the teacher's students from their enrolments (FR-CRS-02). */
export function StudentsScreen() {
  const { enrolments, user } = useTeacherIdentity();
  const query = { ...enrolments, isLoading: !user || enrolments.isLoading };

  return (
    <>
      <PageHeader title="Students" description="Everyone you teach, with their course, level and where they are in the lesson plan." />
      <Card>
        <CardBody className="pt-2">
          <QueryState
            query={query}
            loadingLabel="Loading your students…"
            empty={
              <EmptyState
                icon={<GraduationCap className="w-5 h-5" aria-hidden />}
                title="No students yet"
                description="When the academy assigns you a student, they appear here."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y divide-line/60">
                {groupEnrolmentsByStudent(rows).map(({ student, enrolments: list }) => (
                  <li key={student.id}>
                    <Link
                      href={`/teacher/students/${encodeURIComponent(student.id)}`}
                      className="flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                      <span className="w-10 h-10 rounded-full bg-green-50 text-green-700 font-semibold flex items-center justify-center shrink-0" aria-hidden>
                        {student.displayName.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink truncate">{student.displayName}</span>
                        {student.birthYear && <span className="block text-[11px] text-muted">Born {student.birthYear}</span>}
                        <span className="mt-1.5 flex flex-col gap-1">
                          {list.map((e) => (
                            <span key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                              <span className="font-medium">{e.course.name}</span>
                              <span className="text-muted">
                                {e.currentLevel ? e.currentLevel.name : 'No level'} · lesson {e.currentLessonPosition}
                              </span>
                              <StatusBadge status={e.status} />
                            </span>
                          ))}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </CardBody>
      </Card>
    </>
  );
}
