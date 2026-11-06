'use client';

import { NowOnLesson } from '@/components/courses/LessonPicker';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import {
  DataTable,
  EmptyState,
  PageHeader,
  QueryState,
  StatusBadge,
  UiButton,
  formatDate,
} from '@/components/ui/primitives';
import { useFamilyDetail } from '@/hooks/useFamily';
import { useFamilyEnrolments } from '@/hooks/useParentEnrolments';
import type { EnrolmentRecord } from '@/lib/api/modules/enrolments';
import { FamilySwitcher, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { EnrolModal } from './ChildCourses';

export type CourseStatusFilter = 'all' | 'CURRENT' | 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'ENDED';

const STATUS_OPTIONS: Array<{ value: CourseStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'CURRENT', label: 'Current (trial, active, paused)' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'ENDED', label: 'Ended' },
];

/** The course, status and teacher filters as one test for each child's list. */
export function enrolmentFilter(f: {
  course: string;
  status: CourseStatusFilter;
  teacher: string;
}) {
  return (e: EnrolmentRecord) =>
    (f.course === 'all' || e.course.id === f.course) &&
    (f.status === 'all' ||
      (f.status === 'CURRENT' && (e.status === 'TRIAL' || e.status === 'ACTIVE' || e.status === 'PAUSED')) ||
      (f.status === 'ENDED'
        ? e.status === 'CANCELLED' || e.status === 'COMPLETED'
        : e.status === f.status)) &&
    (f.teacher === 'all' || e.teacher?.id === f.teacher);
}

/** What the family does next on an enrolment, in a few words. */
function nextStep(e: EnrolmentRecord): string {
  if (e.status === 'TRIAL') {
    return e.teacher
      ? 'Trial class, then the teacher’s result, then choose a plan'
      : 'The academy is choosing a teacher';
  }
  if (e.status === 'ACTIVE') return 'Weekly classes running';
  if (e.status === 'PAUSED') return e.pausedUntil ? `Paused until ${formatDate(e.pausedUntil)}` : 'Paused';
  return 'Ended';
}

/**
 * `/parent/courses` — every child's courses on one page: teacher, status, level, next lesson
 * and trial next step, with "Change teacher", booking, pause and cancel. Each child's section
 * is the same `ChildCourses` panel as the child's Courses tab, but without its own "Start a
 * course": one button at the top opens the dialog with a child picker, rather than the same
 * button repeated under every child.
 */
export function CoursesScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId }) => <FamilyCourses key={familyId} familyId={familyId} />}
    </WithActiveFamily>
  );
}

