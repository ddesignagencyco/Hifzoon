'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import {
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
import { useAuth, useSessions, useTwoFactor } from '@/hooks';
import type { UserSessionRecord } from '@/lib/types';
import { isStaffUser } from '@/lib/api/client';
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
        description="Manage your active logins and Two-Factor Authentication (FR-AUTH-01, FR-AUTH-07)."
        actions={
          isAuthenticated ? (
            <UiButton variant="secondary" size="sm" icon={<LogOut className="w-3.5 h-3.5" />} onClick={() => logout(false)}>
              Sign out
            </UiButton>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={currentUser?.name || 'Authenticated user'}
            description={`${currentUser?.email || 'Active session'} · Roles: ${
              currentUser?.roles?.map((r) => humanize(r)).join(', ') || 'Student'
            }`}
            action={<Badge tone="green">{humanize(currentUser?.status || 'ACTIVE')}</Badge>}
          />
        </Card>

        <TwoFactorCard enabled={!!currentUser?.twoFactorEnabled} />
        <SignInMethodsCard />
        <SessionsCard />
      </div>
    </>
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

type SetupData = { otpauthUrl: string; secret: string; recoveryCodes: string[] };

function EnrolTwoFactor() {
  const toast = useToast();
  const { setup, confirm: confirmTwoFactor, isSettingUp, isConfirming } = useTwoFactor();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');

  const reset = () => {
    setOpen(false);
    setPassword('');
    setSetupData(null);
    setCode('');
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error('Enter your current password to continue.');
      return;
    }
    // The backend re-checks the password in the same request (NFR-SEC-01).
    const res = await setup(password);
    if (res.success && res.data?.secret && res.data.otpauthUrl) {
      setSetupData({
        otpauthUrl: res.data.otpauthUrl,
        secret: res.data.secret,
        recoveryCodes: res.data.recoveryCodes ?? [],
      });
      setPassword('');
    } else {
      toast.error(res.error || res.data?.message || 'Two-factor setup could not be started for this account.');
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your authenticator app.');
      return;
    }
    const res = await confirmTwoFactor(code);
    if (res.success) {
      toast.success('Two-factor authentication is now enabled.');
      reset();
    } else {
      toast.error(res.error || 'That code is not valid. Check the time on your phone and try again.');
    }
  };

  if (!open) {
    return (
      <UiButton size="sm" icon={<ShieldCheck className="w-3.5 h-3.5" />} onClick={() => setOpen(true)}>
        Set up two-factor authentication
      </UiButton>
    );
  }

  if (!setupData) {
    return (
      <form onSubmit={start} className="max-w-md space-y-3">
        <Field label="Confirm your current password" htmlFor="twofa-password" required>
          <TextInput
            id="twofa-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex gap-2">
          <UiButton type="submit" size="sm" loading={isSettingUp}>
            Continue
          </UiButton>
          <UiButton variant="secondary" size="sm" onClick={reset}>
            Cancel
          </UiButton>
        </div>
      </form>
    );
  }

  const step = setupData.recoveryCodes.length > 0 ? 3 : 2;

  return (
    <form onSubmit={confirm} className="space-y-5">
      <div className="grid sm:grid-cols-[200px_1fr] gap-5 items-start">
        <OtpQrCode value={setupData.otpauthUrl} />
        <div className="space-y-3 min-w-0">
          <p className="text-sm font-semibold text-ink">1. Scan the QR code with your authenticator app</p>
          <p className="text-xs text-muted">Can&apos;t scan it? Enter this key manually (time-based, 6 digits):</p>
          <CopyableSecret value={setupData.secret} />
        </div>
      </div>

      {setupData.recoveryCodes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">2. Save your recovery codes</p>
          <p className="text-xs text-muted">
            Each code works once if you lose your phone. They are shown only now and cannot be retrieved again — store them somewhere safe.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-ink bg-cream p-3 rounded-xl border border-line">
            {setupData.recoveryCodes.map((rc) => (
              <span key={rc} className="tracking-wider">
                {rc}
              </span>
            ))}
          </div>
          <CopyAllButton text={setupData.recoveryCodes.join('\n')} />
        </div>
      )}

      <Field label={`${step}. Enter the 6-digit code from your app`} htmlFor="twofa-code" required>
        <TextInput
          id="twofa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="max-w-[180px] font-mono tracking-[0.3em]"
        />
      </Field>
      <div className="flex gap-2">
        <UiButton type="submit" size="sm" loading={isConfirming} disabled={code.length !== 6}>
          Confirm &amp; enable
        </UiButton>
        <UiButton variant="secondary" size="sm" onClick={reset}>
          Cancel
        </UiButton>
      </div>
    </form>
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

/** Renders the otpauth:// URI as a QR code, generated locally — the secret never leaves the browser. */
function OtpQrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc(null);
      });
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className="w-[200px] h-[200px] rounded-xl border border-line bg-white p-2 flex items-center justify-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL generated in the browser
        <img src={src} alt="QR code for your authenticator app" width={184} height={184} />
      ) : (
        <LoadingState label="" className="py-0" />
      )}
    </div>
  );
}

function CopyableSecret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const grouped = value.replace(/(.{4})/g, '$1 ').trim();
  return (
    <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-line font-mono text-sm text-ink justify-between">
      <span className="break-all tracking-wider">{grouped}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="p-1 hover:bg-sand rounded text-muted hover:text-ink cursor-pointer shrink-0"
        aria-label="Copy secret key"
      >
        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function CopyAllButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <UiButton
      variant="secondary"
      size="sm"
      icon={<Copy className="w-3.5 h-3.5" />}
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success('Recovery codes copied.');
      }}
    >
      Copy codes
    </UiButton>
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
