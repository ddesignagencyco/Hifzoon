'use client';

import { layoutLabel } from '@/lib/api/modules/mushaf';
import { MakeupCredits } from './MakeupCredits';
import React, { useEffect, useMemo, useState } from 'react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { useDisplayZone } from '@/hooks/useDisplayZone';
import { addDays, plainDateInZone, startOfWeek, zonedTimeToUtc } from '@/components/teacher/zoned-time';
import { CalendarClock, Repeat, Star, Video, XCircle } from 'lucide-react';
import { CLASSROOM_EARLY_OPEN_MINUTES, joinWindow } from '@/lib/api/modules/classroom';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
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
import { CancelClassModal, RateClassModal, RescheduleModal } from './ClassModals';

type Range = 'upcoming' | 'past';

function rangeFor(range: Range, now: number): { from: string; to: string } {
  const day = 86_400_000;
  // Round to the hour so the query key is stable across renders.
  const anchor = Math.floor(now / 3_600_000) * 3_600_000;
  return range === 'upcoming'
    ? { from: new Date(anchor - 3 * 3_600_000).toISOString(), to: new Date(anchor + 28 * day).toISOString() }
    : { from: new Date(anchor - 30 * day).toISOString(), to: new Date(anchor + 3_600_000).toISOString() };
}

type DayFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'date';

const DAY_TITLES: Record<Exclude<DayFilter, 'all'>, (picked: string, zone: string) => string> = {
  today: () => 'Today',
  tomorrow: () => 'Tomorrow',
  week: () => 'This week',
  date: (picked, zone) => dayLabel(zonedTimeToUtc(picked, '12:00', zone).toISOString(), zone),
};

/** Child filter for the classes loaded (shown only for 2+ children). */
function ChildFilter({ rows, value, onChange }: { rows: TimetableEntry[]; value: string; onChange: (id: string) => void }) {
  const children = new Map<string, string>();
  for (const r of rows) for (const st of r.students) children.set(st.student.id, st.student.displayName);
  if (children.size < 2) return null;
  return (
    <FilterSelect
      id="tt-child"
      label="Child"
      value={value}
      onChange={onChange}
      options={[{ value: 'all', label: 'All children' }, ...[...children.entries()].map(([id, name]) => ({ value: id, label: name }))]}
    />
  );
}

function dayLabel(iso: string, zone: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone });
}