function FamilyCourses({ familyId }: { familyId: string }) {
  const family = useFamilyDetail(familyId);
  const [child, setChild] = useState('all');
  const [course, setCourse] = useState('all');
  // Cancelled and finished courses stay out of the way until asked for.
  const [status, setStatus] = useState<CourseStatusFilter>('all');
  const [teacher, setTeacher] = useState('all');
  const [starting, setStarting] = useState(false);
  const students = family.data?.students ?? [];
  // Filter choices come from what the family actually has, so a filter never matches nobody.
  const enrolments = useFamilyEnrolments(students.map((s) => s.id));
  const courseOptions = [...new Map(enrolments.map((e) => [e.course.id, e.course.name])).entries()];
  const teacherOptions = [
    ...new Map(
      enrolments.flatMap((e) => (e.teacher ? [[e.teacher.id, e.teacher.user.name] as const] : [])),
    ).entries(),
  ];
  const router = useRouter();
  const filter = enrolmentFilter({ course, status, teacher });
  // The default view still lists every child, even one with no current course to show.
  const filtering = course !== 'all' || (status !== 'all' && status !== 'CURRENT') || teacher !== 'all';

  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Courses"
        description="Each child’s courses, teachers and next steps. Every course starts with a free trial."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FamilySwitcher />
            {students.length > 0 && (
              <UiButton icon={<Plus className="w-4 h-4" />} onClick={() => setStarting(true)}>
                Start a course
              </UiButton>
            )}
          </div>
        }
      />
      {starting && (
        <EnrolModal
          pickChildren={students.map((s) => ({ id: s.id, displayName: s.displayName }))}
          onClose={() => setStarting(false)}
        />
      )}
      <QueryState query={family} loadingLabel="Loading courses…">
        {(f) => {
          if (f.students.length === 0) {
            return (
              <EmptyState
                title="No children yet"
                description="Add a child first, then start a course for them."
                action={
                  <Link
                    href="/parent/children"
                    className="text-sm font-semibold text-green-700 hover:underline"
                  >
                    Add a child
                  </Link>
                }
              />
            );
          }
          const byChild = child === 'all' ? f.students : f.students.filter((s) => s.id === child);
          const childIds = new Set(byChild.map((s) => s.id));
          const rows = enrolments
            .filter((e) => childIds.has(e.student.id) && filter(e))
            .sort((a, b) => a.student.displayName.localeCompare(b.student.displayName));
          // Children with no course at all are named below the table, with a way to start one.
          const withoutCourses = byChild.filter((s) => !enrolments.some((e) => e.student.id === s.id));
          const manage = (e: EnrolmentRecord) => `/parent/children/${e.student.id}?tab=courses`;
          return (
            <div className="space-y-6">
              <FilterBar>
                {f.students.length > 1 && (
                  <FilterSelect
                    id="courses-child"
                    label="Child"
                    value={child}
                    onChange={setChild}
                    options={[
                      { value: 'all', label: 'All children' },
                      ...f.students.map((s) => ({ value: s.id, label: s.displayName })),
                    ]}
                  />
                )}
                <FilterSelect
                  id="courses-course"
                  label="Course"
                  value={course}
                  onChange={setCourse}
                  options={[
                    { value: 'all', label: 'All courses' },
                    ...courseOptions.map(([value, label]) => ({ value, label })),
                  ]}
                />
                <FilterSelect
                  id="courses-status"
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                />
                <FilterSelect
                  id="courses-teacher"
                  label="Teacher"
                  value={teacher}
                  onChange={setTeacher}
                  options={[
                    { value: 'all', label: 'All teachers' },
                    ...teacherOptions.map(([value, label]) => ({ value, label })),
                  ]}
                />
              </FilterBar>
                  <DataTable<EnrolmentRecord>
                    rows={rows}
                    rowKey={(r) => r.id}
                    pageSize={20}
                    onRowClick={(r) => router.push(manage(r))}
                    columns={[
                      { key: 'child', header: 'Child', render: (r) => r.student.displayName },
                      {
                        key: 'course',
                        header: 'Course',
                        render: (r) => <span className="font-semibold text-ink">{r.course.name}</span>,
                      },
                      { key: 'teacher', header: 'Teacher', render: (r) => r.teacher?.user.name ?? 'Not assigned yet' },
                      {
                        key: 'level',
                        header: 'Now on',
                        render: (r) => (
                          <NowOnLesson prefix="" courseId={r.course.id} level={r.currentLevel} position={r.currentLessonPosition} />
                        ),
                      },
                      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                      { key: 'next', header: 'Next step', render: (r) => <span className="text-xs text-ink-2">{nextStep(r)}</span> },
                      {
                        key: 'actions',
                        header: '',
                        render: (r) => (
                          <Link
                            href={manage(r)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-semibold text-green-700 hover:underline"
                          >
                            Manage
                          </Link>
                        ),
                      },
                    ]}
                    empty={
                      <EmptyState
                        title={filtering || status !== 'all' ? 'No courses match these filters' : 'No courses yet'}
                        description="Every course starts with a free trial."
                      />
                    }
                  />
              {withoutCourses.length > 0 && (
                <p className="text-sm text-ink-2">
                  {withoutCourses.map((s) => s.displayName).join(', ')}{' '}
                  {withoutCourses.length === 1 ? 'has' : 'have'} no course yet.{' '}
                  <button type="button" onClick={() => setStarting(true)} className="font-semibold text-green-700 hover:underline">
                    Start a course
                  </button>
                </p>
              )}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
