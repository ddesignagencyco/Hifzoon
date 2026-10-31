'use client';

import React, { useMemo, useState } from 'react';
import { useOpenSlots } from '@/hooks/useBooking';
import type { WeekdayCode } from '@/lib/api/modules/billing-family';
import { WEEK, formatClock, weeklyOptions } from '@/lib/continue-with-teacher';
import { cn } from '@/lib/utils';

/** How far ahead the teacher's free hours are read to build the weekly choices. */
export const LOOKAHEAD_DAYS = 14;

/** One teacher's free weekday + time pairs over the next two weeks, in `zone`. */
export function useWeeklyOptions(teacherId: string | undefined, classMinutes: number, zone: string, enabled = true) {
  const [range] = useState(() => ({
    from: new Date(Date.now() + 86_400_000).toISOString(),
    to: new Date(Date.now() + (LOOKAHEAD_DAYS + 1) * 86_400_000).toISOString(),
  }));
  const slots = useOpenSlots(
    // No course filter: it only admits teachers already running that course on a schedule,
    // which hides a trial teacher. The teacher is filtered client-side instead.
    { ...range, visitorZone: zone, durationMinutes: classMinutes, limit: 500 },
    Boolean(teacherId) && enabled,
  );
  const options = useMemo(
    () => (teacherId ? weeklyOptions(slots.data ?? [], teacherId, zone) : new Map<WeekdayCode, string[]>()),
    [slots.data, teacherId, zone],
  );
  return { slots, options, noTimes: slots.isSuccess && options.size === 0 };
}

export type PickedTimes = Partial<Record<WeekdayCode, string>>;

export function pickedSlots(picked: PickedTimes) {
  return WEEK.filter((d) => picked[d.code]).map((d) => ({ weekday: d.code, localTime: picked[d.code] as string }));
}

/** Toggles a time; one per day, at most `needed` days. Returns null when the limit is hit. */
export function togglePicked(current: PickedTimes, day: WeekdayCode, time: string, needed: number): PickedTimes | null {
  const next = { ...current };
  if (next[day] === time) delete next[day];
  else if (next[day] || Object.keys(next).length < needed) next[day] = time;
  else return null;
  return next;
}

/** Day-by-day chips of the teacher's free times. */
export function WeeklyTimesGrid({
  options,
  picked,
  onToggle,
}: {
  options: Map<WeekdayCode, string[]>;
  picked: PickedTimes;
  onToggle: (day: WeekdayCode, time: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {WEEK.map((day) => {
        const times = options.get(day.code) ?? [];
        return (
          <fieldset key={day.code} className="rounded-xl border border-line p-3">
            <legend className="px-1 text-xs font-semibold text-ink">{day.label}</legend>
            {times.length === 0 ? (
              <p className="text-[11px] text-muted">Not available</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {times.map((t) => {
                  const on = picked[day.code] === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggle(day.code, t)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                        on ? 'border-green-700 bg-green-800 text-white' : 'border-line bg-white text-ink-2 hover:bg-sand',
                      )}
                    >
                      {formatClock(t)}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
