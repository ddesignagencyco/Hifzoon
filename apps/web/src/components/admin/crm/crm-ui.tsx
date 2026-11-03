'use client';

import React from 'react';
import { Mail, Phone } from 'lucide-react';
import { humanize } from '@/components/ui/primitives';
import { LEAD_SOURCES, LEAD_STAGE_LABEL, LeadStatus, TaskType } from '@/lib/api/modules/crm';
import { cn } from '@/lib/utils';

/** Names, colours and small pieces shared by the CRM workspace and the lead detail page. */

/** How each pipeline stage is named and coloured everywhere in the CRM. */
export const STAGE: Record<LeadStatus, { label: string; hint: string; dot: string; bar: string; soft: string }> = {
  NEW: { label: LEAD_STAGE_LABEL.NEW, hint: 'Not contacted about a trial yet', dot: 'bg-gold', bar: 'bg-gold', soft: 'bg-gold/10' },
  TRIAL_BOOKED: { label: LEAD_STAGE_LABEL.TRIAL_BOOKED, hint: 'Evaluation class is scheduled', dot: 'bg-amber-500', bar: 'bg-amber-500', soft: 'bg-amber-50' },
  TRIAL_DONE: { label: LEAD_STAGE_LABEL.TRIAL_DONE, hint: 'Waiting for the family to decide', dot: 'bg-sky-500', bar: 'bg-sky-500', soft: 'bg-sky-50' },
  WON: { label: LEAD_STAGE_LABEL.WON, hint: 'Became a paying family', dot: 'bg-green-700', bar: 'bg-green-700', soft: 'bg-green-50' },
  LOST: { label: LEAD_STAGE_LABEL.LOST, hint: 'Closed without enrolling', dot: 'bg-red', bar: 'bg-red/70', soft: 'bg-red/5' },
};

export const TASK_LABEL: Record<TaskType, string> = {
  NO_SHOW_FOLLOWUP: 'Missed trial — call the family',
  TRIAL_NOT_CONVERTED: 'Trial not converted — follow up',
  OTHER: 'Follow-up',
};

/** A task's title: the specific follow-ups have fixed names; a general one shows its note. */
export const taskTitle = (t: { type: TaskType; note: string | null }) => (t.type === 'OTHER' && t.note ? t.note : TASK_LABEL[t.type] ?? humanize(t.type));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const sourceLabel = (value: string) => LEAD_SOURCES.find((x) => x.value === value)?.label ?? humanize(value);

export function StageDot({ status, withLabel = true }: { status: LeadStatus; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-2">
      <span className={cn('h-2 w-2 rounded-full', STAGE[status].dot)} aria-hidden />
      {withLabel && STAGE[status].label}
    </span>
  );
}

export function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-green-800 ring-1 ring-green-800/10', className)}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** "Overdue 2 days", "Due today", "Due in 3 days" — relative to `now`. */
export function dueLabel(dueAt: string, now: number): { text: string; overdue: boolean; today: boolean } {
  const day = 86_400_000;
  const start = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((start(new Date(dueAt).getTime()) - start(now)) / day);
  if (new Date(dueAt).getTime() < now && diff < 0) return { text: `Overdue ${-diff} day${diff === -1 ? '' : 's'}`, overdue: true, today: false };
  if (diff <= 0) return { text: new Date(dueAt).getTime() < now ? 'Overdue today' : 'Due today', overdue: new Date(dueAt).getTime() < now, today: true };
  if (diff === 1) return { text: 'Due tomorrow', overdue: false, today: false };
  return { text: `Due in ${diff} days`, overdue: false, today: false };
}

export function ContactLinks({ email, phone }: { email: string | null; phone: string | null }) {
  if (!email && !phone) return <span className="text-[11px] text-muted">No contact details</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      {phone && (
        <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-ink-2 hover:text-green-800">
          <Phone className="h-3 w-3" aria-hidden /> {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()} className="inline-flex min-w-0 items-center gap-1 text-ink-2 hover:text-green-800">
          <Mail className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{email}</span>
        </a>
      )}
    </span>
  );
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

