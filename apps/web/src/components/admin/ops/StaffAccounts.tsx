'use client';

import React, { useState } from 'react';
import { KeyRound, LogOut, Mail, ShieldOff } from 'lucide-react';
import { Checkbox, DataTable, EmptyState, Field, Modal, QueryState, TextInput, UiButton, formatDateTime, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAccountRecovery, useCreateStaff, useUserSessions } from '@/hooks/useOpsAdmin';
import { STAFF_INVITE_ROLES, StaffInviteRole } from '@/lib/api/modules/ops-admin';
import { ConfirmDialog } from '../shared/AdminUi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite a staff member: an emailed link sets their password; none is ever shown. */
export function InviteStaffModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const create = useCreateStaff();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<StaffInviteRole[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (name.trim().length < 2) next.name = 'Name must be at least 2 characters.';
    if (phone && (phone.length < 5 || phone.length > 32)) next.phone = 'Phone must be 5–32 characters.';
    if (roles.length === 0) next.roles = 'Choose at least one role.';
    setErrors(next);
    const first = Object.values(next)[0];
    if (first) return toast.error(first);
    create.mutate({ email: email.trim(), name: name.trim(), roles, ...(phone ? { phone } : {}) }, {
      onSuccess: (res) => {
        if (res.inviteEmailed) toast.success(`Invite sent to ${email.trim()}`);
        else toast.error('Account created, but the invite email failed. Open the account and use “Resend invite”.');
        onClose();
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Modal open onClose={() => (create.isPending ? undefined : onClose())} title="Invite staff" description="They receive a link (valid 7 days) to set their own password." size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Invite staff">
        <Field label="Name" htmlFor="staff-name" required error={errors.name}><TextInput id="staff-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Email" htmlFor="staff-email" required error={errors.email}><TextInput id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone" htmlFor="staff-phone" error={errors.phone}><TextInput id="staff-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-ink-2">Roles <span className="text-red">*</span></legend>
          {STAFF_INVITE_ROLES.map((r) => (
            <Checkbox key={r} id={`staff-role-${r}`} label={humanize(r)} checked={roles.includes(r)}
              onChange={(on) => setRoles((cur) => (on ? [...cur, r] : cur.filter((x) => x !== r)))} />
          ))}
          {errors.roles && <p className="sr-only">{errors.roles}</p>}
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</UiButton>
          <UiButton type="submit" loading={create.isPending}>Send invite</UiButton>
        </div>
      </form>
    </Modal>
  );
}

type Action = 'invite' | 'reset' | 'twofa' | 'sessions';

/** Recovery buttons and active sessions for one account (super admin). */
export function AccountRecovery({ userId, name, isSelf }: { userId: string; name: string; isSelf: boolean }) {
  const toast = useToast();
  const rec = useAccountRecovery(userId);
  const sessions = useUserSessions(userId);
  const [pending, setPending] = useState<Action | null>(null);

  const copy: Record<Action, { title: string; body: string; label: string; run: () => Promise<unknown>; ok: string }> = {
    invite: { title: `Resend invite to ${name}?`, body: 'A new link is emailed and the previous one stops working.', label: 'Resend invite', run: () => rec.resendInvite.mutateAsync(), ok: 'Invite sent' },
    reset: { title: `Send ${name} a password reset?`, body: 'They get a link (valid 60 minutes) and are signed out everywhere.', label: 'Send reset link', run: () => rec.passwordReset.mutateAsync(), ok: 'Reset link sent' },
    twofa: { title: `Reset ${name}'s two-factor sign-in?`, body: 'Their authenticator is removed, they are signed out, and must enrol again.', label: 'Reset 2FA', run: () => rec.resetTwoFactor.mutateAsync(), ok: 'Two-factor reset' },
    sessions: { title: `Sign ${name} out everywhere?`, body: 'Every active session ends immediately.', label: 'Sign out everywhere', run: () => rec.revokeSessions.mutateAsync(), ok: 'Sessions revoked' },
  };
  const busy = rec.resendInvite.isPending || rec.passwordReset.isPending || rec.resetTwoFactor.isPending || rec.revokeSessions.isPending;
  const current = pending ? copy[pending] : null;

  return (
    <section aria-labelledby="recovery-heading" className="space-y-3">
      <h3 id="recovery-heading" className="text-sm font-semibold text-ink font-sans">Recovery & sessions</h3>
      <p className="text-xs text-muted">No password is ever set or shown; the person always receives an emailed link.</p>
      <div className="flex flex-wrap gap-2">
        <UiButton size="sm" variant="secondary" icon={<Mail className="w-3.5 h-3.5" aria-hidden />} onClick={() => setPending('invite')}>Resend invite</UiButton>
        <UiButton size="sm" variant="secondary" icon={<KeyRound className="w-3.5 h-3.5" aria-hidden />} onClick={() => setPending('reset')}>Password reset</UiButton>
        <UiButton size="sm" variant="secondary" icon={<ShieldOff className="w-3.5 h-3.5" aria-hidden />} disabled={isSelf} onClick={() => setPending('twofa')}>Reset 2FA</UiButton>
        <UiButton size="sm" variant="secondary" icon={<LogOut className="w-3.5 h-3.5" aria-hidden />} onClick={() => setPending('sessions')}>Sign out everywhere</UiButton>
      </div>
      <QueryState query={sessions} empty={<EmptyState title="No active sessions" />}>
        {(rows) => (
          <DataTable paginate={false} rows={rows} rowKey={(s) => s.id}
            columns={[
              { key: 'a', header: 'Last active', render: (s) => (s.lastActiveAt ? formatDateTime(s.lastActiveAt) : '—') },
              { key: 'ip', header: 'IP', render: (s) => s.ip ?? '—' },
              { key: 'ua', header: 'Device', render: (s) => <span className="break-words">{s.userAgent ?? '—'}</span> },
            ]} />
        )}
      </QueryState>
      <ConfirmDialog
        open={current !== null}
        title={current?.title ?? ''}
        tone="primary"
        confirmLabel={current?.label ?? 'Confirm'}
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => current && current.run().then(
          () => { toast.success(current.ok); setPending(null); },
          (err) => { toast.error(err); setPending(null); },
        )}
      >
        <p className="text-sm text-ink-2">{current?.body}</p>
      </ConfirmDialog>
    </section>
  );
}
