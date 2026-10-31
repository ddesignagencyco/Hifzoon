'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Field,
  QueryState,
  Select,
  StatusBadge,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useTeacherReadiness } from '@/hooks/useAdminConsole';
import { stepLabel } from './step-label';
import { usePendingProfileChanges, useRecordSafeguardingTraining } from '@/hooks/useHiring';
import { useAssignTeacherTier, useTeacherTiers } from '@/hooks/useTeacherTiers';
import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';
import { ProfileChangeActions, ProfileChangeDiff } from './ProfileChangesQueue';
import { SafeguardingTrainingResult } from '@/lib/api/modules/teacher-hiring';
import { toLocalDateValue } from '../shared/AdminUi';

/**
 * Actions on a teacher *profile* id: readiness report (SUPER_ADMIN), safeguarding
 * training (ADMIN/SUPER_ADMIN/SUPERVISOR), tier and staged profile-change review (ADMIN/SUPER_ADMIN).
 */
export function TeacherProfileTools({ profileId }: { profileId: string }) {
  const { isSuperAdmin, isStaffAdmin, canManageHiring } = useAdminRoles();
  return (
    <div className="space-y-6">
      {isSuperAdmin && <ReadinessPanel profileId={profileId} />}
      {canManageHiring && <SafeguardingPanel profileId={profileId} />}
      {isStaffAdmin && <TierPanel profileId={profileId} />}
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
                    {/* The API names steps by code ("DEMO_CLASS"); show them as words. */}
                    {b.replace(/[A-Z]+(?:_[A-Z]+)+|[A-Z]{4,}/g, (code) => stepLabel(code).toLowerCase())}
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
  const query = usePendingProfileChanges();
  const change = query.data?.find((c) => c.profileId === profileId);

  return (
    <section aria-labelledby="review-heading" className="space-y-3">
      <h3 id="review-heading" className="text-sm font-semibold text-ink font-sans">
        Public profile changes
      </h3>
      <QueryState query={query} loadingLabel="Checking for staged changes…">
        {() =>
          change ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Submitted {change.submittedAt ? formatDateTime(change.submittedAt) : 'at an unknown time'}. Approving
                publishes these fields and verifies any new certificates or associations.
              </p>
              <ProfileChangeDiff change={change} />
              <ProfileChangeActions change={change} />
            </div>
          ) : (
            <p className="text-xs text-muted">This teacher has no profile change waiting for review.</p>
          )
        }
      </QueryState>
    </section>
  );
}

function TierPanel({ profileId }: { profileId: string }) {
  const toast = useToast();
  const tiers = useTeacherTiers();
  // R2 — read from the admin readiness (works before the teacher is public).
  const readiness = useTeacherReadiness(profileId);
  const current = { isLoading: readiness.isLoading, tier: readiness.data?.tier ?? null };
  const assign = useAssignTeacherTier();
  const [choice, setChoice] = useState<string | null>(null);
  const currentId = tiers.data?.find((t) => t.code === current.tier?.code)?.id ?? '';
  const value = choice ?? currentId;

  const save = () =>
    assign.mutate(
      { profileId, tierId: value || null },
      {
        onSuccess: (res) => {
          setChoice(null);
          toast.success(res.tier ? `Tier set to ${res.tier.name}` : 'Tier cleared');
        },
        onError: (err) => toast.error(err),
      },
    );

  return (
    <section aria-labelledby="tier-heading" className="space-y-2">
      <h3 id="tier-heading" className="text-sm font-semibold text-ink font-sans">
        Qualification tier
      </h3>
      <p className="text-xs text-muted">
        Only admins set a teacher&apos;s tier. It appears as a badge on their public profile and decides which plans
        they can teach.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Current:</span>
        {current.isLoading ? (
          <span className="text-xs text-muted">Loading…</span>
        ) : current.tier ? (
          <TeacherTierBadge tier={current.tier} size="sm" />
        ) : (
          <span className="text-xs text-ink-2">No tier</span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64">
          <Select
            aria-label="Teacher tier"
            value={value}
            disabled={tiers.isLoading || assign.isPending}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">No tier</option>
            {(tiers.data ?? [])
              .filter((t) => t.active || t.id === currentId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.badgeIcon ? `${t.badgeIcon} ` : ''}
                  {t.name}
                </option>
              ))}
          </Select>
        </div>
        <UiButton size="sm" onClick={save} loading={assign.isPending} disabled={choice === null || choice === currentId}>
          Save tier
        </UiButton>
      </div>
    </section>
  );
}
