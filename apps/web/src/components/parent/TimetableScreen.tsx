'use client';

import { layoutLabel } from '@/lib/api/modules/mushaf';
import { MakeupCredits } from './MakeupCredits';
import React, { useEffect, useMemo, useState } from 'react';
import { ALL, FilterBar, FilterSelect, optionsFrom } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { useDisplayZone } from '@/hooks/useDisplayZone';
import {
  addDays,
  plainDateInZone,
  startOfWeek,
  zonedTimeToUtc,
} from '@/components/teacher/zoned-time';
import { CalendarClock, Repeat, Star, Video, XCircle } from 'lucide-react';
import { CLASSROOM_EARLY_OPEN_MINUTES, joinWindow } from '@/lib/api/modules/classroom';
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  QueryState,
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useFamilyTimetable } from '@/hooks/useParentSchedule';
import {
  canCancel,
  classOutcome,
  isPastClass,
  canRateClass,
  canReschedule,
  CANCELLATION_NOTICE_HOURS,
  TimetableEntry,
} from '@/lib/api/modules/scheduling-family';
import { FamilySwitcher, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { CancelClassModal, ClassDetailModal, RateClassModal, RescheduleModal } from './ClassModals';

type Range = 'all' | 'upcoming' | 'past';

function rangeFor(range: Range, now: number): { from: string; to: string } {
  const day = 86_400_000;
  // Round to the hour so the query key is stable across renders.
  const anchor = Math.floor(now / 3_600_000) * 3_600_000;
  if (range === 'upcoming')
    return {
      from: new Date(anchor - 3 * 3_600_000).toISOString(),
      to: new Date(anchor + 28 * day).toISOString(),
    };
  if (range === 'past')
    return {
      from: new Date(anchor - 30 * day).toISOString(),
      to: new Date(anchor + 3_600_000).toISOString(),
    };
  // "All": the past 30 days and the next four weeks together.
  return {
    from: new Date(anchor - 30 * day).toISOString(),
    to: new Date(anchor + 28 * day).toISOString(),
  };
}

/** The "When" filter: a rolling range, or exactly one day / this week. */
export type When = Range | 'today' | 'tomorrow' | 'week' | 'date';

const WHEN_TITLES: Record<When, (picked: string, zone: string) => string> = {
  all: () => 'Last 30 days and next four weeks',
  upcoming: () => 'Next four weeks',
  past: () => 'Last 30 days',
  today: () => 'Today',
  tomorrow: () => 'Tomorrow',
  week: () => 'This week',
  date: (picked, zone) => dayLabel(zonedTimeToUtc(picked, '12:00', zone).toISOString(), zone),
};

function isRange(when: When): when is Range {
  return when === 'all' || when === 'upcoming' || when === 'past';
}

/**
 * Upcoming classes first (soonest on top), then past ones (most recent first), so "All"
 * opens on what is next rather than a month ago.
 */
export function sortForTimetable(
  rows: TimetableEntry[],
  when: When,
  now: number,
): TimetableEntry[] {
  const t = (r: TimetableEntry) => new Date(r.startsAt).getTime();
  if (when === 'past') return [...rows].sort((a, b) => t(b) - t(a));
  if (when !== 'all') return [...rows].sort((a, b) => t(a) - t(b));
  const upcoming = rows.filter((r) => !isPastClass(r, now)).sort((a, b) => t(a) - t(b));
  const past = rows.filter((r) => isPastClass(r, now)).sort((a, b) => t(b) - t(a));
  return [...upcoming, ...past];
}

/** Child filter for the classes loaded (shown only for 2+ children). */
function ChildFilter({
  rows,
  value,
  onChange,
}: {
  rows: TimetableEntry[];
  value: string;
  onChange: (id: string) => void;
}) {
  const children = new Map<string, string>();
  for (const r of rows)
    for (const st of r.students) children.set(st.student.id, st.student.displayName);
  if (children.size < 2) return null;
  return (
    <FilterSelect
      id="tt-child"
      label="Child"
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All children' },
        ...[...children.entries()].map(([id, name]) => ({ value: id, label: name })),
      ]}
    />
  );
}

function dayLabel(iso: string, zone: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zone,
  });
}

function timeLabel(iso: string, zone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone,
  });
}

