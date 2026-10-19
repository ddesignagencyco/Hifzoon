/**
 * Timezone helpers for the teacher portal, built on `Intl` only (no date library in the web app).
 * "Plain dates" are `YYYY-MM-DD` strings; arithmetic on them is done at UTC noon so DST never shifts a day.
 */

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday-first display order for weekday indexes (0 = Sunday, as in the API). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Offset of `zone` at `instant`, in minutes east of UTC. */
export function zoneOffsetMinutes(zone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The calendar date (`YYYY-MM-DD`) of `instant` in `zone`. */
export function plainDateInZone(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  );
}

export function addDays(plainDate: string, days: number): string {
  const [y, m, d] = plainDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a plain date. */
export function weekdayOf(plainDate: string): number {
  const [y, m, d] = plainDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** Monday of the week containing `plainDate`. */
export function startOfWeek(plainDate: string): string {
  const wd = weekdayOf(plainDate);
  return addDays(plainDate, wd === 0 ? -6 : 1 - wd);
}

/**
 * The UTC instant for a local wall-clock time in `zone`. In a spring-forward gap the
 * result lands on the later valid instant; callers re-render it so the user sees it.
 */
export function zonedTimeToUtc(plainDate: string, time: string, zone: string): Date {
  const [y, m, d] = plainDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall - zoneOffsetMinutes(zone, new Date(wall)) * 60_000;
  const second = wall - zoneOffsetMinutes(zone, new Date(guess)) * 60_000;
  if (second !== guess) guess = second;
  return new Date(guess);
}

/** `HH:mm` of `instant` in `zone`. */
export function timeInZone(instant: Date | string, zone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    date,
  );
}

/** Local date (`YYYY-MM-DD`) and `HH:mm` of an instant in `zone`, for pre-filling inputs. */
export function splitInZone(instant: Date | string, zone: string): { date: string; time: string } {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return { date: plainDateInZone(date, zone), time: timeInZone(date, zone) };
}

export function formatPlainDate(plainDate: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = plainDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function formatInZone(instant: Date | string, zone: string, opts: Intl.DateTimeFormatOptions): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return date.toLocaleString(undefined, { ...opts, timeZone: zone });
}

/** `UTC+1`, `UTC−5:30`. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

export interface ZoneTransition {
  /** First local date on which the new offset applies. */
  date: string;
  fromOffset: number;
  toOffset: number;
}

/** Offset changes (DST) for `zone` in the next `days` days, at one-day resolution. */
export function upcomingTransitions(zone: string, from: Date, days = 190): ZoneTransition[] {
  const out: ZoneTransition[] = [];
  // Sample at UTC noon so the reported date is the day the change happens, whatever time `from` carries.
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12);
  let prev = zoneOffsetMinutes(zone, new Date(base));
  for (let i = 1; i <= days; i++) {
    const instant = new Date(base + i * 86_400_000);
    const offset = zoneOffsetMinutes(zone, instant);
    if (offset !== prev) {
      out.push({ date: plainDateInZone(instant, zone), fromOffset: prev, toOffset: offset });
      prev = offset;
    }
  }
  return out;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
