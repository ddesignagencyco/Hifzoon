'use client';

import React, { useState } from 'react';
import { Alert, Field, Select, TextArea, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useSubmitReview } from '@/hooks/useQa';
import {
  FEEDBACK_MAX,
  QaReview,
  QaSource,
  SCORE_MAX,
  SCORE_MIN,
  STANDARD_RUBRIC,
  validateReview,
} from '@/lib/api/modules/qa';
import { ApiClientError } from '@/lib/api/http';
import { cn } from '@/lib/utils';

const SCORES = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);

/**
 * Rubric review for one class (`POST /qa/classes/:classId/review`). Every criterion of
 * the default rubric must be scored 0–5; a supervisor can review a class only once.
 */
export function RubricReviewForm({
  classId,
  teacherId,
  defaultSource = 'MANUAL',
  onSubmitted,
}: {
  classId: string;
  teacherId?: string;
  defaultSource?: QaSource;
  onSubmitted?: (review: QaReview) => void;
}) {
  const toast = useToast();
  const submit = useSubmitReview(teacherId);
  const [scores, setScores] = useState<Record<string, number | undefined>>({});
  const [feedback, setFeedback] = useState('');
  const [source, setSource] = useState<QaSource>(defaultSource);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<QaReview | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      scores: Object.fromEntries(Object.entries(scores).filter(([, v]) => v !== undefined)) as Record<string, number>,
      ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
      source,
    };
    const found = validateReview(classId, body);
    setErrors(found);
    const firstError = Object.values(found)[0];
    if (firstError) return toast.error(firstError);
    submit.mutate(
      { classId, body },
      {
        onSuccess: (review) => {
          setDone(review);
          toast.success('Review submitted. The teacher can now read and reply to it.');
          onSubmitted?.(review);
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiClientError && err.status === 409
              ? 'You have already reviewed this class. Each supervisor reviews a class once.'
              : err,
          ),
      },
    );
  };

  if (done) {
    return (
      <Alert tone="success" title="Review recorded">
        Submitted {new Date(done.reviewedAt).toLocaleString()} ({source === 'RANDOM_SAMPLE' ? 'random sample' : 'manual review'}).
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="text-xs text-muted">
        Rubric: <span className="font-semibold text-ink-2">{STANDARD_RUBRIC.name}</span> (the academy default). Score each
        criterion from {SCORE_MIN} (not observed) to {SCORE_MAX} (exemplary).
      </p>

      <div className="space-y-4">
        {STANDARD_RUBRIC.items.map((item) => {
          const err = errors[`score.${item.key}`];
          return (
            <fieldset key={item.key} className="space-y-1.5">
              <legend className={cn('text-xs font-semibold', err ? 'text-red' : 'text-ink-2')}>
                {item.label} <span className="text-muted font-normal">· weight {item.weight}</span>
              </legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={item.label} aria-invalid={err ? true : undefined}>
                {SCORES.map((n) => {
                  const selected = scores[item.key] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setScores((s) => ({ ...s, [item.key]: n }))}
                      className={cn(
                        'w-10 h-10 rounded-xl border text-sm font-semibold transition-colors cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                        selected
                          ? 'bg-green-800 text-white border-green-800'
                          : cn('bg-white text-ink hover:bg-sand', err ? 'border-red' : 'border-line'),
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {err && <p className="sr-only">{err}</p>}
            </fieldset>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-[1fr_200px] gap-4">
        <Field label="Feedback for the teacher" htmlFor="review-feedback" error={errors.feedback} hint={`${feedback.length}/${FEEDBACK_MAX}`}>
          <TextArea id="review-feedback" rows={4} maxLength={FEEDBACK_MAX} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
        <Field label="Source" htmlFor="review-source">
          <Select id="review-source" value={source} onChange={(e) => setSource(e.target.value as QaSource)}>
            <option value="MANUAL">Manual review</option>
            <option value="RANDOM_SAMPLE">Monthly random sample</option>
          </Select>
        </Field>
      </div>

      <div className="flex justify-end">
        <UiButton type="submit" loading={submit.isPending}>
          Submit review
        </UiButton>
      </div>
    </form>
  );
}