/** "Mon 3 Nov" — the date shown on each row of the flat (paginated) list. */
function shortDate(iso: string, zone: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: zone,
  });
}

/**
 * One class in the paginated timetable list. The whole row opens the class detail; the
 * join / reschedule / cancel / rate controls keep working on their own (their clicks do
 * not reach the row).
 */
function ClassRow({
  entry: e,
  zone,
  now,
  onOpen,
  onReschedule,
  onCancel,
  onRate,
}: {
  entry: TimetableEntry;
  zone: string;
  now: number;
  onOpen: (entry: TimetableEntry) => void;
  onReschedule: (entry: TimetableEntry) => void;
  onCancel: (entry: TimetableEntry) => void;
  onRate: (entry: TimetableEntry) => void;
}) {
  const names = e.students.map((s) => s.student.displayName).join(', ') || 'Class';
  return (
    <li
      onClick={() => onOpen(e)}
      className="rounded-xl border border-line bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer hover:bg-cream transition-colors"
    >
      {/* The keyboard / screen-reader way in; the row's own click is a mouse convenience. */}
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          onOpen(e);
        }}
        aria-label={`Class details: ${names}, ${shortDate(e.startsAt, zone)} ${timeLabel(e.startsAt, zone)}`}
        className="flex items-start gap-3 min-w-0 text-left rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="text-sm font-semibold text-ink tabular-nums w-28 shrink-0">
          <span className="block text-[11px] font-normal text-muted">
            {shortDate(e.startsAt, zone)}
          </span>
          {timeLabel(e.startsAt, zone)}
          <span className="block text-[11px] font-normal text-muted">
            to {timeLabel(e.endsAt, zone)}
          </span>
        </span>
        <span className="min-w-0 block">
          <span className="block text-sm text-ink">
            {names}
            <span className="text-muted"> with {e.teacher.user.name}</span>
            {e.course && <span className="text-muted"> · {e.course.name}</span>}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 mt-1">
            <OutcomeBadge entry={e} now={now} />
            {e.type !== 'REGULAR' && <Badge>{humanize(e.type)}</Badge>}
            <span className="text-[11px] text-muted">Mushaf: {layoutLabel(e.mushafLayout)}</span>
          </span>
        </span>
      </button>
      <div
        className="flex flex-wrap items-center gap-2 sm:justify-end"
        onClick={(ev) => ev.stopPropagation()}
      >
        {e.lessonCard && e.students[0] && (
          <Link
            href={`/parent/children/${e.students[0].student.id}?tab=lessons&card=${e.lessonCard.id}`}
            className="text-[11px] font-semibold text-green-800 hover:underline"
          >
            Lesson card
          </Link>
        )}
        <JoinControl entry={e} zone={zone} now={now} />
        {canReschedule(e, now) && (
          <UiButton
            variant="secondary"
            size="sm"
            icon={<Repeat className="w-3.5 h-3.5" />}
            onClick={() => onReschedule(e)}
          >
            Reschedule
          </UiButton>
        )}
        {canCancel(e, now) && (
          <UiButton
            variant="ghost"
            size="sm"
            icon={<XCircle className="w-3.5 h-3.5" />}
            onClick={() => onCancel(e)}
          >
            Cancel
          </UiButton>
        )}
        {canRateClass(e) && (
          <UiButton
            variant="gold"
            size="sm"
            icon={<Star className="w-3.5 h-3.5" />}
            onClick={() => onRate(e)}
          >
            Rate class
          </UiButton>
        )}
        {e.rated && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <Star className="w-3.5 h-3.5 text-gold fill-current" aria-hidden /> Rated
          </span>
        )}
      </div>
    </li>
  );
}

/** `/parent/timetable` — every child's classes, with cancel / reschedule / rate. */
export function TimetableScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId }) => <FamilyTimetable key={familyId} familyId={familyId} />}
    </WithActiveFamily>
  );
}

