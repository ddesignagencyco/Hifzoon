'use client';

import React, { useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import {
  Alert,
  Field,
  LoadingState,
  ErrorState,
  Select,
  TextArea,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminCourses } from '@/hooks/useAdminScheduling';
import { useAdminPlans, useEditTrialOutcome, useRecordTrialOutcome, useTrialOutcome } from '@/hooks/useAdminAdmissions';
import { validateTrialOutcome } from '@/lib/api/modules/admissions-admin';

/**
 * Record, or correct, a trial's result (FR-ADM-05) — used by the trial's teacher and by
 * staff. Once saved the family sees the level, teacher and recommended plan on their
 * overview with a Continue button; level, plan and notes stay editable until they pay.
 */
export function TrialResultForm({
  classId,
  courseCode,
  childName,
  onDone,
}: {
  classId: string;
  courseCode?: string;
  childName?: string;
  onDone?: () => void;
}) {
  const saved = useTrialOutcome(classId);
  if (saved.isLoading) return <LoadingState label="Checking for a saved result…" />;
  if (saved.isError) return <ErrorState error={saved.error} onRetry={() => saved.refetch()} />;
  return (
    <ResultForm
      key={saved.data?.id ?? 'new'}
      classId={classId}
      courseCode={courseCode}
      childName={childName}
      saved={saved.data ?? null}
      onDone={onDone}
    />
  );
}

function ResultForm({
  classId,
  courseCode,
  childName,
  saved,
  onDone,
}: {
  classId: string;
  courseCode?: string;
  childName?: string;
  saved: NonNullable<ReturnType<typeof useTrialOutcome>['data']> | null;
  onDone?: () => void;
}) {
  const toast = useToast();
  const courses = useAdminCourses();
  const plans = useAdminPlans();
  const record = useRecordTrialOutcome();
  const edit = useEditTrialOutcome();

  const savedCourse = courses.data?.find((c) => c.levels.some((l) => l.id === saved?.placementLevelId));
  const [courseId, setCourseId] = useState('');
  const course =
    courses.data?.find((c) => c.id === courseId) ??
    savedCourse ??
    courses.data?.find((c) => c.code === courseCode);
  const [won, setWon] = useState(true);
  const [levelId, setLevelId] = useState(saved?.placementLevelId ?? '');
  const [planId, setPlanId] = useState(saved?.recommendedPlanId ?? '');
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [lostReason, setLostReason] = useState('');
  const locked = Boolean(saved?.subscribed);
  const lost = saved?.won === false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saved) {
      edit.mutate(
        { classId, placementLevelId: levelId || null, recommendedPlanId: planId || null, notes: notes.trim() || null },
        {
          onSuccess: () => {
            toast.success('Result updated. The family sees the change straight away.');
            onDone?.();
          },
          onError: (err) => toast.error(err),
        },
      );
      return;
    }
    const body = {
      won,
      placementLevelId: won && levelId ? levelId : undefined,
      recommendedPlanId: won && planId ? planId : undefined,
      notes: notes.trim() || undefined,
      lostReason: !won && lostReason.trim() ? lostReason.trim() : undefined,
    };
    const first = Object.values(validateTrialOutcome(body))[0];
    if (first) return toast.error(first);
    record.mutate(
      { classId, ...body },
      {
        onSuccess: () => {
          toast.success(won ? 'Saved. The family can now continue with regular classes.' : 'Saved. The trial is closed.');
          onDone?.();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {saved && (
        <Alert tone={locked ? 'neutral' : 'success'}>
          <span className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Result saved {formatDateTime(saved.completedAt)} — {lost ? 'not continuing' : 'continuing'}.
          </span>
          {locked
            ? 'The family has already subscribed from this result, so it can no longer change.'
            : lost
              ? 'A trial that did not convert stays closed.'
              : 'You can still correct the level, plan or notes until the family pays.'}
        </Alert>
      )}
      {!saved && (
        <fieldset>
          <legend className="text-xs font-semibold text-ink-2 mb-1">
            How did {childName ? `${childName}’s` : 'the'} trial go?
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={`won-${classId}`} checked={won} onChange={() => setWon(true)} className="accent-green-800" />
              The family wants to continue
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={`won-${classId}`} checked={!won} onChange={() => setWon(false)} className="accent-green-800" />
              Not continuing
            </label>
          </div>
        </fieldset>
      )}
      {(saved ? !lost : won) ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Course" htmlFor={`course-${classId}`}>
            <Select
              id={`course-${classId}`}
              value={course?.id ?? ''}
              disabled={locked}
              onChange={(e) => {
                setCourseId(e.target.value);
                setLevelId('');
              }}
            >
              <option value="">{courses.isLoading ? 'Loading…' : 'Select a course'}</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level the child starts at" htmlFor={`level-${classId}`}>
            <Select id={`level-${classId}`} value={levelId} disabled={!course || locked} onChange={(e) => setLevelId(e.target.value)}>
              <option value="">{course ? 'Not decided' : 'Choose a course first'}</option>
              {(course?.levels ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.position}. {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Plan you recommend"
            htmlFor={`plan-${classId}`}
            className="sm:col-span-2"
            hint="The family sees it pre-selected, with the price in their currency."
          >
            <Select id={`plan-${classId}`} value={planId} disabled={locked} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{plans.isLoading ? 'Loading plans…' : 'No recommendation'}</option>
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.classesPerWeek} a week × {p.classMinutes} min · {humanize(p.roomType)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        !saved && (
          <Field label="Why not?" htmlFor={`lost-${classId}`} hint="Kept on the record for the academy.">
            <TextArea id={`lost-${classId}`} value={lostReason} maxLength={2000} onChange={(e) => setLostReason(e.target.value)} />
          </Field>
        )
      )}
      {!(saved && lost) && (
        <Field label="Note for the family" htmlFor={`notes-${classId}`} hint="Shown with the result on their overview.">
          <TextArea id={`notes-${classId}`} value={notes} maxLength={4000} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      )}
      {!locked && !(saved && lost) && (
        <div className="flex justify-end">
          <UiButton type="submit" loading={record.isPending || edit.isPending} icon={<Sparkles className="w-4 h-4" />}>
            {saved ? 'Update result' : 'Save result'}
          </UiButton>
        </div>
      )}
    </form>
  );
}
