import React from 'react';
import { cn } from '@/lib/utils';
import type { CaseSeverity } from '@/lib/api/modules/cases';

const TONE: Record<CaseSeverity, string> = {
  CRITICAL: 'bg-red text-white',
  HIGH: 'bg-red/10 text-red ring-1 ring-red/30',
  MEDIUM: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300/60',
  LOW: 'bg-sand text-ink-2 ring-1 ring-line',
};

/** M28 — how serious a case is. */
export function CaseSeverityBadge({ severity }: { severity?: CaseSeverity | null }) {
  const s = severity ?? 'MEDIUM';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE[s])}>
      {s.charAt(0) + s.slice(1).toLowerCase()}
    </span>
  );
}