function FamilyTimetable({ familyId }: { familyId: string }) {
  const zone = useDisplayZone();
  const [now] = useState(() => Date.now());
  // "All" first: families asked to see every class at a glance, then narrow it.
  const [when, setWhen] = useState<When>('all');
  const [picked, setPicked] = useState(() => plainDateInZone(new Date(), zone));
  const [child, setChild] = useState<string>('all');
  const [course, setCourse] = useState<string>(ALL);
  const span = useMemo(() => {
    if (isRange(when)) return rangeFor(when, now);
    const today = plainDateInZone(new Date(now), zone);
    const [first, count] =
      when === 'today'
        ? [today, 1]
        : when === 'tomorrow'
          ? [addDays(today, 1), 1]
          : when === 'week'
            ? [startOfWeek(today), 7]
            : [picked, 1];
    return {
      from: zonedTimeToUtc(first, '00:00', zone).toISOString(),
      to: zonedTimeToUtc(addDays(first, count), '00:00', zone).toISOString(),
    };
  }, [when, now, picked, zone]);
  const timetable = useFamilyTimetable(familyId, { ...span, tz: zone });
  const [cancelling, setCancelling] = useState<TimetableEntry | null>(null);
  // Re-check the join window so "Join to watch" appears without a reload.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [moving, setMoving] = useState<TimetableEntry | null>(null);
  const [rating, setRating] = useState<TimetableEntry | null>(null);
  const [open, setOpen] = useState<TimetableEntry | null>(null);
  // `?class=<id>` (from the overview's upcoming classes) opens that class once it has loaded.
  const [wanted, setWanted] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('class'),
  );
  const wantedEntry = wanted ? timetable.data?.find((e) => e.id === wanted) : undefined;
  if (wantedEntry) {
    setWanted(null);
    setOpen(wantedEntry);
  }
  // Client-side paging over the classes loaded for the chosen window. Each filter's change
  // handler goes back to the first page (rather than an effect, which would render twice).
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // An action chosen inside the detail dialog replaces it with that action's dialog.
  const fromDetail = (set: (e: TimetableEntry) => void) => (e: TimetableEntry) => {
    setOpen(null);
    set(e);
  };

  return (
    <>
      <PageHeader
        title="Timetable"
        description={`All your children’s classes, shown in your time zone (${zone}).`}
        actions={<FamilySwitcher />}
      />
      <section>
          <FilterBar className="mb-4">
            <FilterSelect<When>
              id="tt-when"
              label="When"
              value={when}
              onChange={(v) => {
                setWhen(v);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'upcoming', label: 'Upcoming (next 4 weeks)' },
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
                { value: 'week', label: 'This week' },
                { value: 'date', label: 'Pick a date…' },
                { value: 'past', label: 'Past (last 30 days)' },
              ]}
            />
            {when === 'date' && (
              <div className="w-full sm:w-44">
                <label
                  htmlFor="tt-date"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  Date
                </label>
                <TextInput
                  id="tt-date"
                  type="date"
                  value={picked}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setPicked(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            )}
            {(timetable.data ?? []).length > 0 && (
              <ChildFilter
                rows={timetable.data ?? []}
                value={child}
                onChange={(id) => {
                  setChild(id);
                  setPage(1);
                }}
              />
            )}
            {(() => {
              // Course choices come from the classes loaded, shown once there are two or more.
              const courseOptions = optionsFrom(
                timetable.data ?? [],
                (r) => (r.course ? { value: r.course.id, label: r.course.name } : null),
                'All courses',
              );
              return courseOptions.length > 2 ? (
                <FilterSelect
                  id="tt-course"
                  label="Course"
                  value={course}
                  options={courseOptions}
                  onChange={(id) => {
                    setCourse(id);
                    setPage(1);
                  }}
                />
              ) : null;
            })()}
          </FilterBar>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-ink font-sans">{WHEN_TITLES[when](picked, zone)}</h2>
            <p className="text-xs text-muted mt-0.5">
              Free cancellation up to {CANCELLATION_NOTICE_HOURS} hours before a class starts.
            </p>
          </div>
          <QueryState
            query={timetable}
            loadingLabel="Loading timetable…"
            empty={
              <EmptyState
                className="rounded-xl border border-line bg-white"
                icon={<CalendarClock className="w-5 h-5" aria-hidden />}
                title={
                  when === 'past'
                    ? 'No classes in the last 30 days'
                    : when === 'upcoming'
                      ? 'No upcoming classes'
                      : 'No classes in this period'
                }
                description={
                  when === 'past'
                    ? 'Completed classes will appear here so you can rate them.'
                    : 'Book a class from a child’s Courses tab once they are enrolled.'
                }
              />
            }
          >
            {(fetched) => {
              // Finished classes live under Past even before the API closes them.
              const inRange =
                when === 'upcoming'
                  ? fetched.filter((r) => !isPastClass(r, clock))
                  : when === 'past'
                    ? fetched.filter((r) => isPastClass(r, clock))
                    : fetched;
              const rows = (
                child === 'all'
                  ? inRange
                  : inRange.filter((r) => r.students.some((st) => st.student.id === child))
              ).filter((r) => course === ALL || r.course?.id === course);
              if (rows.length === 0) {
                return (
                  <EmptyState
                    className="rounded-xl border border-line bg-white"
                    icon={<CalendarClock className="w-5 h-5" aria-hidden />}
                    title="No classes match"
                    description="Try another day, child or course."
                  />
                );
              }
              const sorted = sortForTimetable(rows, when, clock);
              const start = (page - 1) * limit;
              const pageRows = sorted.slice(start, start + limit);
              return (
                <>
                  <ul className="space-y-2">
                    {pageRows.map((e) => (
                      <ClassRow
                        key={e.id}
                        entry={e}
                        zone={zone}
                        now={clock}
                        onOpen={setOpen}
                        onReschedule={setMoving}
                        onCancel={setCancelling}
                        onRate={setRating}
                      />
                    ))}
                  </ul>
                  <Pagination
                    page={page}
                    limit={limit}
                    total={sorted.length}
                    onPageChange={setPage}
                    onLimitChange={(l) => {
                      setLimit(l);
                      setPage(1);
                    }}
                    itemName="classes"
                    className="mt-4"
                  />
                </>
              );
            }}
          </QueryState>
      </section>

      <MakeupCredits zone={zone} />

      {open && (
        <ClassDetailModal
          key={open.id}
          entry={open}
          zone={zone}
          now={clock}
          join={<JoinControl entry={open} zone={zone} now={clock} />}
          onClose={() => setOpen(null)}
          onReschedule={fromDetail(setMoving)}
          onCancel={fromDetail(setCancelling)}
          onRate={fromDetail(setRating)}
        />
      )}
      {cancelling && <CancelClassModal entry={cancelling} onClose={() => setCancelling(null)} />}
      {moving && <RescheduleModal entry={moving} onClose={() => setMoving(null)} />}
      {rating && <RateClassModal entry={rating} onClose={() => setRating(null)} />}
    </>
  );
}

