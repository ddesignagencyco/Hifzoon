'use client';

import React, { useState } from 'react';
import { BookOpen, Check } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Tabs,
} from '@/components/ui/primitives';
import { HifzPageMap } from '@/components/hifz/HifzPageMap';
import { ChildLessonCards, ChildMistakes } from '@/components/parent/ChildLessons';
import { useMyEnrolments } from '@/hooks/useStudent';
import { useCourse } from '@/hooks/useCourses';
import type { EnrolmentRecord } from '@/lib/api/modules/enrolments';
import { cn } from '@/lib/utils';

/** Courses whose progress is tracked page by page across the Mushaf. */
const MEMORISATION_COURSES = new Set(['HIFZ', 'MURAJAAH']);

export function isMemorisationCourse(code: string): boolean {
  return MEMORISATION_COURSES.has(code);
}

/** "Hifz progress" for one course, "My progress" for several (or none). */
export function progressTitle(enrolments: EnrolmentRecord[]): string {
  return enrolments.length === 1 ? `${enrolments[0].course.name} progress` : 'My progress';
}

/**
 * `/student/progress` — the student's own progress, per course. Hifz and Murajaah show the
 * page-by-page Mushaf map; every other course (Qaida, Nazra, Tajweed…) shows its level
 * ladder. Lesson cards and mistakes follow for all courses.
 */
export function StudentProgress() {
  const enrolments = useMyEnrolments();
  const rows = enrolments.data ?? [];
  const [active, setActive] = useState<string | null>(null);
  const current = rows.find((e) => e.id === active) ?? rows[0];

  return (
    <>
      <PageHeader
        eyebrow="Student portal"
        title={enrolments.isLoading ? 'My progress' : progressTitle(rows)}
        description="How far you have come in each of your courses."
      />
      {enrolments.isLoading ? (
        <Card>
          <LoadingState label="Loading your progress…" />
        </Card>
      ) : enrolments.isError ? (
        <Card>
          <ErrorState error={enrolments.error} onRetry={() => enrolments.refetch()} />
        </Card>
      ) : !current ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="w-5 h-5" aria-hidden />}
            title="No courses yet"
            description="Your progress appears here once you are enrolled in a course. Ask your parent or teacher."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {rows.length > 1 && (
            <Tabs
              tabs={rows.map((e) => ({ value: e.id, label: e.course.name }))}
              value={current.id}
              onChange={setActive}
            />
          )}
          <CourseProgress key={current.id} enrolment={current} />
          <div className="space-y-5">
            <Card>
              <CardHeader title="Lesson cards" description="Written by your teacher after each class." />
              <CardBody>
                <ChildLessonCards studentId={current.student.id} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Mistakes to practise" description="Newest first — practise these before your next class." />
              <CardBody>
                <ChildMistakes studentId={current.student.id} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function CourseProgress({ enrolment }: { enrolment: EnrolmentRecord }) {
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
        <span className="font-semibold text-ink">{enrolment.course.name}</span>
        {enrolment.teacher && <span className="text-muted">with {enrolment.teacher.user.name}</span>}
        {enrolment.currentLevel && <span className="text-muted">Level: {enrolment.currentLevel.name}</span>}
        <span className="text-muted">Lesson {enrolment.currentLessonPosition}</span>
        <StatusBadge status={enrolment.status} />
      </Card>
      {isMemorisationCourse(enrolment.course.code) ? (
        <HifzPageMap studentId={enrolment.student.id} stacked />
      ) : (
        <LevelLadder enrolment={enrolment} />
      )}
    </div>
  );
}

/** Levels of a lesson-based course: done, current (lesson n of m) and still to come. */
function LevelLadder({ enrolment }: { enrolment: EnrolmentRecord }) {
  const { course, isLoading } = useCourse(enrolment.course.code);
  const levels = [...(course?.levels ?? [])].sort((a, b) => a.position - b.position);
  const currentPosition = enrolment.currentLevel?.position ?? 1;

  return (
    <Card>
      <CardHeader title={`${enrolment.course.name} progress`} description="Each level is a set of lessons. Finish them to move up." />
      <CardBody>
        {isLoading ? (
          <LoadingState label="Loading levels…" />
        ) : levels.length === 0 ? (
          <p className="text-sm text-muted">This course has no levels published yet.</p>
        ) : (
          <ol className="space-y-2">
            {levels.map((level) => {
              const done = level.position < currentPosition;
              const now = level.position === currentPosition;
              const lessons = Math.max(level.lessonCount, 1);
              const reached = now ? Math.min(enrolment.currentLessonPosition, lessons) : done ? lessons : 0;
              return (
                <li
                  key={level.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                    now ? 'border-gold bg-gold-100/40' : done ? 'border-green-600/30 bg-green-50' : 'border-line bg-white opacity-70',
                  )}
                  aria-current={now ? 'step' : undefined}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      done ? 'bg-green-600 text-white' : now ? 'bg-gold text-green-950' : 'bg-sand text-muted',
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : level.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{level.name}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                      <span
                        className={cn('block h-full', done ? 'bg-green-600' : 'bg-gold')}
                        style={{ width: `${(reached / lessons) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {done ? 'Completed' : now ? `Lesson ${reached} of ${level.lessonCount}` : `${level.lessonCount} lessons`}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
