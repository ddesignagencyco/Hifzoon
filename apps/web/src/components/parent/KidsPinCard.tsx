'use client';

import React, { useState } from 'react';
import { Alert, Card, CardBody, CardHeader, Field, Modal, TextInput, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks';
import { useRemoveKidsPin, useSetKidsPin } from '@/hooks/useFamily';
import { FamilyStudent, kidsPinProblem } from '@/lib/api/modules/families';

/**
 * Kids PIN sign-in (FR-AUTH-03). A child in kids mode with no login of their own signs in
 * with the family sign-in (a guardian's email), their name and this PIN, and reaches only
 * their own student portal and classroom.
 */
export function KidsPinCard({ familyId, student }: { familyId: string; student: FamilyStudent }) {
  const { currentUser } = useAuth();
  const hasOwnLogin = student.hasOwnLogin ?? false;
  const hasPin = student.hasKidsPin ?? false;

  return (
    <Card>
      <CardHeader
        title="Kids PIN sign-in"
        description={`Lets ${student.displayName} sign in to their classes on their own, without your password.`}
      />
      <CardBody className="space-y-4">
        {hasOwnLogin ? (
          <Alert tone="neutral">{student.displayName} has their own login, so a PIN isn’t needed.</Alert>
        ) : !student.kidsMode ? (
          <Alert tone="neutral">Turn on kids mode in the details above to give {student.displayName} a PIN.</Alert>
        ) : (
          <>
            <div className="rounded-xl bg-sand/60 border border-line px-4 py-3 text-xs text-ink-2 space-y-1">
              <p>
                {student.displayName} signs in from <strong>Sign in → Student → Kids Mode</strong> with:
              </p>
              <ul className="list-disc pl-5">
                <li>
                  Family sign-in: <strong>{currentUser?.email ?? 'your email address'}</strong> (any parent’s email works)
                </li>
                <li>
                  Name: <strong>{student.displayName}</strong>
                </li>
                <li>The PIN you set here</li>
              </ul>
              <p className="text-muted">
                They see their classes and progress only, never billing or account settings. Five wrong PINs lock it for
                15 minutes.
              </p>
            </div>
            {student.kidsPinLockedUntil && (
              <Alert tone="warning">
                Locked after too many wrong PINs until {formatDateTime(student.kidsPinLockedUntil)}. Setting a new PIN unlocks
                it now.
              </Alert>
            )}
            <SetPinForm familyId={familyId} student={student} hasPin={hasPin} />
            {hasPin && <RemovePin familyId={familyId} student={student} />}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function SetPinForm({ familyId, student, hasPin }: { familyId: string; student: FamilyStudent; hasPin: boolean }) {
  const toast = useToast();
  const setPin = useSetKidsPin(familyId, student.id);
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idp = `kids-pin-${student.id}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = kidsPinProblem(pin) ?? (pin !== confirm ? 'The two PINs don’t match.' : null);
    setError(problem);
    if (problem) return;
    setPin.mutate(pin, {
      onSuccess: () => {
        toast.success(hasPin ? `${student.displayName}’s PIN has been changed.` : `${student.displayName} can now sign in with their PIN.`);
        setPinValue('');
        setConfirm('');
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-label={hasPin ? 'Change kids PIN' : 'Set kids PIN'}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={hasPin ? 'New PIN (4–6 digits)' : 'PIN (4–6 digits)'} htmlFor={`${idp}-pin`} required error={error ?? undefined}>
          <TextInput
            id={`${idp}-pin`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
            aria-invalid={Boolean(error)}
          />
        </Field>
        <Field label="Repeat the PIN" htmlFor={`${idp}-confirm`} required>
          <TextInput
            id={`${idp}-confirm`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>
      {hasPin && <p className="text-xs text-muted">Changing the PIN signs {student.displayName} out everywhere.</p>}
      <div className="flex justify-end">
        <UiButton type="submit" loading={setPin.isPending}>
          {hasPin ? 'Change PIN' : 'Set PIN'}
        </UiButton>
      </div>
    </form>
  );
}

function RemovePin({ familyId, student }: { familyId: string; student: FamilyStudent }) {
  const toast = useToast();
  const remove = useRemoveKidsPin(familyId, student.id);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex justify-end">
      <UiButton variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Remove PIN
      </UiButton>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title={`Remove ${student.displayName}’s PIN?`}
        footer={
          <>
            <UiButton variant="secondary" onClick={() => setConfirming(false)} disabled={remove.isPending}>
              Cancel
            </UiButton>
            <UiButton
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success(`${student.displayName}’s PIN has been removed.`);
                  },
                  onError: (err) => toast.error(err),
                })
              }
            >
              Yes, remove PIN
            </UiButton>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {student.displayName} will be signed out and can’t sign in with a PIN until you set a new one. Their lessons and
          progress stay with your family.
        </p>
      </Modal>
    </div>
  );
}
