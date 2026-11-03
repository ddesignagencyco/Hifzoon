'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { classOutcome } from '@/lib/api/modules/scheduling-family';
import { CalendarDays, Video } from 'lucide-react';
import {
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Pagination,
  TextInput,
} from '@/components/ui/primitives';
import { useTeacherTimetable } from '@/hooks/useTeacherSchedule';
import { classStudentNames, TimetableClass } from '@/lib/api/modules/teacher-schedule';
import { joinWindow } from '@/lib/api/modules/classroom';
import { cn } from '@/lib/utils';
import { ClassDetailModal } from './ClassDetailModal';
import { classroomHref } from './ClassListItem';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import { addDays, deviceTimeZone, plainDateInZone, startOfWeek, timeInZone, zonedTimeToUtc } from './zoned-time';

/** `/teacher/timetable` — a paginated list of your classes, with details, join, cancel, move. */
export function TimetableScreen() {
  return (
    <>
      <PageHeader title="Timetable" description="Your classes as a list. Open a class for its brief, the classroom, or to cancel or move it." />
      <TeacherIdentityGate what="your timetable">
        {({ teacherId, zone }) => <ClassList teacherId={teacherId} profileZone={zone} />}
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

type Range = 'upcoming' | 'past';
type DayFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'date';

function ClassList({ teacherId, profileZone }: { teacherId: string; profileZone: string }) {
  const [device] = useState(() => deviceTimeZone());
  const [zone, setZone] = useState(profileZone);
  const [range, setRange] = useState<Range>('upcoming');
  // "all" uses the Upcoming/Past window; the others load exactly that period.
  const [day, setDay] = useState<DayFilter>('all');
  const [picked, setPicked] = useState(() => plainDateInZone(new Date(), profileZone));
  const [student, setStudent] = useState('all');
  const [selected, setSelected] = useState<TimetableClass | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Ticks so "Join", "Live" and the countdown update without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setPage(1), [day, range, student, picked]);

  const span = useMemo(() => {
    const dayMs = 86_400_000;
    if (day === 'all') {
      // Round to the hour so the query key is stable across renders.
      const anchor = Math.floor(now / 3_600_000) * 3_600_000;
      return range === 'upcoming'
        ? { from: new Date(anchor - 3 * 3_600_000).toISOString(), to: new Date(anchor + 28 * dayMs).toISOString() }
        : { from: new Date(anchor - 30 * dayMs).toISOString(), to: new Date(anchor + 3_600_000).toISOString() };
    }
    const today = plainDateInZone(new Date(now), zone);
    const [first, count] =
      day === 'today'
        ? [today, 1]
        : day === 'tomorrow'
          ? [addDays(today, 1), 1]
          : day === 'week'
            ? [startOfWeek(today), 7]
            : [picked, 1];
    return {
      from: zonedTimeToUtc(first, '00:00', zone).toISOString(),
      to: zonedTimeToUtc(addDays(first, count), '00:00', zone).toISOString(),
    };
  }, [day, range, now, picked, zone]);

  const timetable = useTeacherTimetable(teacherId, { ...span, tz: zone });

  const studentsInWindow = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of timetable.data ?? []) for (const st of c.students) map.set(st.student.id, st.student.displayName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [timetable.data]);

  const classes = useMemo(() => {
    const filtered = (timetable.data ?? []).filter(
      (c) => student === 'all' || c.students.some((st) => st.student.id === student),
    );
    // Past is newest-first; everything else is chronological.
    return filtered.sort((a, b) =>
      day === 'all' && range === 'past' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt),
    );
  }, [timetable.data, student, day, range]);

  const zones = [...new Set([profileZone, device])];
  const pageRows = classes.slice((page - 1) * limit, page * limit);

  return (
    <div className="space-y-5">
      <Card className="p-3 sm:p-4">
        <FilterBar>
          <FilterSelect
            id="tt-when"
            label="Show"
            value={day === 'all' ? range : day}
            onChange={(v) => {
              if (v === 'upcoming' || v === 'past') {
                setDay('all');
                setRange(v);
              } else setDay(v as DayFilter);
            }}
            options={[
              { value: 'upcoming', label: 'Upcoming (next 4 weeks)' },
              { value: 'today', label: 'Today' },
              { value: 'tomorrow', label: 'Tomorrow' },
              { value: 'week', label: 'This week' },
              { value: 'date', label: 'Pick a date…' },
              { value: 'past', label: 'Past (last 30 days)' },
            ]}
          />
          {day === 'date' && (
            <div className="w-full sm:w-44">
              <Field label="Date" htmlFor="tt-date">
                <TextInput id="tt-date" type="date" value={picked} onChange={(e) => e.target.value && setPicked(e.target.value)} />
              </Field>
            </div>
          )}
          {studentsInWindow.length > 1 && (
            <FilterSelect
              id="tt-student"
              label="Student"
              value={student}
              onChange={setStudent}
              options={[{ value: 'all', label: 'All students' }, ...studentsInWindow.map(([id, name]) => ({ value: id, label: name }))]}
            />
          )}
          {zones.length > 1 && (
            <FilterSelect
              id="tt-zone"
              label="Show times in"
              value={zone}
              onChange={setZone}
              options={[
                { value: profileZone, label: `${profileZone} (profile)` },
                { value: device, label: `${device} (this device)` },
              ]}
            />
          )}
        </FilterBar>
      </Card>

      {timetable.isLoading ? (
        <Card>
          <LoadingState label="Loading your classes…" />
        </Card>
      ) : timetable.isError ? (
        <Card>
          <ErrorState error={timetable.error} onRetry={() => timetable.refetch()} />
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="w-5 h-5" aria-hidden />}
            title={range === 'upcoming' ? 'No upcoming classes' : 'No classes in this period'}
            description="Try another day or student, or keep your availability up to date so families can book you."
          />
        </Card>
      ) : (
        <Card className="p-4">
          <ul className="space-y-2">
            {pageRows.map((c) => (
              <li key={c.id}>
                <ClassCard cls={c} zone={zone} now={now} onOpen={setSelected} roomy />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            limit={limit}
            total={classes.length}
            onPageChange={setPage}
            onLimitChange={(l) => {
              setLimit(l);
              setPage(1);
            }}
            itemName="classes"
            className="mt-4"
          />
        </Card>
      )}

      {selected && <ClassDetailModal key={selected.id} cls={selected} zone={zone} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatusChip({ cls, now }: { cls: TimetableClass; now: number }) {
  const outcome = classOutcome(cls, now);
  if (outcome.label === 'In progress') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-green-800">
        <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" aria-hidden /> Live
      </span>
    );
  }
  if (outcome.label === 'Scheduled') return null;
  const colour = { green: 'text-green-800', red: 'text-red', amber: 'text-amber', gold: 'text-gold-600', neutral: 'text-muted' }[
    outcome.tone
  ];
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide ${colour}`} title={outcome.hint}>
      {outcome.label}
    </span>
  );
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
            {new Date(cls.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone })} ·{' '}
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
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
                cls.type === 'TRIAL' ? 'bg-gold-100 text-gold-600' : 'bg-sand text-ink-2',
              )}
            >
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
