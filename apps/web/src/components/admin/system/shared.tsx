'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal, UiButton } from '@/components/ui/primitives';
import { useAuth } from '@/hooks';
import { Role } from '@/lib/types';

/** Role flags for gating admin actions (the API still enforces every rule). */
export function useAdminRoles() {
  const { currentUser } = useAuth();
  const roles = currentUser?.roles ?? [];
  const isSuperAdmin = roles.includes(Role.SUPER_ADMIN);
  const isAdmin = isSuperAdmin || roles.includes(Role.ADMIN);
  return { isAdmin, isSuperAdmin, roles };
}

/**
 * Confirmation step for destructive or financial actions. The confirm button shows the
 * pending state; the dialog stays open until the caller closes it on settle.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  tone = 'danger',
  pending = false,
  onConfirm,
  onClose,
  confirmDisabled = false,
}: {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={pending} autoFocus>
            Cancel
          </UiButton>
          <UiButton
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={pending}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </UiButton>
        </>
      }
    >
      {children ?? <p className="text-sm text-ink-2">This action cannot be undone.</p>}
    </Modal>
  );
}

/** Monospace id with a copy-to-clipboard button. */
export function CopyId({ value, label = 'ID' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the id is still selectable */
    }
  };
  return (
    <span className="inline-flex items-center gap-1 max-w-full">
      <code className="font-mono text-[11px] text-ink-2 break-all select-all">{value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className="p-1 rounded-md text-muted hover:text-ink hover:bg-sand cursor-pointer shrink-0"
      >
        {copied ? <Check className="w-3 h-3" aria-hidden /> : <Copy className="w-3 h-3" aria-hidden />}
      </button>
    </span>
  );
}

/** Pretty-printed JSON for audit diffs and metadata. */
export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-muted">{label}: none</p>;
  }
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{label}</p>
      <pre className="text-[11px] leading-relaxed bg-cream border border-line rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Simple previous/next pager. */
export function Pager({
  page,
  totalPages,
  onChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4">
      <UiButton size="sm" variant="secondary" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </UiButton>
      <span className="text-xs text-muted" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <UiButton size="sm" variant="secondary" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </UiButton>
    </nav>
  );
}
