'use client';

import React from 'react';
import { Alert, formatDate } from '@/components/ui/primitives';
import { useHolidays } from '@/hooks/useSchedulingExtras';
import { Holiday } from '@/lib/api/modules/scheduling-admin';

/** Holidays and Ramadan windows that overlap `[from, to)` (ISO instants), as a short notice above the timetable. */
export function overlapping(holidays: Holiday[], from: string, to: string): Holiday[] {
  const start = from.slice(0, 10);
  // `to` is exclusive: a window that begins on that day is outside the range.
  const end = new Date(Date.parse(to) - 1).toISOString().slice(0, 10);
  return holidays.filter((h) => h.startsOn.slice(0, 10) <= end && h.endsOn.slice(0, 10) >= start);
}

function describeShift(h: Holiday): string {
  const shift = h.shiftRule?.shiftMinutes;
  const length = h.shiftRule?.durationMinutes;
  return [
    shift ? `classes start ${Math.abs(shift)} min ${shift > 0 ? 'later' : 'earlier'}` : null,
    length ? `classes are ${length} min long` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export function HolidayNotice({ from, to }: { from: string; to: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const query = useHolidays(today <= from.slice(0, 10) ? today : from.slice(0, 10));
  // A failed or empty lookup shows nothing: the timetable itself is what matters.
  const items = overlapping(query.data ?? [], from, to);
  if (items.length === 0) return null;
  return (
    <div className="space-y-2" aria-label="Academy closures and timetable changes">
      {items.map((h) =>
        h.type === 'HOLIDAY' ? (
          <Alert key={h.id} tone="warning" title={`Academy closed: ${h.name}`}>
            {formatDate(h.startsOn)} – {formatDate(h.endsOn)}. No classes are held on these dates.
          </Alert>
        ) : (
          <Alert key={h.id} tone="neutral" title={`Ramadan timetable: ${h.name}`}>
            {formatDate(h.startsOn)} – {formatDate(h.endsOn)}
            {describeShift(h) ? `: ${describeShift(h)}.` : '.'}
          </Alert>
        ),
      )}
    </div>
  );
}