function timeLabel(iso: string, zone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: zone });
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
  const [range, setRange] = useState<Range>('upcoming');
  const [now] = useState(() => Date.now());
  // Day filter: "all" uses the Upcoming/Past tabs; the others load exactly that period.
  const [day, setDay] = useState<DayFilter>('all');
  const [picked, setPicked] = useState(() => plainDateInZone(new Date(), zone));
  const [child, setChild] = useState<string>('all');
  const span = useMemo(() => {
    if (day === 'all') return rangeFor(range, now);
    const today = plainDateInZone(new Date(now), zone);
    const [first, count] =
      day === 'today' ? [today, 1] : day === 'tomorrow' ? [addDays(today, 1), 1] : day === 'week' ? [startOfWeek(today), 7] : [picked, 1];
    return {
      from: zonedTimeToUtc(first, '00:00', zone).toISOString(),
      to: zonedTimeToUtc(addDays(first, count), '00:00', zone).toISOString(),
    };
  }, [day, range, now, picked, zone]);
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

  return (
    <>
      <PageHeader
        title="Timetable"
        description={`All your children’s classes, shown in your time zone (${zone}).`}
        actions={<FamilySwitcher />}
      />
      <Card>
        <CardHeader
          title={day === 'all' ? (range === 'upcoming' ? 'Next four weeks' : 'Last 30 days') : DAY_TITLES[day](picked, zone)}
          description={`Free cancellation up to ${CANCELLATION_NOTICE_HOURS} hours before a class starts.`}
        />
        <CardBody>
          <FilterBar className="mb-4">
            <FilterSelect
              id="tt-when"
              label="When"
              value={day === 'all' ? range : day}
              onChange={(v) => {
                if (v === 'upcoming' || v === 'past') {
                  setDay('all');
                  setRange(v);
                } else setDay(v);
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
                <label htmlFor="tt-date" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Date
                </label>
                <TextInput id="tt-date" type="date" value={picked} onChange={(e) => e.target.value && setPicked(e.target.value)} />
              </div>
            )}
            {(timetable.data ?? []).length > 0 && <ChildFilter rows={timetable.data ?? []} value={child} onChange={setChild} />}
          </FilterBar>
          <QueryState
            query={timetable}
            loadingLabel="Loading timetable…"
            empty={
              <EmptyState
                icon={<CalendarClock className="w-5 h-5" aria-hidden />}
                title={range === 'upcoming' ? 'No upcoming classes' : 'No classes in the last 30 days'}
                description={
                  range === 'upcoming'
                    ? 'Book a class from a child’s Courses tab once they are enrolled.'
                    : 'Completed classes will appear here so you can rate them.'
                }
              />
            }
          >
            {(fetched) => {
              // Finished classes live under Past even before the API closes them.
              const inRange = day !== 'all' ? fetched : fetched.filter((r) => (range === 'upcoming' ? !isPastClass(r, clock) : isPastClass(r, clock)));
              const rows = child === 'all' ? inRange : inRange.filter((r) => r.students.some((st) => st.student.id === child));
              if (rows.length === 0) {
                return (
                  <EmptyState
                    icon={<CalendarClock className="w-5 h-5" aria-hidden />}
                    title="No classes match"
                    description="Try another day or child."
                  />
                );
              }
              const sorted = [...rows].sort((a, b) =>
                range === 'upcoming' || day !== 'all'
                  ? new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
                  : new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
              );
              const groups = new Map<string, TimetableEntry[]>();
              for (const row of sorted) {
                const key = dayLabel(row.startsAt, zone);
                groups.set(key, [...(groups.get(key) ?? []), row]);
              }
              return (
                <div className="space-y-6">
                  {[...groups.entries()].map(([day, entries]) => (
                    <section key={day} aria-label={day}>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 font-sans">{day}</h2>
                      <ul className="space-y-2">
                        {entries.map((e) => (
                          <li
                            key={e.id}
                            className="rounded-xl border border-line px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="text-sm font-semibold text-ink tabular-nums w-24 shrink-0">
                                {timeLabel(e.startsAt, zone)}
                                <span className="block text-[11px] font-normal text-muted">to {timeLabel(e.endsAt, zone)}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm text-ink">
                                  {e.students.map((s) => s.student.displayName).join(', ') || 'Class'}
                                  <span className="text-muted"> with {e.teacher.user.name}</span>
                                  {e.course && <span className="text-muted"> · {e.course.name}</span>}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <OutcomeBadge entry={e} now={clock} />
                                  {e.type !== 'REGULAR' && <Badge>{humanize(e.type)}</Badge>}
                                  <span className="text-[11px] text-muted">Mushaf: {layoutLabel(e.mushafLayout)}</span>
                                  {e.lessonCard && e.students[0] && (
                                    <Link
                                      href={`/parent/children/${e.students[0].student.id}?tab=lessons&card=${e.lessonCard.id}`}
                                      className="text-[11px] font-semibold text-green-800 hover:underline"
                                    >
                                      Lesson card
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <JoinControl entry={e} zone={zone} now={clock} />
                              {canReschedule(e, clock) && (
                                <UiButton variant="secondary" size="sm" icon={<Repeat className="w-3.5 h-3.5" />} onClick={() => setMoving(e)}>
                                  Reschedule
                                </UiButton>
                              )}
                              {canCancel(e, clock) && (
                                <UiButton variant="ghost" size="sm" icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => setCancelling(e)}>
                                  Cancel
                                </UiButton>
                              )}
                              {canRateClass(e) && (
                                <UiButton variant="gold" size="sm" icon={<Star className="w-3.5 h-3.5" />} onClick={() => setRating(e)}>
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
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              );
            }}
          </QueryState>
        </CardBody>
      </Card>

      <MakeupCredits zone={zone} />

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
export function JoinControl({ entry, zone, now }: { entry: TimetableEntry; zone: string; now: number }) {
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
    const opensAt = new Date(new Date(entry.startsAt).getTime() - CLASSROOM_EARLY_OPEN_MINUTES * 60_000).toISOString();
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
