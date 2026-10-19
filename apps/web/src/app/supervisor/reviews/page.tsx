'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  TextInput,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';
import { RubricReviewForm } from '@/components/qa/RubricReviewForm';
import { useSupervisedTeachers, useTeacherTimetable } from '@/hooks/useQa';
import { isUuid, QaSource, reviewableClasses } from '@/lib/api/modules/qa';
import { detectTimeZone } from '@/lib/api/modules/public-booking';
import { cn } from '@/lib/utils';

const DAY = 86_400_000;

export default function SupervisorReviewsPage() {
  return (
    <SupervisorRoleGate>
      <Suspense fallback={<LoadingState />}>
        <ReviewWorkspace />
      </Suspense>
    </SupervisorRoleGate>
  );
}

function ReviewWorkspace() {
  const params = useSearchParams();
  const initialClass = params.get('classId') ?? '';
  const source: QaSource = params.get('source') === 'RANDOM_SAMPLE' ? 'RANDOM_SAMPLE' : 'MANUAL';
  const [teacherId, setTeacherId] = useState(params.get('teacherId') ?? '');
  const [classId, setClassId] = useState(isUuid(initialClass) ? initialClass : '');
  const [manual, setManual] = useState('');
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 45 * DAY).toISOString(), to: new Date(now).toISOString(), tz: detectTimeZone(), now };
  });

  const teachers = useSupervisedTeachers();
  const timetable = useTeacherTimetable(teacherId || undefined, { from: range.from, to: range.to, tz: range.tz });
  const manualValid = isUuid(manual);

  return (
    <>
      <PageHeader
        eyebrow="Quality & supervision"
        title="Class reviews"
        description="Pick a taught class from a teacher's timetable, or paste a class id, then score it against the rubric."
      />
      <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        <Card>
          <CardHeader title="1. Choose a class" />
          <CardBody className="space-y-4">
            <Field label="Teacher" htmlFor="review-teacher">
              <Select
                id="review-teacher"
                value={teacherId}
                onChange={(e) => {
                  setTeacherId(e.target.value);
                  setClassId('');
                }}
                disabled={teachers.isLoading}
              >
                <option value="">{teachers.isLoading ? 'Loading teachers…' : 'Choose a teacher'}</option>
                {teachers.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.name}
                  </option>
                ))}
              </Select>
            </Field>
            {teachers.isError && (
              <ErrorState error={teachers.error} onRetry={() => teachers.refetch()} title="Teachers could not be loaded" className="py-3" />
            )}

            {teacherId && (
              <QueryState
                query={timetable}
                empty={<EmptyState title="No classes in the last 45 days" />}
              >
                {(entries) => {
                  const list = reviewableClasses(entries, range.now);
                  if (list.length === 0) return <EmptyState title="No taught classes to review yet" />;
                  return (
                    <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1" aria-label="Classes">
                      {list.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => setClassId(e.id)}
                            aria-pressed={classId === e.id}
                            className={cn(
                              'w-full text-left rounded-xl border px-3 py-2.5 transition-colors cursor-pointer',
                              classId === e.id ? 'border-green-800 bg-green-50' : 'border-line bg-white hover:bg-sand',
                            )}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-ink truncate">
                                {e.course?.name ?? 'Class'} · {humanize(e.type)}
                              </span>
                              <StatusBadge status={e.status} />
                            </span>
                            <span className="block text-[11px] text-muted mt-0.5">
                              {formatDateTime(e.startsAt, range.tz)}
                              {e.students.length > 0 && ` · ${e.students.map((s) => s.student.displayName).join(', ')}`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                }}
              </QueryState>
            )}

            <form
              className="border-t border-line pt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manualValid) setClassId(manual.trim());
              }}
            >
              <Field
                label="Or enter a class id"
                htmlFor="review-class-id"
                error={manual && !manualValid ? 'Not a valid class id (UUID).' : null}
              >
                <TextInput id="review-class-id" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="UUID" />
              </Field>
              <button type="submit" disabled={!manualValid} className="text-xs font-semibold text-green-800 hover:underline disabled:opacity-50 cursor-pointer">
                Use this class
              </button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="2. Score the lesson"
            description={classId ? <span className="font-mono">Class {classId}</span> : 'Choose a class to begin.'}
          />
          <CardBody>
            {classId ? (
              <RubricReviewForm key={classId} classId={classId} teacherId={teacherId || undefined} defaultSource={source} />
            ) : (
              <EmptyState title="No class selected" description="Reviews are per class, once per supervisor." />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
