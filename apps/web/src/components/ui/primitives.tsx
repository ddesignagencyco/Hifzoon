'use client';

import React from 'react';
import { AlertTriangle, Inbox, Loader2, Lock, RefreshCw, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, getErrorMessage } from '@/lib/api/http';
import { useToast } from '@/components/ui/toast';

// ── Button ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-green-800 text-white hover:bg-green-700 border border-green-800',
  secondary: 'bg-white text-ink border border-line hover:bg-sand',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-sand',
  danger: 'bg-red text-white border border-red hover:opacity-90',
  gold: 'bg-gold text-green-950 border border-gold hover:bg-gold-600 hover:text-white',
};

export interface UiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function UiButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: UiButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-5 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-white rounded-2xl border border-line shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-ink font-sans">{title}</h3>
        {description && <p className="text-xs text-muted mt-1">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}

// ── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-600 mb-1">{eyebrow}</p>
        )}
        <h1 className="text-2xl sm:text-3xl text-ink">{title}</h1>
        {description && <p className="text-sm text-muted mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export type BadgeTone = 'neutral' | 'green' | 'gold' | 'amber' | 'red' | 'blue';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sand text-ink-2 border-line',
  green: 'bg-green-50 text-green-700 border-green-600/20',
  gold: 'bg-gold-100 text-gold-600 border-gold/30',
  amber: 'bg-amber/10 text-amber border-amber/25',
  red: 'bg-red/10 text-red border-red/25',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps common backend status enums to a badge tone. */
export function statusTone(status: string | null | undefined): BadgeTone {
  const s = (status ?? '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'PAID', 'GRANTED', 'COMPLETED', 'CLOSED', 'PASS', 'PRESENT', 'WON', 'DONE', 'VERIFIED', 'CLEARED', 'LIVE', 'RESOLVED', 'DELIVERED', 'READ'].includes(s)) return 'green';
  if (['PENDING', 'SCHEDULED', 'OPEN', 'SUBMITTED', 'TRIAL', 'DRAFT', 'NEW', 'IN_PROGRESS', 'UNDER_REVIEW', 'CONTACTED', 'TRIAL_BOOKED', 'QUEUED', 'SENT'].includes(s)) return 'gold';
  if (['PAUSED', 'LATE', 'PAST_DUE', 'WARNING', 'ESCALATED', 'INVESTIGATING', 'RESCHEDULED'].includes(s)) return 'amber';
  if (['CANCELLED', 'REJECTED', 'FAILED', 'WITHDRAWN', 'ABSENT', 'LOST', 'DISABLED', 'LOCKED', 'NO_SHOW', 'FAIL', 'OVERDUE', 'BREACHED'].includes(s)) return 'red';
  // Class cancellations carry who cancelled: CANCELLED_FAMILY / CANCELLED_TEACHER.
  if (s.startsWith('CANCELLED_')) return 'red';
  return 'neutral';
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <Badge tone={statusTone(status)}>{humanize(status)}</Badge>;
}

// ── States: loading / error / empty ──────────────────────────────────────────

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted', className)}>
      <Loader2 className="w-4 h-4 animate-spin text-gold" aria-hidden />
      {label}
    </div>
  );
}

/**
 * Failed data load: the error message goes to a toast (site-wide convention); the
 * section itself keeps only a compact retry so it is never silently blank.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this section',
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  const toast = useToast();
  const message = getErrorMessage(error);
  const status = error instanceof ApiClientError ? error.status : undefined;
  // 403 (incl. NOT_RESOURCE_OWNER) and 404 are answers, not failures: retrying won't change them.
  const forbidden = status === 403;
  const missing = status === 404;

  React.useEffect(() => {
    if (!forbidden && !missing) toast.error(message);
  }, [message, toast, forbidden, missing]);

  if (forbidden || missing) {
    const Icon = forbidden ? Lock : SearchX;
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-8 px-4 text-center', className)} role="status">
        <Icon className="w-5 h-5 text-muted" aria-hidden />
        <p className="text-sm font-medium text-ink">{forbidden ? 'You don’t have access to this' : 'Not found'}</p>
        <p className="text-xs text-muted max-w-sm">
          {forbidden
            ? 'It belongs to another family, class or teacher. If you think this is wrong, contact the academy.'
            : 'It may have been removed, or the link is out of date.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-3 py-8 px-4 text-center', className)}>
      <AlertTriangle className="w-4 h-4 text-red shrink-0" aria-hidden />
      <p className="text-sm text-muted">{title}</p>
      {onRetry && (
        <UiButton variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          Retry
        </UiButton>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center gap-3 py-10 px-4', className)}>
      <div className="w-10 h-10 rounded-xl bg-sand text-muted flex items-center justify-center">
        {icon ?? <Inbox className="w-5 h-5" aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="text-xs text-muted mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Renders loading / error / empty / content for a TanStack query in one place,
 * so every screen handles the three non-happy states consistently.
 */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  loadingLabel,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  empty?: React.ReactNode;
  isEmpty?: (data: T) => boolean;
  loadingLabel?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <LoadingState label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined || query.data === null) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  const looksEmpty = isEmpty ? isEmpty(query.data) : Array.isArray(query.data) && query.data.length === 0;
  if (looksEmpty) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(query.data)}</>;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="text-gold-600">{icon}</span>}
      </div>
      <p className="text-2xl font-semibold text-ink mt-2 font-sans tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </Card>
  );
}

