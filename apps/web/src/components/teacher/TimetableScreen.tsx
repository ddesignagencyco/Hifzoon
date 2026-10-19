'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Video } from 'lucide-react';
import {
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  UiButton,
} from '@/components/ui/primitives';
import { useTeacherTimetable } from '@/hooks/useTeacherSchedule';
import { classStudentNames, TimetableClass } from '@/lib/api/modules/teacher-schedule';
import { joinWindow } from '@/lib/api/modules/classroom';
import { cn } from '@/lib/utils';
import { ClassDetailModal } from './ClassDetailModal';
import { classroomHref } from './ClassListItem';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import {
  addDays,
  deviceTimeZone,
  formatPlainDate,
  plainDateInZone,
  startOfWeek,
  timeInZone,
  zonedTimeToUtc,
} from './zoned-time';

/** `/teacher/timetable` — week summary, week calendar (agenda on phones) and class details. */
export function TimetableScreen() {
  return (
    <>
      <PageHeader title="Timetable" description="Your week at a glance. Open a class for its brief, the classroom, or to cancel or move it." />
      <TeacherIdentityGate what="your timetable">
        {({ teacherId, zone }) => <WeekView teacherId={teacherId} profileZone={zone} />}
      </TeacherIdentityGate>
    </>
  );
}

/** Left accent by class type; trials stand out because they decide a new family. */
const TYPE_ACCENT: Record<string, string> = {
  TRIAL: 'border-l-gold',
  REGULAR: 'border-l-green-700',
  MAKEUP: 'border-l-green-600',
  CIRCLE: 'border-l-green-900',
  EXAM: 'border-l-ink',
};

const TYPE_LABEL: Record<string, string> = { TRIAL: 'Trial', MAKEUP: 'Make-up', CIRCLE: 'Circle', EXAM: 'Exam' };

