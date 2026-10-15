'use client';

import React, { useState } from 'react';
import { BadgeCheck, MailCheck, UserPlus } from 'lucide-react';
import {
  Alert,
  Badge,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  TextInput,
  UiButton,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAddGuardian, useFamilyGuardians } from '@/hooks/useFamily';
import { useConfirmGuardianVerification, useStartGuardianVerification } from '@/hooks/useFamilyConsent';
import { validateGuardianInput } from '@/lib/api/modules/families';
import { validateVerificationCode } from '@/lib/api/modules/consent';

/**
 * CR-10 guardian verification for the signed-in guardian: a 6-digit code is emailed to
 * the family's primary guardian, who passes it on; entering it proves the link.
 */
export function GuardianVerification({
  familyId,
  verifiedAt,
  isPrimary,
}: {
  familyId: string;
  verifiedAt: string | null;
  isPrimary: boolean;
}) {
  const toast = useToast();
  const start = useStartGuardianVerification(familyId);
  const confirm = useConfirmGuardianVerification(familyId);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  if (verifiedAt) {
    return (
      <Alert tone="success" title="You are a verified guardian">
        Verified on {formatDate(verifiedAt)}
        {isPrimary ? ' as the primary guardian of this family.' : '.'}
      </Alert>
    );
  }

  const send = () =>
    start.mutate(undefined, {
      onSuccess: (res) => {
        setExpiresAt(Date.now() + res.expiresInSeconds * 1000);
        toast.success('Verification code sent to the family’s primary guardian.');
      },
      onError: (err) => toast.error(err),
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateVerificationCode(code);
    setError(problem);
    if (problem) return toast.error(problem);
    confirm.mutate(code, {
      onSuccess: () => {
        toast.success('You are now a verified guardian.');
        setCode('');
        setExpiresAt(null);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <div className="space-y-3">
      <Alert tone="warning" title="Your guardian link is not verified yet">
        Verification proves you belong to this family before you act for its children. We’ll email a 6-digit code to the family’s
        primary guardian — ask them for it and enter it below. Codes expire after 15 minutes.
      </Alert>
      {expiresAt === null ? (
        <UiButton onClick={send} loading={start.isPending} icon={<MailCheck className="w-4 h-4" />}>
          Send verification code
        </UiButton>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Verification code" htmlFor="guardian-code" error={error} className="sm:w-48">
            <TextInput
              id="guardian-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={16}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              aria-invalid={Boolean(error)}
            />
          </Field>
          <div className="flex gap-2">
            <UiButton type="submit" loading={confirm.isPending}>Verify</UiButton>
            <UiButton variant="ghost" onClick={send} loading={start.isPending}>Resend</UiButton>
          </div>
        </form>
      )}
    </div>
  );
}

const RELATIONSHIPS = ['PARENT', 'MOTHER', 'FATHER', 'GRANDPARENT', 'STEP_PARENT', 'LEGAL_GUARDIAN', 'OTHER'];

/** Guardians in the family with their CR-10 verification state, plus "add a guardian". */
export function GuardiansCard({ familyId }: { familyId: string }) {
  const guardians = useFamilyGuardians(familyId);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <QueryState
        query={guardians}
        empty={<EmptyState title="No guardians found" />}
      >
        {(rows) => (
          <ul className="divide-y divide-line">
            {rows.map((g) => (
              <li key={g.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{g.user.name}</p>
                  <p className="text-xs text-muted truncate">{g.user.email}</p>
                  <p className="text-[11px] text-muted mt-0.5">{humanize(g.relationship)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.isPrimary && <Badge tone="gold">Primary</Badge>}
                  {g.verifiedAt ? (
                    <Badge tone="green"><BadgeCheck className="w-3 h-3" aria-hidden /> Verified</Badge>
                  ) : (
                    <Badge tone="amber">Not verified</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="pt-3">
        <UiButton variant="secondary" size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
          Add a guardian
        </UiButton>
      </div>
      <AddGuardianModal familyId={familyId} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function AddGuardianModal({ familyId, open, onClose }: { familyId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const add = useAddGuardian(familyId);
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('PARENT');
  const [errors, setErrors] = useState<ReturnType<typeof validateGuardianInput>>({});

  const close = () => {
    if (add.isPending) return;
    setEmail('');
    setErrors({});
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { email: email.trim().toLowerCase(), relationship };
    const found = validateGuardianInput(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
    add.mutate(input, {
      onSuccess: (res) => {
        toast.success(
          res.needsPasswordSetup
            ? `${res.email} added. They can sign in using “Forgot password” to set a password, then verify.`
            : `${res.email} added to your family.`,
        );
        setEmail('');
        onClose();
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a guardian"
      description="The new guardian starts unverified. They verify with a code sent to the primary guardian."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email address" htmlFor="guardian-email" required error={errors.email}>
          <TextInput
            id="guardian-email"
            type="email"
            autoComplete="email"
            value={email}
            maxLength={320}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
        <Field label="Relationship to the children" htmlFor="guardian-rel" required error={errors.relationship}>
          <Select id="guardian-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>{humanize(r)}</option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <UiButton variant="secondary" onClick={close} disabled={add.isPending}>Cancel</UiButton>
          <UiButton type="submit" loading={add.isPending}>Add guardian</UiButton>
        </div>
      </form>
    </Modal>
  );
}
