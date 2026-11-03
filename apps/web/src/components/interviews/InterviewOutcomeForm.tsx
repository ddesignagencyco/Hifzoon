'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  Alert,
  Field,
  LoadingState,
  Select,
  TextArea,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useInterview,
  useMarkInterviewNoShow,
  useRecordInterviewOutcome,
} from '@/hooks/useInterviews';
import {
  INTERVIEW_SCORE_FIELDS,
  INTERVIEW_SCORE_MAX,
  INTERVIEW_SCORE_MIN,
  InterviewScoreField,
  InterviewScores,
  averageScore,
  interviewStatusLabel,
  isInterviewClosed,
  validateInterviewOutcome,
} from '@/lib/api/modules/interviews';
import { stepLabel } from '@/components/admin/teachers/step-label';
import { cn } from '@/lib/utils';

const SCORE_OPTIONS = Array.from(
  { length: INTERVIEW_SCORE_MAX - INTERVIEW_SCORE_MIN + 1 },
  (_, index) => {
    const value = INTERVIEW_SCORE_MIN + index;
    const words = ['Weak', 'Below standard', 'Acceptable', 'Strong', 'Excellent'];
    return { value: String(value), label: `${value} — ${words[index] ?? ''}`.trim() };
  },
);

/**
 * Qari shb's verdict: the 1–5 rubric, a decision, and what he wants on the record.
 *
 * It stops at the interview. Recording the hiring step is a link, not a side effect —
 * the verdict is evidence, and an applicant should not be advanced or rejected by a form
 * filled in while the call is still winding down. The link carries the admin straight to
 * the step form with the right step in hand, so "manual" costs one click, not a hunt.
 */
