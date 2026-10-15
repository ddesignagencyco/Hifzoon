'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Modal, UiButton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** Confirmation dialog for consequential actions (locking accounts, replacing roles, closing leads). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <UiButton variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </UiButton>
          <UiButton variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </UiButton>
        </>
      }
    >
      {children ?? <p className="text-sm text-ink-2">This action is recorded in the audit log.</p>}
    </Modal>
  );
}

/** Right-hand side panel (full screen on phones). Escape and the backdrop close it. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-green-950/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative h-full w-full sm:max-w-lg bg-white border-l border-line shadow-large flex flex-col focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg text-ink truncate">
              {title}
            </h2>
            {description && <p className="text-xs text-muted mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1 rounded-lg text-muted hover:bg-sand cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">{children}</div>
      </div>
    </div>
  );
}

/** Copies a value to the clipboard with visible confirmation. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <UiButton
      size="sm"
      variant="secondary"
      onClick={copy}
      icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      aria-live="polite"
    >
      {copied ? 'Copied' : label}
    </UiButton>
  );
}

/** Small key/value list for detail panels. */
export function DetailList({ items, className }: { items: Array<[string, React.ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(0,140px)_1fr] gap-x-3 gap-y-2 text-sm', className)}>
      {items.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-xs font-semibold text-muted pt-0.5">{label}</dt>
          <dd className="text-ink-2 min-w-0 break-words">{value ?? '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Monospace id with a trailing copy affordance. */
export function IdText({ id }: { id: string }) {
  return <code className="text-[11px] text-muted break-all">{id}</code>;
}

/** Local date-time input value (`YYYY-MM-DDTHH:mm`) for a Date. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local date value (`YYYY-MM-DD`) for a Date. */
export function toLocalDateValue(date: Date): string {
  return toLocalInputValue(date).slice(0, 10);
}
