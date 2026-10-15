'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { ClassDetailModal } from './ClassDetailModal';
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

/** `/teacher/timetable` — week view with prev/next navigation and a class detail modal. */
export function TimetableScreen() {
  return (
    <>
      <PageHeader title="Timetable" description="Your week at a glance. Select a class for its brief, the classroom, or to cancel or move it." />
      <TeacherIdentityGate what="your timetable">
        {({ teacherId, zone }) => <WeekView teacherId={teacherId} profileZone={zone} />}
      </TeacherIdentityGate>
    </>
  );
}

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'border-l-gold bg-gold-100/50',
  LIVE: 'border-l-green-600 bg-green-50',
  COMPLETED: 'border-l-green-800 bg-sand',
};

function WeekView({ teacherId, profileZone }: { teacherId: string; profileZone: string }) {
  const [device] = useState(() => deviceTimeZone());
  const [zone, setZone] = useState(profileZone);
  const [today] = useState(() => plainDateInZone(new Date(), profileZone));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selected, setSelected] = useState<TimetableClass | null>(null);

  const range = useMemo(
    () => ({
      from: zonedTimeToUtc(weekStart, '00:00', zone).toISOString(),
      to: zonedTimeToUtc(addDays(weekStart, 7), '00:00', zone).toISOString(),
      tz: zone,
    }),
    [weekStart, zone],
  );
  const timetable = useTeacherTimetable(teacherId, range);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = useMemo(() => {
    const map = new Map<string, TimetableClass[]>();
    for (const c of timetable.data ?? []) {
      const key = plainDateInZone(new Date(c.startsAt), zone);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [timetable.data, zone]);
  const zones = [...new Set([profileZone, device])];
  const weekLabel = `${formatPlainDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatPlainDate(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <UiButton variant="secondary" size="sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronLeft className="w-4 h-4" aria-hidden />} />
            <p className="text-sm font-semibold text-ink min-w-[11rem] text-center" aria-live="polite">{weekLabel}</p>
            <UiButton variant="secondary" size="sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronRight className="w-4 h-4" aria-hidden />} />
            <UiButton variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(today))} disabled={weekStart === startOfWeek(today)}>
              This week
            </UiButton>
          </div>
          {zones.length > 1 && (
            <Field label="Show times in" htmlFor="tt-zone" className="w-full sm:w-56">
              <Select id="tt-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value={profileZone}>{profileZone} (profile)</option>
                <option value={device}>{device} (this device)</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>

      {timetable.isLoading ? (
        <Card><LoadingState label="Loading your week…" /></Card>
      ) : timetable.isError ? (
        <Card><ErrorState error={timetable.error} onRetry={() => timetable.refetch()} /></Card>
      ) : (
        <>
          {(timetable.data ?? []).length === 0 && (
            <Card>
              <EmptyState title="No classes this week" description="Cancelled classes are not shown. Use the arrows to look at other weeks." />
            </Card>
          )}
          <div className="grid gap-3 lg:grid-cols-7">
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              const isToday = day === today;
              if (list.length === 0 && (timetable.data ?? []).length === 0) return null;
              return (
                <section
                  key={day}
                  aria-label={formatPlainDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={cn('rounded-2xl border bg-white p-3 min-h-[5rem]', isToday ? 'border-gold' : 'border-line', list.length === 0 && 'hidden lg:block')}
                >
                  <h2 className={cn('text-xs font-semibold font-sans mb-2', isToday ? 'text-gold-600' : 'text-muted')}>
                    {formatPlainDate(day)}
                    {isToday && <span className="ml-1">· Today</span>}
                  </h2>
                  {list.length === 0 ? (
                    <p className="text-[11px] text-muted/70">Free</p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(c)}
                            className={cn(
                              'w-full text-left rounded-lg border-l-4 px-2.5 py-2 cursor-pointer hover:shadow-card transition-shadow',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                              STATUS_STYLES[c.status] ?? 'border-l-line bg-sand',
                            )}
                          >
                            <span className="block text-xs font-semibold text-ink tabular-nums">
                              {timeInZone(c.startsAt, zone)}–{timeInZone(c.endsAt, zone)}
                            </span>
                            <span className="block text-xs text-ink-2 truncate">{classStudentNames(c) || 'No students'}</span>
                            <span className="block text-[11px] text-muted truncate">{c.course?.name ?? c.type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {selected && <ClassDetailModal key={selected.id} cls={selected} zone={zone} onClose={() => setSelected(null)} />}
    </div>
  );
}
