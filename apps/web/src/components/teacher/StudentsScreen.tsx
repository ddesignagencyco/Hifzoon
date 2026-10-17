'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, GraduationCap, Video } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, QueryState, StatusBadge } from '@/components/ui/primitives';
import { useTeacherTimetable } from '@/hooks/useTeacherSchedule';
import { joinWindow } from '@/lib/api/modules/classroom';
import { classroomHref } from './ClassListItem';
import { formatInZone } from './zoned-time';
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
      <TrialStudents enrolledIds={new Set((enrolments.data ?? []).map((e) => e.student.id))} />
    </>
  );
}

/**
 * Trial students have no enrolment yet (backendrequirement B28), so they are not in the list
 * above. Show them from the teacher's own upcoming TRIAL classes instead.
 */
function TrialStudents({ enrolledIds }: { enrolledIds: Set<string> }) {
  const { teacherId, zone } = useTeacherIdentity();
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 60 * 60_000).toISOString(), to: new Date(now + 30 * 86_400_000).toISOString(), tz: zone };
  });
  const timetable = useTeacherTimetable(teacherId, range);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const trials = (timetable.data ?? [])
    .filter((c) => c.type === 'TRIAL' && (c.status === 'SCHEDULED' || c.status === 'LIVE'))
    .flatMap((c) => c.students.filter((s) => !enrolledIds.has(s.student.id)).map((s) => ({ cls: c, student: s.student })))
    .sort((a, b) => a.cls.startsAt.localeCompare(b.cls.startsAt));

  if (!teacherId || timetable.isLoading || trials.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader
        title="Trial students"
        description="Booked for an evaluation with you. Their full student page (lesson plan, history) opens once the family enrols."
      />
      <CardBody className="pt-0">
        <ul className="divide-y divide-line/60">
          {trials.map(({ cls, student }) => {
            const open = joinWindow(cls.startsAt, cls.endsAt, now) === 'open';
            return (
              <li key={`${cls.id}-${student.id}`} className="flex items-center gap-3 py-3 px-1">
                <span className="w-10 h-10 rounded-full bg-gold-100 text-gold-600 font-semibold flex items-center justify-center shrink-0" aria-hidden>
                  {student.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink truncate">{student.displayName}</span>
                    <span className="rounded-full px-1.5 py-px text-[10px] font-semibold bg-gold-100 text-gold-600">Trial</span>
                  </span>
                  <span className="block text-xs text-muted">
                    {cls.course?.name ?? 'Evaluation'} · {formatInZone(cls.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                {open && (
                  <Link
                    href={classroomHref(cls.id)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-gold text-green-950 text-xs font-semibold hover:bg-gold-600 hover:text-white"
                  >
                    <Video className="w-3.5 h-3.5" aria-hidden /> Join
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
