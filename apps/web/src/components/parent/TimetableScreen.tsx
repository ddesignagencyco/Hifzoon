'use client';

import React, { useMemo, useState } from 'react';
import { CalendarClock, Repeat, Star, XCircle } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  QueryState,
  StatusBadge,
  Tabs,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useFamilyTimetable } from '@/hooks/useParentSchedule';
import {
  canCancel,
  canReschedule,
  CANCELLATION_NOTICE_HOURS,
  TimetableEntry,
} from '@/lib/api/modules/scheduling-family';
import { FamilySwitcher, viewerTimeZone, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { CancelClassModal, RateClassModal, RescheduleModal } from './ClassModals';

type Range = 'upcoming' | 'past';

function rangeFor(range: Range, now: number): { from: string; to: string } {
  const day = 86_400_000;
  // Round to the hour so the query key is stable across renders.
  const anchor = Math.floor(now / 3_600_000) * 3_600_000;
  return range === 'upcoming'
    ? { from: new Date(anchor - 3 * 3_600_000).toISOString(), to: new Date(anchor + 28 * day).toISOString() }
    : { from: new Date(anchor - 30 * day).toISOString(), to: new Date(anchor).toISOString() };
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
  const zone = viewerTimeZone();
  const [range, setRange] = useState<Range>('upcoming');
  const [now] = useState(() => Date.now());
  const span = useMemo(() => rangeFor(range, now), [range, now]);
  const timetable = useFamilyTimetable(familyId, { ...span, tz: zone });
  const [cancelling, setCancelling] = useState<TimetableEntry | null>(null);
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
          title={range === 'upcoming' ? 'Next four weeks' : 'Last 30 days'}
          description={`Free cancellation up to ${CANCELLATION_NOTICE_HOURS} hours before a class starts.`}
          action={
            <Tabs
              tabs={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'past', label: 'Past' },
              ]}
              value={range}
              onChange={setRange}
            />
          }
        />
        <CardBody>
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
            {(rows) => {
              const sorted = [...rows].sort((a, b) =>
                range === 'upcoming'
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
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <StatusBadge status={e.status} />
                                  {e.type !== 'REGULAR' && <Badge>{humanize(e.type)}</Badge>}
                                  <span className="text-[11px] text-muted">Mushaf: {humanize(e.mushafLayout)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              {canReschedule(e) && (
                                <UiButton variant="secondary" size="sm" icon={<Repeat className="w-3.5 h-3.5" />} onClick={() => setMoving(e)}>
                                  Reschedule
                                </UiButton>
                              )}
                              {canCancel(e) && (
                                <UiButton variant="ghost" size="sm" icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => setCancelling(e)}>
                                  Cancel
                                </UiButton>
                              )}
                              {e.status === 'COMPLETED' && (
                                <UiButton variant="gold" size="sm" icon={<Star className="w-3.5 h-3.5" />} onClick={() => setRating(e)}>
                                  Rate class
                                </UiButton>
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

      {cancelling && <CancelClassModal entry={cancelling} onClose={() => setCancelling(null)} />}
      {moving && <RescheduleModal entry={moving} onClose={() => setMoving(null)} />}
      {rating && <RateClassModal entry={rating} onClose={() => setRating(null)} />}
    </>
  );
}