export function InterviewOutcomeForm({
  interviewId,
  onDone,
  applicationHref,
}: {
  interviewId: string;
  onDone?: () => void;
  /** Where to send the admin to record the hiring step; defaults to the admin console. */
  applicationHref?: string;
}) {
  const toast = useToast();
  const detail = useInterview(interviewId);
  const record = useRecordInterviewOutcome(interviewId);
  const noShow = useMarkInterviewNoShow(interviewId);

  const [scores, setScores] = useState<InterviewScores>({});
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [recorded, setRecorded] = useState<{ step: string; applicationId: string } | null>(null);

  const interview = detail.data;
  // The server's saved values are the starting point; local edits win once touched.
  const effectiveScores: InterviewScores = touched ? scores : (interview?.scores ?? {});
  const effectiveNotes = touched ? notes : (interview?.outcomeNotes ?? '');
  const average = averageScore(effectiveScores);

  if (detail.isLoading) return <LoadingState label="Loading the interview…" className="py-6" />;
  if (!interview) {
    return (
      <Alert tone="error" title="Could not load the interview">
        {(detail.error as Error | null)?.message ?? 'Try again in a moment.'}
      </Alert>
    );
  }

  if (!interview.canConduct) {
    return (
      <Alert tone="neutral" title="Read-only">
        Only {interview.interviewer.name} (or an admin) can record the verdict for this interview.
      </Alert>
    );
  }

  if (recorded) {
    const href =
      applicationHref ?? `/admin/hiring/applications/${encodeURIComponent(recorded.applicationId)}`;
    return (
      <div className="space-y-3">
        <Alert tone="success" title="Verdict saved">
          The interview is closed and the notes are on the application. The hiring pipeline has not
          moved — record the {stepLabel(recorded.step as never)} step when you are ready.
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link
            href={href}
            className="inline-flex h-9 items-center rounded-full bg-green-800 px-4 text-sm font-semibold text-white hover:bg-green-700"
          >
            Record the {stepLabel(recorded.step as never)} step
          </Link>
          {onDone && (
            <UiButton variant="secondary" onClick={onDone}>
              Leave the interview
            </UiButton>
          )}
        </div>
      </div>
    );
  }

  const submit = (outcome: 'PASSED' | 'FAILED') => {
    const problem = validateInterviewOutcome({
      outcome,
      outcomeNotes: effectiveNotes,
      scores: effectiveScores,
    });
    if (problem) {
      toast.error(problem);
      return;
    }
    // Failing somebody without a word of explanation leaves the next reviewer, and the
    // applicant's rejection email, with nothing to go on.
    if (outcome === 'FAILED' && !effectiveNotes.trim()) {
      toast.error('Say why the applicant did not pass — the note is the record of this decision.');
      return;
    }

    record
      .mutateAsync({
        outcome,
        ...(effectiveNotes.trim() ? { outcomeNotes: effectiveNotes.trim() } : {}),
        scores: effectiveScores,
      })
      .then((result) => {
        toast.success(outcome === 'PASSED' ? 'Recorded as passed' : 'Recorded as not passed');
        setRecorded({
          step: result.recordStepHint.step,
          applicationId: result.recordStepHint.applicationId,
        });
      })
      .catch((error: Error) => toast.error(error.message));
  };

  const setScore = (field: InterviewScoreField, value: string) => {
    setTouched(true);
    setScores({ ...effectiveScores, [field]: value ? Number(value) : null });
  };

  return (
    <div className="space-y-4">
      {isInterviewClosed(interview.status) && (
        <Alert tone="neutral" title={interviewStatusLabel(interview.status)}>
          This interview is already closed
          {interview.decidedAt ? ` (decided ${formatDateTime(interview.decidedAt)})` : ''}. Saving
          again overwrites the verdict.
        </Alert>
      )}

      <div className="space-y-3">
        {INTERVIEW_SCORE_FIELDS.map(({ field, label, hint }) => (
          <Field key={field} label={label} htmlFor={`score-${field}`} hint={hint}>
            <Select
              id={`score-${field}`}
              value={effectiveScores[field] != null ? String(effectiveScores[field]) : ''}
              onChange={(event) => setScore(field, event.target.value)}
              placeholder="Not scored"
              options={SCORE_OPTIONS}
              size="sm"
            />
          </Field>
        ))}
      </div>

      <p className="text-xs text-ink-2" role="status">
        {average === null ? (
          'Scores are optional — a decision with none is still recorded.'
        ) : (
          <>
            Average <span className="font-semibold tabular-nums">{average}</span> out of{' '}
            {INTERVIEW_SCORE_MAX}
          </>
        )}
      </p>

      <Field
        label="What should the record say?"
        htmlFor="outcome-notes"
        hint="Required when the applicant does not pass. Not shown to the applicant."
      >
        <TextArea
          id="outcome-notes"
          rows={5}
          maxLength={4000}
          value={effectiveNotes}
          onChange={(event) => {
            setTouched(true);
            setNotes(event.target.value);
          }}
          placeholder="Strong Hifz, Tajweed needs work on the madd. Would place with older students."
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <UiButton
          onClick={() => submit('PASSED')}
          // Each button spins only for its own verdict; the other waits, disabled.
          loading={record.isPending && record.variables?.outcome === 'PASSED'}
          disabled={record.isPending}
          className={cn('gap-2')}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Passed
        </UiButton>
        <UiButton
          variant="danger"
          onClick={() => submit('FAILED')}
          loading={record.isPending && record.variables?.outcome === 'FAILED'}
          disabled={record.isPending}
        >
          <XCircle className="h-4 w-4" aria-hidden />
          Not passed
        </UiButton>
      </div>

      {!isInterviewClosed(interview.status) && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs text-muted">
            Nobody turned up? Record that instead of a verdict, so the hiring board shows why.
          </p>
          <div className="flex flex-wrap gap-2">
            <UiButton
              variant="secondary"
              loading={noShow.isPending && noShow.variables?.who === 'APPLICANT'}
              disabled={noShow.isPending}
              onClick={() =>
                noShow
                  .mutateAsync({ who: 'APPLICANT' })
                  .then(() => toast.success('Recorded as applicant no-show'))
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              Applicant did not attend
            </UiButton>
            <UiButton
              variant="secondary"
              loading={noShow.isPending && noShow.variables?.who === 'INTERVIEWER'}
              disabled={noShow.isPending}
              onClick={() =>
                noShow
                  .mutateAsync({ who: 'INTERVIEWER' })
                  .then(() => toast.success('Recorded as interviewer no-show'))
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              I could not attend
            </UiButton>
          </div>
        </div>
      )}
    </div>
  );
}