function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "in 5 min", "in 2 h 10 min", "now". */
export function relativeStart(startsAt: string, endsAt: string, now: number): string {
  const start = new Date(startsAt).getTime();
  if (now >= start && now <= new Date(endsAt).getTime()) return 'now';
  const minutes = Math.round((start - now) / 60_000);
  if (minutes < 60 * 24) return `in ${formatDuration(Math.max(1, minutes))}`;
  const days = Math.round(minutes / (60 * 24));
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function WeekView({ teacherId, profileZone }: { teacherId: string; profileZone: string }) {
  const [device] = useState(() => deviceTimeZone());
  const [zone, setZone] = useState(profileZone);
  const [today] = useState(() => plainDateInZone(new Date(), profileZone));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selected, setSelected] = useState<TimetableClass | null>(null);
  // Ticks so "Join", "Live" and the countdown update without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const range = useMemo(
    () => ({
      from: zonedTimeToUtc(weekStart, '00:00', zone).toISOString(),
      to: zonedTimeToUtc(addDays(weekStart, 7), '00:00', zone).toISOString(),
      tz: zone,
    }),
    [weekStart, zone],
  );
  const timetable = useTeacherTimetable(teacherId, range);
  const classes = useMemo(
    () => [...(timetable.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [timetable.data],
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = useMemo(() => {
    const map = new Map<string, TimetableClass[]>();
    for (const c of classes) {
      const key = plainDateInZone(new Date(c.startsAt), zone);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [classes, zone]);

  const zones = [...new Set([profileZone, device])];
  const isThisWeek = weekStart === startOfWeek(today);
  const weekLabel = `${formatPlainDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatPlainDate(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const totalMinutes = classes.reduce((sum, c) => sum + minutesBetween(c.startsAt, c.endsAt), 0);
  const trials = classes.filter((c) => c.type === 'TRIAL').length;
  const next = classes.find(
    (c) => (c.status === 'SCHEDULED' || c.status === 'LIVE') && new Date(c.endsAt).getTime() >= now,
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UiButton variant="secondary" size="sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronLeft className="w-4 h-4" aria-hidden />} />
            <div className="min-w-[11.5rem] text-center">
              <p className="text-sm font-semibold text-ink" aria-live="polite">{weekLabel}</p>
              <p className="text-[11px] text-muted">{isThisWeek ? 'This week' : 'Viewing another week'}</p>
            </div>
            <UiButton variant="secondary" size="sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronRight className="w-4 h-4" aria-hidden />} />
            {!isThisWeek && (
              <UiButton variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(today))}>
                Back to this week
              </UiButton>
            )}
          </div>
          {zones.length > 1 ? (
            <Field label="Show times in" htmlFor="tt-zone" className="w-full sm:w-60">
              <Select id="tt-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value={profileZone}>{profileZone} (profile)</option>
                <option value={device}>{device} (this device)</option>
              </Select>
            </Field>
          ) : (
            <p className="text-xs text-muted flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" aria-hidden /> Times in {zone}
            </p>
          )}
        </div>
      </Card>

      {timetable.isLoading ? (
        <Card><LoadingState label="Loading your week…" /></Card>
      ) : timetable.isError ? (
        <Card><ErrorState error={timetable.error} onRetry={() => timetable.refetch()} /></Card>
      ) : (
        <>
          {/* Week summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryTile label="Classes" value={String(classes.length)} hint={trials > 0 ? `${trials} trial${trials === 1 ? '' : 's'}` : 'No trials'} />
            <SummaryTile label="Teaching time" value={totalMinutes > 0 ? formatDuration(totalMinutes) : '—'} hint="Scheduled this week" />
            <div className="col-span-2 sm:col-span-1">
              <NextClassTile next={next} zone={zone} now={now} onOpen={setSelected} />
            </div>
          </div>

          {classes.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CalendarDays className="w-5 h-5" aria-hidden />}
                title="No classes this week"
                description="Cancelled classes are not shown. Use the arrows to look at other weeks, or keep your availability up to date so families can book you."
              />
            </Card>
          ) : (
            <>
              {/* Desktop: 7-day calendar */}
              <div className="hidden lg:grid grid-cols-7 gap-2.5">
                {days.map((day) => (
                  <DayColumn key={day} day={day} isToday={day === today} list={byDay.get(day) ?? []} zone={zone} now={now} onOpen={setSelected} />
                ))}
              </div>

              {/* Phones & tablets: agenda of days that have classes */}
              <div className="lg:hidden space-y-4">
                {days
                  .filter((day) => (byDay.get(day) ?? []).length > 0)
                  .map((day) => (
                    <section key={day} aria-label={formatPlainDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}>
                      <h2 className={cn('text-xs font-semibold uppercase tracking-wide font-sans mb-2', day === today ? 'text-gold-600' : 'text-muted')}>
                        {formatPlainDate(day, { weekday: 'long', day: 'numeric', month: 'short' })}
                        {day === today && ' · Today'}
                      </h2>
                      <ul className="space-y-2">
                        {(byDay.get(day) ?? []).map((c) => (
                          <li key={c.id}>
                            <ClassCard cls={c} zone={zone} now={now} onOpen={setSelected} roomy />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
              </div>

              <Legend />
            </>
          )}
        </>
      )}

      {selected && <ClassDetailModal key={selected.id} cls={selected} zone={zone} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</p>
      <p className="text-xs text-muted mt-0.5">{hint}</p>
    </Card>
  );
}

function NextClassTile({
  next,
  zone,
  now,
  onOpen,
}: {
  next: TimetableClass | undefined;
  zone: string;
  now: number;
  onOpen: (c: TimetableClass) => void;
}) {
  if (!next) {
    return <SummaryTile label="Next class" value="—" hint="Nothing else scheduled this week" />;
  }
  const open = joinWindow(next.startsAt, next.endsAt, now) === 'open';
  return (
    <Card className={cn('p-4', open && 'border-gold ring-1 ring-gold/40')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Next class</p>
      <button type="button" onClick={() => onOpen(next)} className="mt-1 text-left cursor-pointer group">
        <span className="block text-lg font-semibold text-ink group-hover:underline underline-offset-4">
          {timeInZone(next.startsAt, zone)} · {classStudentNames(next) || 'No students'}
        </span>
        <span className="block text-xs text-muted">
          {next.course?.name ?? TYPE_LABEL[next.type] ?? 'Class'} · {relativeStart(next.startsAt, next.endsAt, now)}
        </span>
      </button>
      {open && (
        <div className="mt-2.5">
          <Link
            href={classroomHref(next.id)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-gold text-green-950 text-xs font-semibold hover:bg-gold-600 hover:text-white"
          >
            <Video className="w-3.5 h-3.5" aria-hidden /> Open classroom
          </Link>
        </div>
      )}
    </Card>
  );
}

function DayColumn({
  day,
  isToday,
  list,
  zone,
  now,
  onOpen,
}: {
  day: string;
  isToday: boolean;
  list: TimetableClass[];
  zone: string;
  now: number;
  onOpen: (c: TimetableClass) => void;
}) {
  const [, , dd] = day.split('-');
  return (
    <section
      aria-label={formatPlainDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
      className={cn(
        'rounded-2xl border p-2.5 min-h-[9rem] flex flex-col',
        isToday ? 'border-gold bg-gold-100/40' : 'border-line bg-white',
      )}
    >
      <header className="flex items-center justify-between mb-2 px-0.5">
        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isToday ? 'text-gold-600' : 'text-muted')}>
          {formatPlainDate(day, { weekday: 'short' })}
        </span>
        <span
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums',
            isToday ? 'bg-gold text-green-950' : 'text-ink',
          )}
          aria-hidden
        >
          {Number(dd)}
        </span>
      </header>
      {list.length === 0 ? (
        <p className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-line/80 text-[11px] text-muted/70">
          Free
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <ClassCard cls={c} zone={zone} now={now} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusChip({ cls, now }: { cls: TimetableClass; now: number }) {
  const live = cls.status === 'LIVE' || (cls.status === 'SCHEDULED' && joinWindow(cls.startsAt, cls.endsAt, now) === 'open' && now >= new Date(cls.startsAt).getTime());
  if (live) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-800">
        <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" aria-hidden /> Live
      </span>
    );
  }
  if (cls.status === 'COMPLETED') return <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Done</span>;
  if (cls.status !== 'SCHEDULED') return <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{cls.status.replace(/_/g, ' ').toLowerCase()}</span>;
  return null;
}

function ClassCard({
  cls,
  zone,
  now,
  onOpen,
  roomy = false,
}: {
  cls: TimetableClass;
  zone: string;
  now: number;
  onOpen: (c: TimetableClass) => void;
  roomy?: boolean;
}) {
  const canJoin = (cls.status === 'SCHEDULED' || cls.status === 'LIVE') && joinWindow(cls.startsAt, cls.endsAt, now) === 'open';
  const typeLabel = TYPE_LABEL[cls.type];
  return (
    <div
      className={cn(
        'rounded-xl border border-line border-l-4 bg-white shadow-sm hover:shadow-card transition-shadow',
        TYPE_ACCENT[cls.type] ?? 'border-l-line',
        cls.status === 'COMPLETED' && 'opacity-70',
        canJoin && 'ring-1 ring-gold/50',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(cls)}
        className={cn(
          'w-full text-left cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
          roomy ? 'px-3.5 py-3' : 'px-2.5 py-2',
        )}
        aria-label={`${timeInZone(cls.startsAt, zone)} ${classStudentNames(cls) || 'class'} — open details`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink tabular-nums whitespace-nowrap">
            {timeInZone(cls.startsAt, zone)}
            {roomy && <span className="text-muted font-normal"> · {formatDuration(minutesBetween(cls.startsAt, cls.endsAt))}</span>}
          </span>
          <StatusChip cls={cls} now={now} />
        </span>
        <span className={cn('block font-medium text-ink truncate mt-0.5', roomy ? 'text-sm' : 'text-xs')}>
          {classStudentNames(cls) || 'No students'}
        </span>
        <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
          {typeLabel && (
            <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', cls.type === 'TRIAL' ? 'bg-gold-100 text-gold-600' : 'bg-sand text-ink-2')}>
              {typeLabel}
            </span>
          )}
          <span className="text-[11px] text-muted truncate">{cls.course?.name ?? (typeLabel ? '' : 'Class')}</span>
        </span>
      </button>
      {canJoin && (
        <div className={cn('pb-2', roomy ? 'px-3.5' : 'px-2.5')}>
          <Link
            href={classroomHref(cls.id)}
            className="flex items-center justify-center gap-1.5 h-7 rounded-full bg-gold text-green-950 text-[11px] font-semibold hover:bg-gold-600 hover:text-white"
          >
            <Video className="w-3.5 h-3.5" aria-hidden /> Join
          </Link>
        </div>
      )}
    </div>
  );
}

function Legend() {
  const item = (swatch: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-1 h-3.5 rounded-full', swatch)} aria-hidden />
      {label}
    </span>
  );
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
      {item('bg-gold', 'Trial')}
      {item('bg-green-700', 'Regular')}
      {item('bg-green-600', 'Make-up')}
      <span className="inline-flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-600" aria-hidden /> Live now — the classroom opens 10 minutes before start
      </span>
    </p>
  );
}
