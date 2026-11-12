/**
 * Academy holidays and the Ramadan timetable (FR-SCH-05).
 *
 * A HOLIDAY skips every class that falls on it. A RAMADAN_TIMETABLE does not skip classes: it
 * moves them (and may shorten them) for the dates it covers, because families keep their
 * weekly slot but the school day is different during the month.
 */
export interface HolidayRow {
  id: string;
  name: string;
  type: 'HOLIDAY' | 'RAMADAN_TIMETABLE';
  startsOn: Date;
  endsOn: Date;
  shiftRule: unknown;
}

export interface RamadanShift {
  /** Minutes added to the class's local start time; negative moves it earlier. */
  shiftMinutes: number;
  /** Replaces the class length for these dates when given. */
  durationMinutes?: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The holiday or Ramadan window covering a local calendar date (`YYYY-MM-DD`), if any. */
export function holidayOn(date: string, holidays: readonly HolidayRow[]): HolidayRow | undefined {
  // A closure beats a shift: if both cover a date, the school is closed.
  return (
    holidays.find(
      (h) => h.type === 'HOLIDAY' && iso(h.startsOn) <= date && date <= iso(h.endsOn),
    ) ??
    holidays.find(
      (h) => h.type === 'RAMADAN_TIMETABLE' && iso(h.startsOn) <= date && date <= iso(h.endsOn),
    )
  );
}

/** Validated shift rule, or null when the stored JSON is not a usable one. */
export function parseShiftRule(rule: unknown): RamadanShift | null {
  if (!rule || typeof rule !== 'object') return null;
  const { shiftMinutes, durationMinutes } = rule as Record<string, unknown>;
  const shift =
    typeof shiftMinutes === 'number' && Number.isInteger(shiftMinutes) ? shiftMinutes : 0;
  const duration =
    typeof durationMinutes === 'number' && Number.isInteger(durationMinutes) && durationMinutes > 0
      ? durationMinutes
      : undefined;
  if (shift === 0 && duration === undefined) return null;
  return { shiftMinutes: shift, ...(duration !== undefined ? { durationMinutes: duration } : {}) };
}

/** A shifted local start, kept inside the day so a large shift never wraps to another date. */
export function shiftedStartMinutes(startMinutes: number, shiftMinutes: number): number {
  return Math.min(Math.max(startMinutes + shiftMinutes, 0), 24 * 60 - 1);
}
