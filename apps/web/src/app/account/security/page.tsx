'use client';

import React, { useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  TextInput,
  UiButton,
  formatDateTime,
  humanize,
  type Column,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useSessions, useTwoFactor } from '@/hooks';
import { EnrolTwoFactor } from '@/components/auth/TwoFactorEnrolment';
import type { UserSessionRecord } from '@/lib/types';
import { changePassword, isStaffUser, requestPasswordReset } from '@/lib/api/client';
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/types';
import { OAuthButtons, useOAuthProviders } from '@/components/auth/OAuthButtons';

/**
 * Account security (FR-AUTH-01, FR-AUTH-07): identity, TOTP two-factor enrolment and
 * active sessions. Rendered inside the user's portal shell by `app/account/layout.tsx`,
 * which also handles the signed-in guard.
 */
export default function AccountSecurityPage() {
  const { currentUser, logout, isAuthenticated } = useAuth();

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Security & sessions"
        description="Change your password, manage two-factor authentication and see where you are signed in."
        actions={
          isAuthenticated ? (
            <UiButton variant="secondary" size="sm" icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => logout(false)}>
              Sign out
            </UiButton>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {isStaffUser(currentUser?.roles) && !currentUser?.twoFactorEnabled && (
          <Alert tone="warning" title="Two-factor authentication is required for staff">
            Your account can&apos;t open student or family data until 2FA is on. Set it up below — access returns as soon as you
            confirm the first code from your authenticator app.
          </Alert>
        )}
        <Card>
          <CardHeader
            title={currentUser?.name || 'Authenticated user'}
            description={`${currentUser?.email || 'Active session'} · Roles: ${
              currentUser?.roles?.map((r) => humanize(r)).join(', ') || 'Student'
            }`}
            action={<Badge tone="green">{humanize(currentUser?.status || 'ACTIVE')}</Badge>}
          />
        </Card>

        <PasswordCard email={currentUser?.email ?? null} />
        <TwoFactorCard enabled={!!currentUser?.twoFactorEnabled} />
        <SignInMethodsCard />
        <SessionsCard />
      </div>
    </>
  );
}

/**
 * Change password while signed in (M69). Accounts created through Google/Apple have no
 * password yet, so the reset link stays available as the way to set one.
 */
function PasswordCard({ email }: { email: string | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!form.current) found.current = 'Enter your current password.';
    if (form.next.length < AUTH_PASSWORD_MIN_LENGTH) found.next = `Use at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`;
    else if (form.next === form.current) found.next = 'Choose a password different from your current one.';
    if (form.confirm !== form.next) found.confirm = 'The passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const res = await changePassword({ currentPassword: form.current, newPassword: form.next });
    setSaving(false);
    if (res.success) {
      setForm({ current: '', next: '', confirm: '' });
      setDone(res.otherSessionsRevoked ?? 0);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      toast.success('Password changed.');
    } else {
      toast.error(res.error);
    }
  };

  const sendReset = async () => {
    if (!email) return;
    setSending(true);
    const res = await requestPasswordReset(email);
    setSending(false);
    if (res.success) {
      setSentTo(email);
      toast.success(`Reset link sent to ${email}.`);
    } else {
      toast.error(res.error || res.message);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Password"
        description="Changing your password signs you out everywhere else. We email you to confirm the change."
      />
      <CardBody>
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-3 items-start">
          <Field label="Current password" htmlFor="pw-current" error={errors.current}>
            <TextInput
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.value })}
            />
          </Field>
          <Field label="New password" htmlFor="pw-new" hint={`At least ${AUTH_PASSWORD_MIN_LENGTH} characters`} error={errors.next}>
            <TextInput
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm}>
            <TextInput
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={sendReset}
              disabled={!email || sending}
              className="text-xs text-ink-2 underline underline-offset-2 decoration-gold disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Signed up with Google or Apple? Email me a link to set a password'}
            </button>
            <UiButton type="submit" loading={saving}>
              Change password
            </UiButton>
          </div>
        </form>
        {done !== null && (
          <Alert tone="success" title="Password changed" className="mt-4">
            {done > 0
              ? `You were signed out of ${done} other session${done === 1 ? '' : 's'}.`
              : 'No other sessions were signed in.'}
          </Alert>
        )}
        {sentTo && (
          <Alert tone="success" title="Check your inbox" className="mt-4">
            We sent a link to {sentTo}. Open it on this device to set your password.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

/** Link Google / Apple to this account (FR-AUTH-01). Hidden when no provider is configured. */
function SignInMethodsCard() {
  const providers = useOAuthProviders();
  if (!providers.data?.length) return null;
  return (
    <Card>
      <CardHeader
        title="Sign-in methods"
        description="Add Google or Apple so you can sign in without your password. You will be sent to the provider and brought back here."
      />
      <CardBody>
        <OAuthButtons mode="link" returnTo="/account/security" />
        <p className="mt-3 text-xs text-muted">
          Accounts with two-factor authentication must still sign in with a password and code.
        </p>
      </CardBody>
    </Card>
  );
}

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const { currentUser } = useAuth();
  const staff = isStaffUser(currentUser?.roles);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Two-factor authentication (2FA)
            {enabled ? <Badge tone="green">Enabled</Badge> : <Badge>Not enrolled</Badge>}
          </span>
        }
        description="Protects your account with a TOTP authenticator app (Google Authenticator, 1Password, Authy). Mandatory for teachers and staff (FR-AUTH-01)."
      />
      <CardBody>
        {!staff ? (
          <p className="text-sm text-muted">
            Two-factor authentication is currently available for teacher and staff accounts only. Your account is
            protected by your password and automatic sign-out of inactive sessions.
          </p>
        ) : enabled ? (
          <DisableTwoFactor />
        ) : (
          <EnrolTwoFactor />
        )}
      </CardBody>
    </Card>
  );
}


