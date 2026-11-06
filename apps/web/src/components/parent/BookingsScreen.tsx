'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import {
  Alert,
  Badge,
  Column,
  DataTable,
  EmptyState,
  PageHeader,
  QueryState,
  TextInput,
  humanize,
} from '@/components/ui/primitives';
import { useDisplayZone } from '@/hooks/useDisplayZone';
import { useFamilyTimetable } from '@/hooks/useParentSchedule';
import { useTrialOffers } from '@/hooks/useBilling';
import { plainDateInZone } from '@/components/teacher/zoned-time';
import { TrialOffer } from '@/lib/api/modules/billing-family';
import {
  classOutcome,
  isCancelled,
  isPastClass,
  TimetableEntry,
} from '@/lib/api/modules/scheduling-family';
import { FamilySwitcher, formatClassTime, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { JoinControl, sortForTimetable } from './TimetableScreen';
import { CancelClassModal, ClassDetailModal, RateClassModal, RescheduleModal } from './ClassModals';

/** How far back and ahead the page loads: a year of history and the next six months. */
const PAST_DAYS = 365;
const AHEAD_DAYS = 183;
/** The timetable endpoint returns at most this many rows (oldest first). */
const TIMETABLE_CAP = 500;

export function bookingsWindow(now: number): { from: string; to: string } {
  const day = 86_400_000;
  // Round to the hour so the query key is stable across renders.
  const anchor = Math.floor(now / 3_600_000) * 3_600_000;
  return {
    from: new Date(anchor - PAST_DAYS * day).toISOString(),
    to: new Date(anchor + AHEAD_DAYS * day).toISOString(),
  };
}

export type NextStep =
  | { kind: 'offer'; label: string; href: string }
  | { kind: 'card'; label: string; href: string }
  | { kind: 'text'; label: string };

/**
 * What happens next for a booking. A trial's result is not on the timetable row, so a won
 * trial is recognised by its offer (same child and course, from `GET /billing/offers`).
 */
export function bookingNextStep(
  entry: TimetableEntry,
  offers: TrialOffer[],
  now: number,
): NextStep {
  const student = entry.students[0]?.student;
  if (isCancelled(entry.status)) return { kind: 'text', label: '—' };
  if (entry.type === 'TRIAL') {
    if (!isPastClass(entry, now))
      return { kind: 'text', label: 'Trial booked — the teacher shares a result after the class.' };
    const offer = offers.find(
      (o) => o.student?.id === student?.id && (o.course?.id ?? null) === (entry.course?.id ?? null),
    );
    if (offer) {
      return {
        kind: 'offer',
        label: 'Good result — choose a plan',
        href: `/parent/continue/${encodeURIComponent(offer.trialOutcomeId)}`,
      };
    }
    if (entry.status === 'NO_SHOW_STUDENT')
      return { kind: 'text', label: 'Missed — book another trial from Courses.' };
    return { kind: 'text', label: 'Waiting for the teacher’s result.' };
  }
  if (entry.lessonCard && student) {
    return {
      kind: 'card',
      label: 'Lesson card',
      href: `/parent/children/${student.id}?tab=lessons&card=${entry.lessonCard.id}`,
    };
  }
  return { kind: 'text', label: isPastClass(entry, now) ? '—' : 'Upcoming' };
}

export interface BookingFilters {
  child: string;
  course: string;
  type: string;
  status: string;
  from: string;
  to: string;
}

const NO_FILTERS: BookingFilters = {
  child: 'all',
  course: 'all',
  type: 'all',
  status: 'all',
  from: '',
  to: '',
};

/** Applies the page's filters; `from` / `to` are calendar dates in the viewer's zone. */
export function filterBookings(
  rows: TimetableEntry[],
  f: BookingFilters,
  zone: string,
  now: number,
): TimetableEntry[] {
  return rows.filter((r) => {
    if (f.child !== 'all' && !r.students.some((s) => s.student.id === f.child)) return false;
    if (f.course !== 'all' && (r.course?.id ?? 'none') !== f.course) return false;
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.status !== 'all' && classOutcome(r, now).label !== f.status) return false;
    const day = plainDateInZone(new Date(r.startsAt), zone);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}

/** `/parent/bookings` — every trial and class booked for the family's children. */
export function BookingsScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId }) => <FamilyBookings key={familyId} familyId={familyId} />}
    </WithActiveFamily>
  );
}

