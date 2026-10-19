'use client';

import React, { useId } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingState, ErrorState, Select } from '@/components/ui/primitives';
import { useActiveFamily } from '@/hooks/useFamily';
import { FamilySummary } from '@/lib/api/modules/families';

/** Formats a time range (`Mon 3 Nov, 16:00 – 16:30`) in an optional zone. */
export function formatClassTime(startsAt: string, endsAt?: string | null, timeZone?: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '—';
  const zone = timeZone ? { timeZone } : {};
  const day = start.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...zone });
  if (!endsAt) return day;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return day;
  return `${day} – ${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', ...zone })}`;
}

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'w-10 h-10 rounded-full bg-green-800 text-gold font-semibold flex items-center justify-center shrink-0',
        className,
      )}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

/** Keyboard-accessible 1–5 star picker (a radio group). */
export function StarRatingInput({
  value,
  onChange,
  label = 'Rating',
  error,
}: {
  value: number;
  onChange: (stars: number) => void;
  label?: string;
  error?: string;
}) {
  const name = useId();
  return (
    <fieldset aria-invalid={error ? true : undefined}>
      <legend className={cn('block text-xs font-semibold mb-1.5', error ? 'text-red' : 'text-ink-2')}>
        {label}
        <span className="text-red ml-0.5" aria-hidden>*</span>
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only peer"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
            />
            <Star
              aria-hidden
              className={cn(
                'w-7 h-7 rounded peer-focus-visible:ring-2 peer-focus-visible:ring-gold',
                n <= value ? 'fill-gold text-gold' : error ? 'text-red/50' : 'text-line',
              )}
            />
          </label>
        ))}
      </div>
      {error && <p className="sr-only">{error}</p>}
    </fieldset>
  );
}

export function StarsDisplay({ value, label }: { value: number; label?: string }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn('w-3.5 h-3.5', n <= rounded ? 'fill-gold text-gold' : 'text-line')} />
      ))}
    </span>
  );
}

/**
 * Loads the guardian's active family and hands it to `children`. When the guardian
 * has no family yet, renders `onNoFamily` (normally the onboarding walkthrough).
 */
export function WithActiveFamily({
  children,
  onNoFamily,
}: {
  children: (ctx: { family: FamilySummary; familyId: string; membership: FamilySummary['members'][number] | null }) => React.ReactNode;
  onNoFamily: React.ReactNode;
}) {
  const { families, family, membership } = useActiveFamily();
  if (families.isLoading) return <LoadingState label="Loading your family…" />;
  if (families.isError) return <ErrorState error={families.error} onRetry={() => families.refetch()} />;
  if (!family) return <>{onNoFamily}</>;
  return <>{children({ family, familyId: family.id, membership })}</>;
}

/** Family switcher, shown only when the guardian belongs to more than one family. */
export function FamilySwitcher() {
  const { families, familyId, select } = useActiveFamily();
  const list = families.data ?? [];
  if (list.length < 2) return null;
  return (
    <div className="w-full sm:w-56">
      <label htmlFor="family-switcher" className="sr-only">Family</label>
      <Select id="family-switcher" value={familyId ?? ''} onChange={(e) => select(e.target.value)}>
        {list.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </Select>
    </div>
  );
}

/** Definition-list row used across summary cards. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-line/60 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-ink text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}