/**
 * Live-class entry for the family (FR-CLS-01): the room opens CLASSROOM_EARLY_OPEN_MINUTES
 * before the start. Before that, say when it opens; afterwards nothing is shown.
 */
export function JoinControl({
  entry,
  zone,
  now,
}: {
  entry: TimetableEntry;
  zone: string;
  now: number;
}) {
  if (entry.status !== 'SCHEDULED' && entry.status !== 'LIVE') return null;
  const window = joinWindow(entry.startsAt, entry.endsAt, now);
  if (window === 'open') {
    const base = `/parent/classroom/${entry.id}`;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {(entry.students ?? []).map(({ student }) => (
          <Link
            key={student.id}
            href={`${base}?as=${encodeURIComponent(student.id)}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-gold text-green-950 text-xs font-semibold hover:bg-gold-600 hover:text-white"
          >
            <Video className="w-3.5 h-3.5" aria-hidden /> Join as {student.displayName}
          </Link>
        ))}
        <Link
          href={`${base}?as=watch`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line bg-white text-ink text-xs font-semibold hover:bg-sand"
        >
          Watch only
        </Link>
      </span>
    );
  }
  if (window === 'early') {
    const opensAt = new Date(
      new Date(entry.startsAt).getTime() - CLASSROOM_EARLY_OPEN_MINUTES * 60_000,
    ).toISOString();
    return <span className="text-[11px] text-muted">Join opens at {timeLabel(opensAt, zone)}</span>;
  }
  return null;
}

function OutcomeBadge({ entry, now }: { entry: TimetableEntry; now: number }) {
  const outcome = classOutcome(entry, now);
  return (
    <span title={outcome.hint}>
      <Badge tone={outcome.tone}>{outcome.label}</Badge>
    </span>
  );
}
