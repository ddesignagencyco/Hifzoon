'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Field,
  QueryState,
  StatusBadge,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useTeacherReadiness } from '@/hooks/useAdminConsole';
import { useRecordSafeguardingTraining, useReviewTeacherProfile } from '@/hooks/useHiring';
import { SafeguardingTrainingResult } from '@/lib/api/modules/teacher-hiring';
import { ConfirmDialog, toLocalDateValue } from '../shared/AdminUi';

/**
 * Actions on a teacher *profile* id: readiness report (SUPER_ADMIN), safeguarding
 * training (ADMIN/SUPER_ADMIN/SUPERVISOR) and staged profile-change review (ADMIN/SUPER_ADMIN).
 */
export function TeacherProfileTools({ profileId }: { profileId: string }) {
  const { isSuperAdmin, isStaffAdmin, canManageHiring } = useAdminRoles();
  return (
    <div className="space-y-6">
      {isSuperAdmin && <ReadinessPanel profileId={profileId} />}
      {canManageHiring && <SafeguardingPanel profileId={profileId} />}
      {isStaffAdmin && <ProfileReviewPanel profileId={profileId} />}
    </div>
  );
}

function ReadinessPanel({ profileId }: { profileId: string }) {
  const readiness = useTeacherReadiness(profileId);
  return (
    <section aria-labelledby="readiness-heading" className="space-y-2">
      <h3 id="readiness-heading" className="text-sm font-semibold text-ink font-sans">
        Matching readiness
      </h3>
      <QueryState query={readiness} loadingLabel="Checking readiness…">
        {(r) => (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.readyToMatch ? 'green' : 'amber'}>{r.readyToMatch ? 'Matchable' : 'Not matchable'}</Badge>
              <StatusBadge status={r.hiringStatus} />
              <Badge tone={r.safeguardingTrainingCompleted ? 'green' : 'red'}>
                Safeguarding training {r.safeguardingTrainingCompleted ? 'recorded' : 'missing'}
              </Badge>
            </div>
            {r.blockers.length === 0 ? (
              <p className="text-xs text-green-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> No blockers — this teacher can be matched.
              </p>
            ) : (
              <ul className="space-y-1">
                {r.blockers.map((b) => (
                  <li key={b} className="text-xs text-red flex items-start gap-1.5">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </QueryState>
    </section>
  );
}

function SafeguardingPanel({ profileId }: { profileId: string }) {
  const toast = useToast();
  const record = useRecordSafeguardingTraining();
  const [date, setDate] = useState(() => toLocalDateValue(new Date()));
  const [result, setResult] = useState<SafeguardingTrainingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const at = new Date(`${date}T12:00:00`);
    if (!date || Number.isNaN(at.getTime())) {
      setError('Choose the completion date.');
      return toast.error('Choose the completion date.');
    }
    if (at.getTime() > Date.now() + 24 * 3600 * 1000) {
      setError('Completion cannot be in the future.');
      return toast.error('Completion cannot be in the future.');
    }
    setError(null);
    record.mutate(
      { profileId, completedAt: at.toISOString() },
      {
        onSuccess: (res) => {
          setResult(res);
          toast.success(res.readyToMatch ? 'Training recorded — teacher is now matchable' : 'Safeguarding training recorded');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <section aria-labelledby="training-heading" className="space-y-2">
      <h3 id="training-heading" className="text-sm font-semibold text-ink font-sans">
        Safeguarding training
      </h3>
      <p className="text-xs text-muted">The last gate before a teacher can be matched to a child.</p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-2" noValidate>
        <Field label="Completed on" htmlFor={`training-${profileId}`} error={error} className="flex-1">
          <TextInput id={`training-${profileId}`} type="date" value={date} max={toLocalDateValue(new Date())} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <UiButton type="submit" loading={record.isPending}>
          Record training
        </UiButton>
      </form>
      {result && (
        <Alert tone={result.readyToMatch ? 'success' : 'neutral'}>
          Recorded {formatDateTime(result.safeguardingTrainingCompletedAt)}.{' '}
          {result.readyToMatch ? 'The teacher is matchable.' : 'Still not matchable — hiring steps remain.'}
        </Alert>
      )}
    </section>
  );
}

function ProfileReviewPanel({ profileId }: { profileId: string }) {
  const toast = useToast();
  const review = useReviewTeacherProfile();
  const [pending, setPending] = useState<boolean | null>(null);

  const confirm = () => {
    if (pending === null) return;
    const approve = pending;
    review.mutate(
      { profileId, approve },
      {
        onSuccess: () => {
          setPending(null);
          toast.success(approve ? 'Profile changes published' : 'Profile changes rejected');
        },
        onError: (err) => {
          setPending(null);
          toast.error(err);
        },
      },
    );
  };

  return (
    <section aria-labelledby="review-heading" className="space-y-2">
      <h3 id="review-heading" className="text-sm font-semibold text-ink font-sans">
        Public profile changes
      </h3>
      <p className="text-xs text-muted">
        Teachers submit edits to their public profile (bio, photo, intro video, recitation sample, qualifications,
        languages, subjects and age groups) for approval. The API doesn&apos;t yet show admins what was changed or who is
        waiting (backend M54), so check with the teacher before approving. If nothing is waiting, the API says so.
      </p>
      <div className="flex flex-wrap gap-2">
        <UiButton onClick={() => setPending(true)}>Approve staged changes</UiButton>
        <UiButton variant="secondary" onClick={() => setPending(false)}>
          Reject staged changes
        </UiButton>
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending ? 'Publish staged profile changes?' : 'Discard staged profile changes?'}
        tone={pending ? 'primary' : 'danger'}
        confirmLabel={pending ? 'Publish' : 'Discard'}
        loading={review.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        <p className="text-sm text-ink-2">
          {pending
            ? 'The allowed fields go live on the public teacher listing immediately.'
            : 'The teacher will need to submit their changes again.'}
        </p>
      </ConfirmDialog>
    </section>
  );
}
