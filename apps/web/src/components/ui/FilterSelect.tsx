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
