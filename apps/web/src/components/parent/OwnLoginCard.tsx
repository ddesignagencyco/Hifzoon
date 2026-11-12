'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Alert, Card, CardBody, CardHeader, Field, Modal, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCreateStudentLogin, useRemoveStudentLogin } from '@/hooks/useFamily';
import {
  ageFromBirthYear,
  canHaveOwnLogin,
  FamilyStudent,
  OWN_LOGIN_MIN_AGE,
  validateOwnLoginInput,
} from '@/lib/api/modules/families';
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';

/** Same scoring the register page shows under its password field. */
function passwordStrength(pass: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pass.length >= AUTH_PASSWORD_MIN_LENGTH) score += 1;
  if (/[A-Z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;
  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
  if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
  if (score === 3) return { score: 3, label: 'Good', color: 'bg-blue-500' };
  return { score: 4, label: 'Strong', color: 'bg-green-600' };
}

/**
 * FR-AUTH-03 — the guardian gives a child aged 13+ their own login by choosing the
 * email and password themselves (no invite is sent), and can take it away again.
 */
export function OwnLoginCard({ familyId, student }: { familyId: string; student: FamilyStudent }) {
  const eligible = canHaveOwnLogin(student.birthYear);
  const hasLogin = student.hasOwnLogin ?? student.userId !== null;
  const loginEmail = student.loginEmail ?? null;

  return (
    <Card>
      <CardHeader
        title="Own login"
        description={`From age ${OWN_LOGIN_MIN_AGE} a child can sign in to the student portal with their own email and password.`}
      />
      <CardBody>
        {hasLogin ? (
          <SignedIn familyId={familyId} student={student} email={loginEmail} />
        ) : eligible ? (
          <CreateLoginForm familyId={familyId} student={student} />
        ) : (
          // No "Create login" button here: a child under the age has nothing to create.
          <Alert tone="neutral" title={`Available from age ${OWN_LOGIN_MIN_AGE}`}>
            {student.displayName} is {ageFromBirthYear(student.birthYear)}. A child gets their own login from{' '}
            {OWN_LOGIN_MIN_AGE}; until then you manage everything from your account.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

function SignedIn({ familyId, student, email }: { familyId: string; student: FamilyStudent; email: string | null }) {
  const toast = useToast();
  const remove = useRemoveStudentLogin(familyId, student.id);
  const [confirming, setConfirming] = useState(false);

  const confirmRemove = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(`${student.displayName}’s login has been removed.`);
      },
      onError: (err) => toast.error(err),
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink">
        Signed in as <strong>{email ?? 'their own account'}</strong>
      </p>
      <UiButton variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Remove login
      </UiButton>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title={`Remove ${student.displayName}’s login?`}
        footer={
          <>
            <UiButton variant="secondary" onClick={() => setConfirming(false)} disabled={remove.isPending}>
              Cancel
            </UiButton>
            <UiButton variant="danger" onClick={confirmRemove} loading={remove.isPending}>
              Yes, remove login
            </UiButton>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {student.displayName} will be signed out everywhere and won’t be able to sign in with {email ?? 'this account'}{' '}
          any more. Their lessons and progress stay with your family. You can turn kids mode back on in the details above.
        </p>
      </Modal>
    </div>
  );
}

function CreateLoginForm({ familyId, student }: { familyId: string; student: FamilyStudent }) {
  const toast = useToast();
  const create = useCreateStudentLogin(familyId, student.id);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validateOwnLoginInput>>({});
  const strength = passwordStrength(password);
  const idp = `own-login-${student.id}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateOwnLoginInput({ email, password, confirmPassword });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
      return;
    }
    const address = email.trim().toLowerCase();
    create.mutate(
      { email: address, password },
      {
        onSuccess: (result) => {
          toast.success(`${student.displayName} can now sign in as ${result.loginEmail ?? address}.`);
          setPassword('');
          setConfirmPassword('');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Create own login">
      <p className="text-xs text-muted">
        You choose the email and password and pass them on to {student.displayName}; we don’t send an invitation. Kids
        mode is switched off once the login is created.
      </p>
      <Field label="Email" htmlFor={`${idp}-email`} required error={errors.email}>
        <TextInput
          id={`${idp}-email`}
          type="email"
          autoComplete="off"
          value={email}
          maxLength={320}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
        />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label={`Password (min ${AUTH_PASSWORD_MIN_LENGTH} chars)`}
          htmlFor={`${idp}-password`}
          required
          error={errors.password}
        >
          <div className="relative">
            <TextInput
              id={`${idp}-password`}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label="Toggle password visibility"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm password" htmlFor={`${idp}-confirm`} required error={errors.confirmPassword}>
          <TextInput
            id={`${idp}-confirm`}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
        </Field>
      </div>
      {password && (
        <div className="space-y-1.5 px-1" data-testid="password-strength">
          <div className="flex justify-between items-center text-[10px] text-muted">
            <span>
              Security Strength: <strong className="text-ink">{strength.label}</strong>
            </span>
            <span>
              {password.length}/{AUTH_PASSWORD_MIN_LENGTH} chars minimum
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 h-1.5">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-full rounded-full transition-all ${step <= strength.score ? strength.color : 'bg-sand'}`}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <UiButton type="submit" loading={create.isPending}>
          Create login
        </UiButton>
      </div>
    </form>
  );
}
