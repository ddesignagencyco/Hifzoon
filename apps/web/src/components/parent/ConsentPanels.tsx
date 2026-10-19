'use client';

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Alert,
  Badge,
  Checkbox,
  Field,
  Modal,
  QueryState,
  TextArea,
  UiButton,
  formatDate,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useGrantConsent, useStudentConsent, useWithdrawConsent } from '@/hooks/useFamilyConsent';
import {
  CONSENT_POLICY_VERSION,
  CONSENT_PURPOSES,
  ConsentPurpose,
  StudentConsentState,
} from '@/lib/api/modules/consent';

/**
 * CR-01 consent step shown right after a child is added. Each purpose is a separate
 * opt-in (CR-06); lesson records are required before any class can be booked.
 */
export function ConsentSetup({
  studentId,
  displayName,
  under13,
  onDone,
}: {
  studentId: string;
  displayName: string;
  under13: boolean;
  onDone: (granted: ConsentPurpose[]) => void;
}) {
  const toast = useToast();
  const grant = useGrantConsent(studentId);
  const [selected, setSelected] = useState<Set<ConsentPurpose>>(() => new Set<ConsentPurpose>(['DATA_COLLECTION']));
  const [confirmed, setConfirmed] = useState(false);
  const [invalid, setInvalid] = useState<'purposes' | 'confirm' | null>(null);

  const toggle = (purpose: ConsentPurpose, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(purpose);
      else next.delete(purpose);
      return next;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected.has('DATA_COLLECTION')) {
      setInvalid('purposes');
      toast.error('Consent for lesson records is required before classes can be booked.');
      return;
    }
    if (!confirmed) {
      setInvalid('confirm');
      toast.error('Please confirm you are the child’s parent or legal guardian.');
      return;
    }
    setInvalid(null);
    const purposes = CONSENT_PURPOSES.map((p) => p.purpose).filter((p) => selected.has(p));
    grant.mutate(purposes, {
      onSuccess: () => {
        toast.success(`Consent recorded for ${displayName}.`);
        onDone(purposes);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={`Consent for ${displayName}`}>
      <Alert tone={under13 ? 'warning' : 'neutral'} title={under13 ? `${displayName} is under 13` : 'Your choices'}>
        {under13
          ? 'By law we need a parent’s consent before storing any of their learning data. Each option below is separate — you can change them at any time from Privacy & consent.'
          : 'Each option is separate and can be changed at any time from Privacy & consent.'}
      </Alert>
      <fieldset className="space-y-3" aria-invalid={invalid === 'purposes' || undefined}>
        <legend className={cn('text-xs font-semibold mb-1', invalid === 'purposes' ? 'text-red' : 'text-ink-2')}>What may Hifzoon do?</legend>
        {CONSENT_PURPOSES.map((p) => (
          <Checkbox
            key={p.purpose}
            id={`setup-consent-${p.purpose}`}
            checked={selected.has(p.purpose)}
            onChange={(on) => toggle(p.purpose, on)}
            label={
              <span>
                {p.label}
                {p.required && <span className="ml-1.5 text-[11px] font-semibold text-gold-600">Required</span>}
              </span>
            }
            description={p.description}
          />
        ))}
      </fieldset>
      <div
        className={cn('border-t border-line pt-3', invalid === 'confirm' && 'rounded-lg ring-1 ring-red p-2')}
      >
        <Checkbox
          id="setup-consent-confirm"
          checked={confirmed}
          onChange={setConfirmed}
          label={`I am ${displayName}’s parent or legal guardian`}
          description={`I have read the privacy notice (version ${CONSENT_POLICY_VERSION}) and give these consents on the child’s behalf.`}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <UiButton type="submit" loading={grant.isPending} icon={<ShieldCheck className="w-4 h-4" />}>
          Record consent
        </UiButton>
      </div>
    </form>
  );
}

/** Per-purpose consent state with grant / withdraw for one child (FR-AUTH-04). */
export function ConsentManager({ studentId, displayName }: { studentId: string; displayName: string }) {
  const consent = useStudentConsent(studentId);
  return (
    <QueryState query={consent} isEmpty={(d) => d.purposes.length === 0}>
      {(data) => <ConsentList state={data} studentId={studentId} displayName={displayName} />}
    </QueryState>
  );
}

function ConsentList({
  state,
  studentId,
  displayName,
}: {
  state: StudentConsentState;
  studentId: string;
  displayName: string;
}) {
  const toast = useToast();
  const grant = useGrantConsent(studentId);
  const withdraw = useWithdrawConsent(studentId);
  const [withdrawing, setWithdrawing] = useState<ConsentPurpose | null>(null);
  const [reason, setReason] = useState('');
  const [pendingPurpose, setPendingPurpose] = useState<ConsentPurpose | null>(null);

  const byPurpose = new Map(state.purposes.map((p) => [p.purpose, p]));
  const meta = (purpose: ConsentPurpose) => CONSENT_PURPOSES.find((p) => p.purpose === purpose);

  const doGrant = (purpose: ConsentPurpose) => {
    setPendingPurpose(purpose);
    grant.mutate([purpose], {
      onSuccess: () => toast.success(`${meta(purpose)?.label ?? purpose} allowed for ${displayName}.`),
      onError: (err) => toast.error(err),
      onSettled: () => setPendingPurpose(null),
    });
  };

  const doWithdraw = () => {
    if (!withdrawing) return;
    const purpose = withdrawing;
    if (reason.length > 500) return;
    setPendingPurpose(purpose);
    withdraw.mutate(
      { purposes: [purpose], reason },
      {
        onSuccess: () => {
          toast.success(`${meta(purpose)?.label ?? purpose} withdrawn for ${displayName}.`);
          setWithdrawing(null);
          setReason('');
        },
        onError: (err) => toast.error(err),
        onSettled: () => setPendingPurpose(null),
      },
    );
  };

  const ordered = CONSENT_PURPOSES.filter((p) => byPurpose.has(p.purpose));

  return (
    <>
      <ul className="divide-y divide-line" aria-label={`Consents for ${displayName}`}>
        {ordered.map((p) => {
          const row = byPurpose.get(p.purpose)!;
          const granted = row.status === 'GRANTED';
          return (
            <li key={p.purpose} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{p.label}</p>
                  <Badge tone={granted ? 'green' : 'neutral'}>{granted ? 'Allowed' : 'Not allowed'}</Badge>
                  {p.required && <Badge tone="gold">Required for classes</Badge>}
                </div>
                <p className="text-xs text-muted mt-1 max-w-xl">{p.description}</p>
                <p className="text-[11px] text-muted mt-1">
                  {granted
                    ? `Given ${formatDate(row.grantedAt)}${row.policyVersion ? ` · notice ${row.policyVersion}` : ''}`
                    : row.withdrawnAt
                      ? `Withdrawn ${formatDate(row.withdrawnAt)}`
                      : 'Never given'}
                </p>
              </div>
              <div className="shrink-0">
                {granted ? (
                  <UiButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setWithdrawing(p.purpose)}
                    disabled={pendingPurpose !== null}
                    aria-label={`Withdraw ${p.label}`}
                  >
                    Withdraw
                  </UiButton>
                ) : (
                  <UiButton
                    size="sm"
                    onClick={() => doGrant(p.purpose)}
                    loading={pendingPurpose === p.purpose && grant.isPending}
                    disabled={pendingPurpose !== null}
                    aria-label={`Allow ${p.label}`}
                  >
                    Allow
                  </UiButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={withdrawing !== null}
        onClose={() => (withdraw.isPending ? undefined : setWithdrawing(null))}
        title={`Withdraw ${meta(withdrawing ?? 'DATA_COLLECTION')?.label.toLowerCase() ?? 'consent'}?`}
        description="The original consent stays on record; withdrawal takes effect immediately."
        footer={
          <>
            <UiButton variant="secondary" onClick={() => setWithdrawing(null)} disabled={withdraw.isPending}>
              Keep it
            </UiButton>
            <UiButton variant="danger" onClick={doWithdraw} loading={withdraw.isPending} disabled={reason.length > 500}>
              Withdraw consent
            </UiButton>
          </>
        }
      >
        <div className="space-y-3">
          {withdrawing === 'DATA_COLLECTION' && (
            <Alert tone="warning" title="Classes will be blocked">
              Without consent for lesson records, new classes can’t be booked for {displayName}.
            </Alert>
          )}
          {withdrawing === 'CLASS_RECORDING' && (
            <Alert tone="neutral">Future classes will not be recorded and pending recordings are scheduled for deletion.</Alert>
          )}
          {(withdrawing === 'AI_VOICE' || withdrawing === 'AI_TRAINING') && (
            <Alert tone="neutral">Stored practice audio for {displayName} will be deleted.</Alert>
          )}
          <Field
            label="Reason (optional)"
            htmlFor="withdraw-reason"
            error={reason.length > 500 ? 'Keep the reason under 500 characters.' : null}
          >
            <TextArea id="withdraw-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