function FamilyBookings({ familyId }: { familyId: string }) {
  const zone = useDisplayZone();
  const [now] = useState(() => Date.now());
  const span = useMemo(() => bookingsWindow(now), [now]);
  const timetable = useFamilyTimetable(familyId, { ...span, tz: zone });
  const offersQuery = useTrialOffers();
  const offers = useMemo(
    () => (offersQuery.data ?? []).filter((o) => o.familyId === familyId),
    [offersQuery.data, familyId],
  );
  const [filters, setFilters] = useState<BookingFilters>(NO_FILTERS);
  const set = <K extends keyof BookingFilters>(key: K, value: BookingFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const [open, setOpen] = useState<TimetableEntry | null>(null);
  const [cancelling, setCancelling] = useState<TimetableEntry | null>(null);
  const [moving, setMoving] = useState<TimetableEntry | null>(null);
  const [rating, setRating] = useState<TimetableEntry | null>(null);
  const fromDetail = (setter: (e: TimetableEntry) => void) => (e: TimetableEntry) => {
    setOpen(null);
    setter(e);
  };

  const all = useMemo(() => timetable.data ?? [], [timetable.data]);
  const options = useMemo(() => {
    const children = new Map<string, string>();
    const courses = new Map<string, string>();
    const types = new Set<string>();
    const statuses = new Set<string>();
    for (const r of all) {
      for (const s of r.students) children.set(s.student.id, s.student.displayName);
      courses.set(r.course?.id ?? 'none', r.course?.name ?? 'No course');
      types.add(r.type);
      statuses.add(classOutcome(r, now).label);
    }
    return { children, courses, types, statuses };
  }, [all, now]);

  const columns: Column<TimetableEntry>[] = [
    {
      key: 'child',
      header: 'Child',
      // The row opens on click; this button is the keyboard way to the same details.
      render: (r) => (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            setOpen(r);
          }}
          className="font-semibold text-ink text-left hover:underline cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {r.students.map((s) => s.student.displayName).join(', ') || '—'}
        </button>
      ),
      sortValue: (r) => r.students.map((s) => s.student.displayName).join(', '),
    },
    { key: 'course', header: 'Course', render: (r) => r.course?.name ?? '—' },
    { key: 'teacher', header: 'Teacher', render: (r) => r.teacher.user.name },
    {
      key: 'when',
      header: 'Date & time',
      render: (r) => (
        <span className="whitespace-nowrap">{formatClassTime(r.startsAt, r.endsAt, zone)}</span>
      ),
      sortValue: (r) => new Date(r.startsAt).getTime(),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => (
        <Badge tone={r.type === 'TRIAL' ? 'gold' : 'neutral'}>{humanize(r.type)}</Badge>
      ),
      sortValue: (r) => r.type,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const o = classOutcome(r, now);
        return (
          <span title={o.hint}>
            <Badge tone={o.tone}>{o.label}</Badge>
          </span>
        );
      },
      sortValue: (r) => classOutcome(r, now).label,
    },
    {
      key: 'next',
      header: 'Result / next step',
      sortable: false,
      render: (r) => {
        const step = bookingNextStep(r, offers, now);
        if (step.kind === 'text') return <span className="text-xs text-muted">{step.label}</span>;
        return (
          <Link
            href={step.href}
            onClick={(ev) => ev.stopPropagation()}
            className={
              step.kind === 'offer'
                ? 'text-xs font-semibold text-green-800 underline'
                : 'text-xs font-semibold text-green-800 hover:underline'
            }
          >
            {step.label}
          </Link>
        );
      },
    },
  ];

  const rangeError =
    filters.from && filters.to && filters.from > filters.to ? '“From” must be before “To”.' : null;

  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Trials & bookings"
        description={`Every trial and class booked for your children, in your time zone (${zone}).`}
        actions={<FamilySwitcher />}
      />

      {offers.length > 0 && (
        <Alert
          tone="success"
          title={
            offers.length === 1
              ? 'A trial offer is waiting'
              : `${offers.length} trial offers are waiting`
          }
        >
          <ul className="mt-1 space-y-1">
            {offers.map((o) => (
              <li key={o.trialOutcomeId}>
                {o.student?.displayName ?? 'Your child'} · {o.course?.name ?? 'Course'}
                {o.teacher ? ` with ${o.teacher.name}` : ''} —{' '}
                <Link
                  href={`/parent/continue/${encodeURIComponent(o.trialOutcomeId)}`}
                  className="font-semibold underline"
                >
                  Choose a plan
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className={offers.length > 0 ? 'mt-6' : undefined}>
          <QueryState
            query={timetable}
            loadingLabel="Loading bookings…"
            empty={
              <EmptyState
                className="rounded-xl border border-line bg-white"
                icon={<Sparkles className="w-5 h-5" aria-hidden />}
                title="No bookings yet"
                description="Start a course for a child with a free trial from the Courses page."
                action={
                  <Link
                    href="/parent/courses"
                    className="text-sm font-semibold text-green-700 hover:underline"
                  >
                    Go to Courses
                  </Link>
                }
              />
            }
          >
            {(rows) => {
              const shown = sortForTimetable(filterBookings(rows, filters, zone, now), 'all', now);
              return (
                <div className="space-y-4">
                  <p className="text-xs text-muted">Upcoming first, then past. Select a row for the class details.</p>
                  <FilterBar>
                    {options.children.size > 1 && (
                      <FilterSelect
                        id="bk-child"
                        label="Child"
                        value={filters.child}
                        onChange={(v) => set('child', v)}
                        options={[
                          { value: 'all', label: 'All children' },
                          ...[...options.children].map(([value, label]) => ({ value, label })),
                        ]}
                      />
                    )}
                    <FilterSelect
                      id="bk-course"
                      label="Course"
                      value={filters.course}
                      onChange={(v) => set('course', v)}
                      options={[
                        { value: 'all', label: 'All courses' },
                        ...[...options.courses].map(([value, label]) => ({ value, label })),
                      ]}
                    />
                    <FilterSelect
                      id="bk-type"
                      label="Type"
                      value={filters.type}
                      onChange={(v) => set('type', v)}
                      options={[
                        { value: 'all', label: 'All types' },
                        ...[...options.types].map((t) => ({ value: t, label: humanize(t) })),
                      ]}
                    />
                    <FilterSelect
                      id="bk-status"
                      label="Status"
                      value={filters.status}
                      onChange={(v) => set('status', v)}
                      options={[
                        { value: 'all', label: 'All statuses' },
                        ...[...options.statuses].map((s) => ({ value: s, label: s })),
                      ]}
                    />
                    <div className="w-full sm:w-40">
                      <label
                        htmlFor="bk-from"
                        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted"
                      >
                        From
                      </label>
                      <TextInput
                        id="bk-from"
                        type="date"
                        value={filters.from}
                        onChange={(e) => set('from', e.target.value)}
                      />
                    </div>
                    <div className="w-full sm:w-40">
                      <label
                        htmlFor="bk-to"
                        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted"
                      >
                        To
                      </label>
                      <TextInput
                        id="bk-to"
                        type="date"
                        value={filters.to}
                        onChange={(e) => set('to', e.target.value)}
                        aria-invalid={Boolean(rangeError)}
                      />
                    </div>
                  </FilterBar>
                  {rangeError && <p className="text-xs text-red">{rangeError}</p>}
                  {rows.length >= TIMETABLE_CAP && (
                    <Alert tone="neutral">
                      Showing the first {TIMETABLE_CAP} bookings in this period. Narrow the dates to
                      see the rest.
                    </Alert>
                  )}
                  <DataTable<TimetableEntry>
                    rows={shown}
                    rowKey={(r) => r.id}
                    columns={columns}
                    onRowClick={setOpen}
                    pageSize={20}
                    empty={
                      <EmptyState
                        title="No bookings match"
                        description="Try another child, course, type, status or dates."
                      />
                    }
                  />
                </div>
              );
            }}
          </QueryState>
      </div>

      {open && (
        <ClassDetailModal
          key={open.id}
          entry={open}
          zone={zone}
          now={now}
          join={<JoinControl entry={open} zone={zone} now={now} />}
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
