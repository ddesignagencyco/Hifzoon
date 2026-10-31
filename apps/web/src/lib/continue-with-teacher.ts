import type { WeekdayCode } from '@/lib/api/modules/billing-family';

/** Monday first, the order families read a week in. */
export const WEEK: Array<{ code: WeekdayCode; label: string; short: string }> = [
  { code: 'MO', label: 'Monday', short: 'Mon' },
  { code: 'TU', label: 'Tuesday', short: 'Tue' },
  { code: 'WE', label: 'Wednesday', short: 'Wed' },
  { code: 'TH', label: 'Thursday', short: 'Thu' },
  { code: 'FR', label: 'Friday', short: 'Fri' },
  { code: 'SA', label: 'Saturday', short: 'Sat' },
  { code: 'SU', label: 'Sunday', short: 'Sun' },
];

const WEEKDAY_BY_NAME: Record<string, WeekdayCode> = {
  Mon: 'MO',
  Tue: 'TU',
  Wed: 'WE',
  Thu: 'TH',
  Fri: 'FR',
  Sat: 'SA',
  Sun: 'SU',
};

/** Weekday and HH:mm of an instant in a zone. */
export function weekdayAndTime(iso: string, zone: string): { weekday: WeekdayCode; localTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: WEEKDAY_BY_NAME[get('weekday')] ?? 'MO', localTime: `${get('hour')}:${get('minute')}` };
}

/**
 * The weekly times one teacher can take, from their open slots over the coming weeks: a
 * weekday + time is offered when it is free at least once. Times are sorted per day.
 */
export function weeklyOptions(
  slots: ReadonlyArray<{ teacherId: string; startsAt: string }>,
  teacherId: string,
  zone: string,
): Map<WeekdayCode, string[]> {
  const byDay = new Map<WeekdayCode, Set<string>>();
  for (const slot of slots) {
    if (slot.teacherId !== teacherId) continue;
    const { weekday, localTime } = weekdayAndTime(slot.startsAt, zone);
    if (!byDay.has(weekday)) byDay.set(weekday, new Set());
    byDay.get(weekday)!.add(localTime);
  }
  const out = new Map<WeekdayCode, string[]>();
  for (const { code } of WEEK) {
    const times = byDay.get(code);
    if (times && times.size > 0) out.set(code, [...times].sort());
  }
  return out;
}

/** Today's date (YYYY-MM-DD) in a zone, plus `days`. */
export function dateInZone(zone: string, days = 0): string {
  const at = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** 12-hour clock label: "5:00 pm" from "17:00". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
