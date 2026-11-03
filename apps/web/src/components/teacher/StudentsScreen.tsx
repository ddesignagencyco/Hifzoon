'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, Video } from 'lucide-react';
import { Card, CardBody, CardHeader, DataTable, EmptyState, PageHeader, QueryState, StatusBadge, humanize } from '@/components/ui/primitives';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import { useTeacherTimetable } from '@/hooks/useTeacherSchedule';
import { joinWindow } from '@/lib/api/modules/classroom';
import { classroomHref } from './ClassListItem';
import { formatInZone } from './zoned-time';
import { useTeacherIdentity } from '@/hooks/useTeacher';
import { groupEnrolmentsByStudent } from '@/lib/api/modules/enrolments-teacher';

/** `/teacher/students` — the teacher's students from their enrolments (FR-CRS-02). */
export function StudentsScreen() {
  const { enrolments, user } = useTeacherIdentity();
  const router = useRouter();
  const query = { ...enrolments, isLoading: !user || enrolments.isLoading };

  // Narrow the roster by family, course or enrolment status. Options are built from what the
  // teacher actually teaches, so a filter never offers a value with no rows behind it.
  const [family, setFamily] = useState('');
  const [course, setCourse] = useState('');
  const [status, setStatus] = useState('');

  const grouped = useMemo(() => groupEnrolmentsByStudent(enrolments.data ?? []), [enrolments.data]);

  const familyOptions = useMemo(() => {
    const names = [...new Set(grouped.map((r) => r.student.family?.name).filter((n): n is string => Boolean(n)))].sort((a, b) =>
      a.localeCompare(b),
    );
    return [{ value: '', label: 'All families' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [grouped]);

  const courseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    grouped.forEach((r) => r.enrolments.forEach((e) => byId.set(e.course.id, e.course.name)));
    const list = [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return [{ value: '', label: 'All courses' }, ...list.map(([id, name]) => ({ value: id, label: name }))];
  }, [grouped]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    grouped.forEach((r) => r.enrolments.forEach((e) => set.add(e.status)));
    return [{ value: '', label: 'All statuses' }, ...[...set].sort().map((s) => ({ value: s, label: humanize(s) }))];
  }, [grouped]);

  const rows = useMemo(
    () =>
      grouped.filter(
        (r) =>
          (!family || r.student.family?.name === family) &&
          (!course || r.enrolments.some((e) => e.course.id === course)) &&
          (!status || r.enrolments.some((e) => e.status === status)),
      ),
    [grouped, family, course, status],
  );

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
            {() => (
              <DataTable
                rows={rows}
                rowKey={(r) => r.student.id}
                onRowClick={(r) => router.push(`/teacher/students/${encodeURIComponent(r.student.id)}`)}
                searchPlaceholder="Search students or courses"
                empty={<EmptyState title="No students match these filters" className="py-6" />}
                toolbar={
                  <FilterBar>
                    <FilterSelect id="students-family" label="Family" value={family} options={familyOptions} onChange={setFamily} />
                    <FilterSelect id="students-course" label="Course" value={course} options={courseOptions} onChange={setCourse} />
                    <FilterSelect id="students-status" label="Status" value={status} options={statusOptions} onChange={setStatus} />
                  </FilterBar>
                }
                columns={[
                  {
                    key: 'student',
                    header: 'Student',
                    sortValue: (r) => r.student.displayName.toLowerCase(),
                    render: ({ student }) => (
                      <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 font-semibold text-green-700" aria-hidden>
                          {student.displayName.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <span className="block font-semibold text-ink">{student.displayName}</span>
                          <span className="block text-[11px] text-muted">
                            {student.family?.name ?? ''}
                            {student.family?.name && student.birthYear ? ' · ' : ''}
                            {student.birthYear ? `Born ${student.birthYear}` : ''}
                          </span>
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'courses',
                    header: 'Course · level · lesson',
                    render: ({ enrolments: list }) => (
                      <span className="flex flex-col gap-1">
                        {list.map((e) => (
                          <span key={e.id} className="text-xs text-ink-2">
                            <span className="font-medium text-ink">{e.course.name}</span>
                            <span className="text-muted">
                              {' '}
                              · {e.currentLevel ? e.currentLevel.name : 'No level'} · lesson {e.currentLessonPosition}
                            </span>
                          </span>
                        ))}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: ({ enrolments: list }) => (
                      <span className="flex flex-col items-start gap-1">
                        {list.map((e) => (
                          <StatusBadge key={e.id} status={e.status} />
                        ))}
                      </span>
                    ),
                  },
                ]}
              />
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
        <DataTable
          rows={trials}
          rowKey={({ cls, student }) => `${cls.id}-${student.id}`}
          columns={[
            {
              key: 'student',
              header: 'Student',
              render: ({ student }) => (
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{student.displayName}</span>
                  <span className="rounded-full bg-gold-100 px-1.5 py-px text-[10px] font-semibold text-gold-600">Trial</span>
                </span>
              ),
            },
            { key: 'course', header: 'Course', render: ({ cls }) => cls.course?.name ?? 'Evaluation' },
            {
              key: 'when',
              header: 'When',
              sortValue: ({ cls }) => cls.startsAt,
              render: ({ cls }) =>
                formatInZone(cls.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            },
            {
              key: 'join',
              header: '',
              className: 'text-right',
              render: ({ cls }) =>
                joinWindow(cls.startsAt, cls.endsAt, now) === 'open' ? (
                  <Link
                    href={classroomHref(cls.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gold px-3 text-xs font-semibold text-green-950 hover:bg-gold-600 hover:text-white"
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden /> Join
                  </Link>
                ) : (
                  <span className="text-[11px] text-muted">Join opens 10 min before</span>
                ),
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}
