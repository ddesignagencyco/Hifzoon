'use client';

import React, { useEffect, useState } from 'react';
import { Eye, MicOff, Radio, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { humanize } from '@/components/ui/primitives';
import { participantRoleLabel, type ParticipantRole } from '@/lib/api/modules/classroom';

/*
 * Presentation for the live classroom in "meeting mode", modelled on the homepage demo
 * (components/home/classroom-demo). Everything here is status display; the data and
 * actions stay in ClassroomRoom.
 */

// ── Class phase & clock ────────────────────────────────────────────────────────

export type ClassPhase = 'upcoming' | 'live' | 'ended' | 'other';

/**
 * What the class is doing right now, from the snapshot. The API only marks a class LIVE
 * when the room is first opened after the start time (backend B36), so a SCHEDULED class
 * inside its start–end window is live too.
 */
export function classPhase(status: string, startsAt: string, endsAt: string, serverNow: number): ClassPhase {
  const started = serverNow >= new Date(startsAt).getTime();
  const ended = serverNow >= new Date(endsAt).getTime();
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return 'ended';
  if (s === 'LIVE') return 'live';
  if (s === 'SCHEDULED') return !started ? 'upcoming' : !ended ? 'live' : 'ended';
  return 'other';
}

/** `mm:ss`, or `h:mm:ss` from one hour. Negative durations read as 00:00. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** `hh:mm` in the viewer's timezone. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Server "now" that ticks every second between snapshots. It starts from the snapshot's
 * `serverTime` (so the device clock's skew does not matter) and only reads the local clock
 * inside the effect / interval, never during render.
 */
export function useServerClock(serverTime: string): number {
  const serverMs = new Date(serverTime).getTime();
  const [tick, setTick] = useState<{ base: number; now: number }>({ base: serverMs, now: serverMs });

  useEffect(() => {
    const receivedAt = Date.now();
    const id = setInterval(() => setTick({ base: serverMs, now: serverMs + (Date.now() - receivedAt) }), 1000);
    return () => clearInterval(id);
  }, [serverMs]);

  // A newer snapshot resets the base; until the first tick after it, use its time as is.
  return tick.base === serverMs ? tick.now : serverMs;
}

function LiveTimer({ startsAt, serverTime }: { startsAt: string; serverTime: string }) {
  const now = useServerClock(serverTime);
  const elapsed = formatElapsed(now - new Date(startsAt).getTime());
  return (
    <span className="font-mono tabular-nums" data-testid="class-timer">
      {elapsed}
    </span>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────

const PILL = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap';

export function StatusPill({
  phase,
  status,
  startsAt,
  serverTime,
}: {
  phase: ClassPhase;
  status: string;
  startsAt: string;
  serverTime: string;
}) {
  if (phase === 'live') {
    return (
      <span data-testid="class-status" data-phase="live" className={cn(PILL, 'border-red-400/30 bg-red-950/50 text-red-200')}>
        <span className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden />
        Live
        <span aria-hidden>·</span>
        <LiveTimer startsAt={startsAt} serverTime={serverTime} />
      </span>
    );
  }
  if (phase === 'upcoming') {
    return (
      <span data-testid="class-status" data-phase="upcoming" className={cn(PILL, 'border-gold/40 bg-gold/15 text-gold-100')}>
        <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
        Starts at {formatClock(startsAt)}
      </span>
    );
  }
  return (
    <span data-testid="class-status" data-phase={phase} className={cn(PILL, 'border-white/15 bg-white/10 text-white/85')}>
      {phase === 'ended' ? 'Ended' : humanize(status)}
    </span>
  );
}

export function SyncIndicator({ live, pollSeconds }: { live: boolean; pollSeconds: number }) {
  return (
    <span
      className={cn(PILL, live ? 'border-emerald-400/30 bg-emerald-950/40 text-emerald-200' : 'border-white/15 bg-white/5 text-white/75')}
    >
      <Radio className={cn('h-3 w-3', live && 'motion-safe:animate-pulse')} aria-hidden />
      {live ? 'Realtime connected' : `Syncing every ${pollSeconds}s`}
    </span>
  );
}

export function MeetingTopBar({
  title,
  subtitle,
  status,
  recording,
  participantCount,
  sync,
  actions,
}: {
  title: string;
  subtitle: string;
  status: React.ReactNode;
  recording: boolean;
  participantCount: number;
  sync: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-white/10 bg-green-950 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold font-fraunces text-base font-bold text-green-950"
          aria-hidden
        >
          H
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-white sm:text-lg">{title}</h1>
          <p className="truncate text-xs text-white/65">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Class status" role="group">
        {status}
        {recording && (
          <span data-testid="rec-pill" className={cn(PILL, 'border-red-400/40 bg-red-600/90 text-white')} title="This class is being recorded">
            <span className="h-2 w-2 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
            REC
            <span className="sr-only">— this class is being recorded</span>
          </span>
        )}
        <span className={cn(PILL, 'border-white/15 bg-white/5 text-white/85')}>
          <Users className="h-3 w-3" aria-hidden />
          {participantCount}
          <span className="sr-only">{participantCount === 1 ? 'person' : 'people'} in the room</span>
        </span>
        {sync}
        {actions}
      </div>
    </header>
  );
}

// ── Participant tiles ─────────────────────────────────────────────────────────

const TONES: Record<ParticipantRole, { bg: string; avatar: string }> = {
  TEACHER: { bg: 'from-[#1c4c3e] to-[#0f2c24]', avatar: 'bg-gold text-green-950' },
  STUDENT: { bg: 'from-[#5b4a33] to-[#2b241a]', avatar: 'bg-gold-100 text-[#5b4a33]' },
  GUARDIAN_VIEWER: { bg: 'from-[#34413d] to-[#1a2420]', avatar: 'bg-[#e6dfd1] text-[#3c4a45]' },
  SUPERVISOR: { bg: 'from-[#34413d] to-[#1a2420]', avatar: 'bg-[#e6dfd1] text-[#3c4a45]' },
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function RoleBadge({ role }: { role: ParticipantRole }) {
  if (role === 'TEACHER') {
    return (
      <span className="rounded-md bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-950">Host</span>
    );
  }
  if (role === 'GUARDIAN_VIEWER') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        <Eye className="h-3 w-3" aria-hidden />
        Watch-only
      </span>
    );
  }
  if (role === 'SUPERVISOR') {
    return (
      <span className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Supervisor</span>
    );
  }
  return null;
}

/**
 * One participant's video tile. Without a media server, remote tiles show initials only;
 * `video` replaces the avatar with the signed-in user's own camera preview.
 */
export function ParticipantTile({
  name,
  role,
  you = false,
  video,
  mic,
  overlay,
}: {
  name: string;
  role: ParticipantRole;
  you?: boolean;
  video?: React.ReactNode;
  /** Only shown when actually known (own mic, or a watch-only guardian who can't speak). */
  mic?: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const tone = TONES[role] ?? TONES.STUDENT;
  const label = `${name}${you ? ' (you)' : ''}, ${participantRoleLabel(role)}`;
  return (
    <li
      aria-label={label}
      data-testid="participant-tile"
      data-role={role}
      className={cn(
        'relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br ring-1',
        tone.bg,
        you ? 'ring-gold/70' : 'ring-white/10',
      )}
    >
      {video ?? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn('flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold sm:h-14 sm:w-14 sm:text-base', tone.avatar)}
            aria-hidden
          >
            {initialsOf(name)}
          </span>
        </div>
      )}
      {overlay}
      <div className="absolute left-2 top-2 flex gap-1">
        <RoleBadge role={role} />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-2 py-1">
        <span className="truncate text-xs text-white" aria-hidden>
          {name}
          {you && <span className="text-white/70"> (you)</span>}
        </span>
        {mic ??
          (role === 'GUARDIAN_VIEWER' ? (
            <MicOff className="h-3.5 w-3.5 shrink-0 text-white/60" aria-label="Cannot speak (watch-only)" />
          ) : null)}
      </div>
    </li>
  );
}

export function Filmstrip({ children, label = 'People on camera' }: { children: React.ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-3">
      {children}
    </ul>
  );
}

// ── Control bar ───────────────────────────────────────────────────────────────

export function ControlBar({ start, children }: { start?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">{start}</div>
      <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="Call controls">
        {children}
      </div>
    </div>
  );
}

type ControlTone = 'neutral' | 'off' | 'danger' | 'gold';

const CONTROL_TONES: Record<ControlTone, string> = {
  neutral: 'bg-white/10 text-white border-white/15 hover:bg-white/20',
  off: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-50',
  danger: 'bg-red text-white border-red hover:bg-[#9c3d26]',
  gold: 'bg-gold text-green-950 border-gold hover:bg-gold-100',
};

export function ControlButton({
  tone = 'neutral',
  icon,
  loading,
  children,
  className,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ControlTone; icon?: React.ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-green-950',
        'disabled:cursor-not-allowed disabled:opacity-50',
        CONTROL_TONES[tone],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Small disclosure chip for notes that matter but should not dominate the stage. */
export function InfoChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden />
        {label}
      </summary>
      <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(18rem,calc(100vw-3rem))] rounded-xl border border-white/10 bg-green-900 p-3 text-xs leading-relaxed text-white/85 shadow-xl">
        {children}
      </div>
    </details>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

export interface PanelTab<T extends string> {
  value: T;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

/**
 * Dark tab strip for the side panel. Panels stay mounted (hidden) so in-progress forms,
 * polling and recording state survive switching tabs.
 */
export function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
}: {
  tabs: PanelTab<T>[];
  value: T;
  onChange: (value: T) => void;
  idPrefix: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.value);
    document.getElementById(`${idPrefix}-tab-${next.value}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Classroom panels" className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-black/25 p-1">
      {tabs.map((tab, i) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${idPrefix}-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer sm:flex-row sm:justify-center sm:gap-1.5 sm:text-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
              selected ? 'bg-gold text-green-950' : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
          >
            <span aria-hidden>{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', selected ? 'bg-green-950/15' : 'bg-white/10')}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  value,
  active,
  children,
}: {
  idPrefix: string;
  value: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`${idPrefix}-panel-${value}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${value}`}
      hidden={!active}
      tabIndex={0}
      className="space-y-4 focus-visible:outline-none"
    >
      {children}
    </div>
  );
}

/** Heading for a block inside the dark side panel. */
export function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/65">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-white/60">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Light inset card inside the dark panel, for forms built on the light UI kit. */
export function LightSheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-xl bg-cream p-3 text-ink shadow-sm', className)}>{children}</div>;
}
