'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Select } from './select';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * A labelled filter dropdown — the one control every list uses to narrow what it shows,
 * in place of rows of pills. Put several in a `FilterBar` so they line up.
 */
export function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: T;
  options: Array<FilterOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('w-full sm:w-52', className)}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} searchable={options.length > 8}>
        {options.map((o) => (
          <option key={o.value} value={o.value} data-description={o.description}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** A row of filters, aligned on their bottom edge and wrapping on small screens. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="group" aria-label="Filters" className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
    </div>
  );
}

/** Value of the "All …" choice every filter starts on. */
export const ALL = 'ALL';

/**
 * Filter choices built from the rows actually loaded, so a choice never matches nothing:
 * the "All …" default first, then each distinct value sorted by label.
 */
export function optionsFrom<R>(
  rows: readonly R[],
  pick: (row: R) => { value: string; label: string } | null | undefined,
  allLabel: string,
): Array<FilterOption<string>> {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const o = pick(row);
    if (o && o.value && !seen.has(o.value)) seen.set(o.value, o.label);
  }
  return [
    { value: ALL, label: allLabel },
    ...[...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

/** A labelled text search that sits in a `FilterBar` beside the dropdowns. */
export function FilterSearch({
  id,
  label = 'Search',
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('w-full sm:w-60', className)}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-gold/40"
      />
    </div>
  );
}

/** True when `query` is empty or every word of it appears in one of `fields` (case ignored). */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}
