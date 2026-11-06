'use client';

import { useLessonDescription } from './LessonPicker';
import React, { useState } from 'react';
import { Award } from 'lucide-react';
import {
  Alert,
  Badge,
  Field,
  Modal,
  QueryState,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useEnrolmentAssessments, useRecordAssessment } from '@/hooks/useAssessments';
import { AssessmentOverview, AssessmentRecord, previewScore } from '@/lib/api/modules/assessments';

/**
 * Level, lesson position and the "Assess level" action for a teacher's enrolment card.
 * Reaching the last lesson does not move the level by itself; this is where it moves.
 */
export function TeacherLevelPanel({ enrolmentId }: { enrolmentId: string }) {
  const overview = useEnrolmentAssessments(enrolmentId);
  const [open, setOpen] = useState(false);
  return (
    <QueryState query={overview} isEmpty={() => false}>
      {(o) => (
        <div className="space-y-3 pt-3 border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans">
                Level
              </h3>
              <p className="text-sm text-ink">{levelLine(o)}</p>
            </div>
            {o.currentLevel && (
              <UiButton
                size="sm"
                variant="secondary"
                icon={<Award className="w-3.5 h-3.5" aria-hidden />}
                onClick={() => setOpen(true)}
              >
                Assess level
              </UiButton>
            )}
          </div>
          {atLevelEnd(o) && (
            <Alert tone="success" title="Last lesson of the level">
              {o.currentLevel?.name} is complete on the plan. Run the level assessment to move on to
              the next level.
            </Alert>
          )}
          <AssessmentHistoryList assessments={o.assessments} />
          {open && o.currentLevel && (
            <AssessLevelModal
              enrolmentId={enrolmentId}
              level={o.currentLevel}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </QueryState>
  );
}

/** Current level and past results for the family's Courses tab. */
export function FamilyLevelSummary({ enrolmentId, courseId }: { enrolmentId: string; courseId?: string }) {
  const overview = useEnrolmentAssessments(enrolmentId);
  // Families see the lesson by name ("Now on: An-Nas – Al-Ikhlas"), not just a number.
  const lesson = useLessonDescription(
    courseId,
    overview.data?.currentLevel ?? null,
    overview.data?.currentLessonPosition ?? null,
  );
  if (!overview.data) return null;
  const o = overview.data;
  if (!o.currentLevel && o.assessments.length === 0) return null;
  return (
    <div className="rounded-lg bg-cream px-3 py-2 space-y-1.5">
      <p className="text-[11px] text-muted">Level</p>
      <p className="text-sm text-ink">{levelLine(o)}</p>
      {lesson.title && <p className="text-xs text-ink-2">Now on: {lesson.title}</p>}
      <AssessmentHistoryList assessments={o.assessments} limit={3} />
    </div>
  );
}

export function levelLine(
  o: Pick<AssessmentOverview, 'currentLevel' | 'currentLessonPosition'>,
): string {
  if (!o.currentLevel) return 'Not on a level yet';
  const of = o.currentLevel.lessonCount > 0 ? ` of ${o.currentLevel.lessonCount}` : '';
  return `${o.currentLevel.name} · lesson ${o.currentLessonPosition}${of}`;
}

export function atLevelEnd(
  o: Pick<AssessmentOverview, 'currentLevel' | 'currentLessonPosition'>,
): boolean {
  return Boolean(
    o.currentLevel &&
    o.currentLevel.lessonCount > 0 &&
    o.currentLessonPosition >= o.currentLevel.lessonCount,
  );
}

function AssessmentHistoryList({
  assessments,
  limit,
}: {
  assessments: AssessmentRecord[];
  limit?: number;
}) {
  if (assessments.length === 0) return <p className="text-xs text-muted">No assessments yet.</p>;
  const rows = limit ? assessments.slice(0, limit) : assessments;
  return (
    <ul className="space-y-1" aria-label="Assessment results">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <Badge tone={a.result === 'PASS' ? 'green' : a.result === 'FAIL' ? 'red' : 'neutral'}>
            {a.result === 'PASS' ? 'Passed' : a.result === 'FAIL' ? 'Not yet' : 'Pending'}
          </Badge>
          <span className="text-ink">{a.level.name}</span>
          {a.score !== null && (
            <span className="tabular-nums">
              {a.score}% <span className="text-muted">(pass {a.level.passMark}%)</span>
            </span>
          )}
          <span className="text-muted">{formatDate(a.takenAt ?? a.createdAt)}</span>
          {a.notes && <span className="basis-full text-muted">{a.notes}</span>}
        </li>
      ))}
    </ul>
  );
}

function AssessLevelModal({
  enrolmentId,
  level,
  onClose,
}: {
  enrolmentId: string;
  level: NonNullable<AssessmentOverview['currentLevel']>;
  onClose: () => void;
}) {
  const toast = useToast();
  const record = useRecordAssessment(enrolmentId);
  const criteria = Object.entries(level.rubric);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const preview = previewScore(level.rubric, scores);

  const submit = () => {
    if (preview === null) {
      setError('Give every criterion a score from 0 to 100.');
      return;
    }
    setError(null);
    record.mutate(
      {
        rubricScores: Object.fromEntries(criteria.map(([k]) => [k, Number(scores[k])])),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          const score = res.assessment.score ?? preview;
          toast.success(
            res.assessment.result !== 'PASS'
              ? `${score}%: below the pass mark of ${level.passMark}%. The student stays on ${level.name}.`
              : res.advancedTo
                ? `Passed with ${score}%. Moved to ${res.advancedTo.name}, lesson 1.`
                : `Passed with ${score}%. This was the last level of the course.`,
          );
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assess ${level.name}`}
      description={`Score each criterion from 0 to 100. Pass mark: ${level.passMark}%.`}
      footer={
        <>
          <UiButton variant="ghost" onClick={onClose}>
            Cancel
          </UiButton>
          <UiButton onClick={submit} loading={record.isPending}>
            Record assessment
          </UiButton>
        </>
      }
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {criteria.map(([key, weight]) => {
            const id = `rubric-${enrolmentId}-${key}`;
            return (
              <Field key={key} label={`${key} (${weight}%)`} htmlFor={id}>
                <TextInput
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  value={scores[key] ?? ''}
                  onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
                />
              </Field>
            );
          })}
        </div>
        <Field label="Notes (optional)" htmlFor={`assessment-notes-${enrolmentId}`}>
          <TextArea
            id={`assessment-notes-${enrolmentId}`}
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <p className="text-sm text-ink" aria-live="polite">
          {preview === null ? (
            <span className="text-muted">
              The weighted score appears once every criterion is scored.
            </span>
          ) : (
            <>
              Weighted score <span className="font-semibold tabular-nums">{preview}%</span> —{' '}
              {preview >= level.passMark ? (
                <Badge tone="green">Pass</Badge>
              ) : (
                <Badge tone="red">Below pass mark</Badge>
              )}
            </>
          )}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {/* Enter in a score field submits, matching the footer button. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
