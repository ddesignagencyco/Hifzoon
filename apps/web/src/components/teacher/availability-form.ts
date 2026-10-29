import { AvailabilitySlotInput, HH_MM, SetAvailabilityInput } from '@/lib/api/modules/teacher-schedule';
import { minutesOf } from './zoned-time';

/** An editable availability row (`key` is a stable React key). */
export interface AvailabilityRow extends AvailabilitySlotInput {
  key: string;
}

export interface AvailabilityValidation {
  /** Per-row message keyed by `row.key`. */
  rowErrors: Record<string, string>;
  formError: string | null;
  valid: boolean;
}

/**
 * Mirrors `SetAvailabilityDto` + `SchedulingService.setAvailability`: at least one slot,
 * weekday 0–6, `HH:mm` times, end after start — plus overlap checks per weekday, which the
 * API does not do but which would otherwise store a confusing grid.
 */
export function validateAvailability(
  rows: AvailabilityRow[],
  effective: { from?: string; to?: string } = {},
  options: { allowEmpty?: boolean } = {},
): AvailabilityValidation {
  const rowErrors: Record<string, string> = {};
  for (const row of rows) {
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) {
      rowErrors[row.key] = 'Choose a weekday.';
    } else if (!HH_MM.test(row.startTime) || !HH_MM.test(row.endTime)) {
      rowErrors[row.key] = 'Times must be HH:mm (00:00–23:59).';
    } else if (minutesOf(row.endTime) <= minutesOf(row.startTime)) {
      rowErrors[row.key] = 'End time must be after the start time.';
    }
  }

  const byDay = new Map<number, AvailabilityRow[]>();
  for (const row of rows) {
    if (rowErrors[row.key]) continue;
    byDay.set(row.weekday, [...(byDay.get(row.weekday) ?? []), row]);
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (minutesOf(cur.startTime) < minutesOf(prev.endTime)) {
        rowErrors[cur.key] = `Overlaps ${prev.startTime}–${prev.endTime} on the same day.`;
      }
    }
  }

  let formError: string | null = null;
  if (rows.length === 0 && !options.allowEmpty) formError = 'Add at least one available time range.';
  else if (effective.from && effective.to && effective.to < effective.from) {
    formError = '"Effective until" must be on or after "Effective from".';
  }

  return { rowErrors, formError, valid: !formError && Object.keys(rowErrors).length === 0 };
}

/** Builds the exact `SetAvailabilityDto` body: only DTO fields, sorted by weekday then start. */
export function serialiseAvailability(
  rows: AvailabilityRow[],
  effective: { from?: string; to?: string } = {},
): SetAvailabilityInput {
  const slots = [...rows]
    .sort((a, b) => a.weekday - b.weekday || minutesOf(a.startTime) - minutesOf(b.startTime))
    .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }));
  return {
    slots,
    ...(effective.from ? { effectiveFrom: effective.from } : {}),
    ...(effective.to ? { effectiveTo: effective.to } : {}),
  };
}

let seq = 0;
export function newRowKey(): string {
  seq += 1;
  return `row-${seq}`;
}

export function toRows(slots: AvailabilitySlotInput[]): AvailabilityRow[] {
  return slots.map((s) => ({ key: newRowKey(), weekday: s.weekday, startTime: s.startTime, endTime: s.endTime }));
}

/**
 * True for a slot saved through the month-by-month editor: the API stores those with
 * `effectiveFrom` = the 1st and `effectiveTo` = the last day of the same month (UTC).
 */
export function isMonthScopedSlot(slot: { effectiveFrom: string; effectiveTo: string | null }): boolean {
  if (!slot.effectiveTo) return false;
  const from = new Date(slot.effectiveFrom);
  const to = new Date(slot.effectiveTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  const lastDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  return (
    from.getUTCDate() === 1 &&
    from.getUTCHours() === 0 &&
    to.getUTCFullYear() === lastDay.getUTCFullYear() &&
    to.getUTCMonth() === lastDay.getUTCMonth() &&
    to.getUTCDate() === lastDay.getUTCDate()
  );
}