// ── Form fields ───────────────────────────────────────────────────────────────

const CONTROL =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold disabled:bg-sand disabled:cursor-not-allowed';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  // Errors are announced by toast (site-wide convention); the field itself is only
  // outlined in red, with the message kept for screen readers.
  return (
    <div
      data-invalid={error ? 'true' : undefined}
      className={cn(
        'group/field space-y-1.5',
        error && '[&_input]:border-red [&_select]:border-red [&_textarea]:border-red',
        className,
      )}
    >
      <label htmlFor={htmlFor} className={cn('block text-xs font-semibold', error ? 'text-red' : 'text-ink-2')}>
        {label}
        {required && <span className="text-red ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <p className="sr-only">{error}</p> : hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-10', className)} {...rest} />;
  },
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'resize-y', className)} {...rest} />;
  },
);

/** React select (react-select) used site-wide; drop-in for `<select>` — see components/ui/select.tsx. */
export { Select, type SelectProps, type SelectOption } from './select';

export function Checkbox({
  id,
  label,
  checked,
  onChange,
  description,
  disabled,
}: {
  id: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className={cn('flex items-start gap-3 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-line accent-green-800"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="No records" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((col) => (
              <th key={col.key} scope="col" className={cn('px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-b border-line/60 last:border-0', onRowClick && 'cursor-pointer hover:bg-cream')}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 align-top text-ink-2', col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap gap-1 rounded-full bg-sand p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer',
            value === tab.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-green-950/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full bg-white rounded-t-2xl sm:rounded-2xl border border-line shadow-large max-h-[90vh] flex flex-col',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
          <div>
            <h2 className="text-lg text-ink">{title}</h2>
            {description && <p className="text-xs text-muted mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-muted hover:bg-sand cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ── Inline alert ──────────────────────────────────────────────────────────────

export function Alert({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-sand border-line text-ink-2',
    success: 'bg-green-50 border-green-600/25 text-green-800',
    warning: 'bg-amber/10 border-amber/30 text-amber',
    error: 'bg-red/10 border-red/30 text-red',
  } as const;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-0.5', 'text-xs leading-relaxed')}>{children}</div>}
    </div>
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** `TRIAL_BOOKED` → `Trial booked`. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

/** Formats integer minor units (pence/cents) in the given currency. Whole amounts omit decimal .00. */
export function formatMoney(amountMinor: number | string | null | undefined, currency = 'USD'): string {
  if (amountMinor === null || amountMinor === undefined || amountMinor === '') return '—';
  const minor = typeof amountMinor === 'string' ? Number(amountMinor) : amountMinor;
  if (!Number.isFinite(minor)) return '—';
  const isWhole = minor % 100 === 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return isWhole ? `${minor / 100} ${currency}` : `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

// ── Country, Phone, Currency & Timezone Selectors ─────────────────────────────
export { CountrySelect } from './CountrySelect';
export type { CountrySelectProps } from './CountrySelect';
export { PhoneInput } from './PhoneInput';
export type { PhoneInputProps } from './PhoneInput';
export { CurrencySelect } from './CurrencySelect';
export type { CurrencySelectProps } from './CurrencySelect';
export { TimezoneSelect } from './TimezoneSelect';
export type { TimezoneSelectProps } from './TimezoneSelect';
