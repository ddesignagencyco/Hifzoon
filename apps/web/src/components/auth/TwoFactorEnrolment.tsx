'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import { Field, LoadingState, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useTwoFactor } from '@/hooks';

/**
 * TOTP enrolment (FR-AUTH-01): password → QR code + manual key + recovery codes → first code.
 * Used on Account security and on the post-sign-in `/auth/two-factor/setup` step that
 * unenrolled staff must finish before their session is unrestricted (backend M42).
 */
type SetupData = { otpauthUrl: string; secret: string; recoveryCodes: string[] };

export function EnrolTwoFactor({
  startOpen = false,
  onEnabled,
  onCancel,
}: {
  /** Skip the "Set up" button and ask for the password straight away. */
  startOpen?: boolean;
  onEnabled?: () => void;
  /** Shown as Cancel when given; otherwise Cancel just closes the form. */
  onCancel?: () => void;
} = {}) {
  const toast = useToast();
  const { setup, confirm: confirmTwoFactor, isSettingUp, isConfirming } = useTwoFactor();
  const [open, setOpen] = useState(startOpen);
  const [password, setPassword] = useState('');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');

  const reset = () => {
    setOpen(startOpen);
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
      onEnabled?.();
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
          <UiButton variant="secondary" size="sm" onClick={onCancel ?? reset}>
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
        <UiButton variant="secondary" size="sm" onClick={onCancel ?? reset}>
          Cancel
        </UiButton>
      </div>
    </form>
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