function DisableTwoFactor() {
  const toast = useToast();
  const { disable, isDisabling } = useTwoFactor();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);

  const close = () => {
    setOpen(false);
    setMethod('password');
    setPassword('');
    setCode('');
    setInvalid(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'password' ? !password : code.trim().length < 6) {
      setInvalid(true);
      toast.error(method === 'password' ? 'Enter your password.' : 'Enter a current 6-digit code or a recovery code.');
      return;
    }
    // The backend accepts the password or a TOTP / recovery code as re-authentication.
    const res = await disable(method === 'password' ? { password } : { code: code.trim() });
    if (res.success) {
      toast.success('Two-factor authentication has been turned off.');
      close();
    } else {
      setInvalid(true);
      toast.error(res.error || 'Could not turn off two-factor authentication.');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Sign-ins on this account require a code from your authenticator app.</p>
        <UiButton variant="danger" size="sm" onClick={() => setOpen(true)}>
          Turn off 2FA
        </UiButton>
      </div>
      <Modal
        open={open}
        onClose={close}
        size="sm"
        title="Turn off two-factor authentication?"
        description="2FA is required for staff accounts; you will need to enrol again before your next staff sign-in. Unused recovery codes stop working."
        footer={
          <>
            <UiButton variant="secondary" size="sm" onClick={close}>
              Cancel
            </UiButton>
            <UiButton variant="danger" size="sm" type="submit" form="disable-2fa-form" loading={isDisabling}>
              Turn off 2FA
            </UiButton>
          </>
        }
      >
        <form id="disable-2fa-form" onSubmit={submit} className="space-y-3">
          {method === 'password' ? (
            <Field label="Confirm your password" htmlFor="disable-password" required error={invalid ? 'Check your password' : undefined}>
              <TextInput
                id="disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setInvalid(false);
                }}
              />
            </Field>
          ) : (
            <Field label="Authenticator or recovery code" htmlFor="disable-code" required error={invalid ? 'Check the code' : undefined}>
              <TextInput
                id="disable-code"
                autoComplete="one-time-code"
                maxLength={32}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\s/g, ''));
                  setInvalid(false);
                }}
                className="font-mono tracking-[0.3em]"
              />
            </Field>
          )}
          <button
            type="button"
            className="text-xs text-green-800 hover:underline"
            onClick={() => {
              setMethod(method === 'password' ? 'code' : 'password');
              setInvalid(false);
            }}
          >
            {method === 'password' ? 'Use an authenticator or recovery code instead' : 'Use my password instead'}
          </button>
        </form>
      </Modal>
    </>
  );
}


const SESSION_COLUMNS: Column<UserSessionRecord>[] = [
  {
    key: 'device',
    header: 'Device',
    render: (s) => (
      <span className="inline-flex items-center gap-2 font-medium text-ink">
        {s.userAgent ? s.userAgent.slice(0, 50) : 'Browser client'}
        {s.staff && <Badge tone="gold">Staff</Badge>}
      </span>
    ),
  },
  { key: 'ip', header: 'IP address', render: (s) => s.ip || '—' },
  { key: 'created', header: 'Signed in', render: (s) => formatDateTime(s.createdAt) },
  { key: 'last', header: 'Last active', render: (s) => formatDateTime(s.lastActiveAt) },
  { key: 'status', header: 'Status', render: () => <Badge tone="green">Active</Badge> },
];

function SessionsCard() {
  const toast = useToast();
  const { sessions, isLoading, revokeAllSessions, isRevoking } = useSessions();

  const router = useRouter();

  // The backend revokes every session, including this one, so the user is signed out.
  const revokeAll = async () => {
    if (!window.confirm('Sign out of every device, including this one?')) return;
    const res = await revokeAllSessions();
    if (res.success) {
      toast.success('Signed out of all devices.');
      router.replace('/login');
    } else {
      toast.error(res.error || 'Could not sign out of all devices.');
    }
  };

  return (
    <Card>
      <CardHeader
        title="Active sessions (FR-AUTH-07)"
        description="Devices and browsers with active authentication tokens."
        action={
          sessions.length > 0 ? (
            <UiButton variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={revokeAll} loading={isRevoking}>
              Sign out everywhere
            </UiButton>
          ) : undefined
        }
      />
      <CardBody>
        {isLoading ? (
          <LoadingState label="Loading sessions…" />
        ) : (
          <DataTable
            columns={SESSION_COLUMNS}
            rows={sessions}
            rowKey={(s) => s.id}
            empty={
              <EmptyState
                title="No other sessions"
                description="You are connected via the current browser tab only."
              />
            }
          />
        )}
      </CardBody>
    </Card>
  );
}
