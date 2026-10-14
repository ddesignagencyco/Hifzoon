import { DateTime } from 'luxon';

/**
 * Minimal but correct RRULE support for recurring classes (FR-SCH-02).
 *
 * Only the subset an academy actually books with is accepted — weekly and daily
 * cadence, BYDAY, interval, UNTIL/COUNT, EXDATE — and everything else is rejected at
 * write time rather than silently ignored. An RRULE parser that understands less than
 * it accepts is how classes end up on the wrong day for a year.
 *
 * RFC 5545 weekdays are numbered Mon=1 … Sun=0; luxon uses Mon=1 … Sun=7.
 */

export interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY';
  interval: number;
  byDay: number[];
  until?: DateTime;
  count?: number;
}

export class UnsupportedRecurrenceError extends Error {}

/**
 * RFC 5545 spells weekdays as two letters: SU=0 … SA=6. Luxon numbers them Mon=1 …
 * Sun=7, which is why the conversion is not the identity.
 */
const RFC5545_WEEKDAYS: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7> = {
  SU: 7,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * Parses an RRULE. `anchor` is the first occurrence in the family's local time and
 * supplies the time-of-day and the default weekday.
 */
export function parseRRule(rrule: string, anchor: DateTime): RecurrenceRule {
  const normalised = rrule.trim().replace(/^RRULE:/i, '');
  const parts = normalised.split(';').filter(Boolean);
  const map = new Map<string, string>();

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || value === undefined)
      throw new UnsupportedRecurrenceError(`Malformed RRULE part "${part}"`);
    map.set(key.trim().toUpperCase(), value.trim());
  }

  const freq = map.get('FREQ')?.toUpperCase();
  if (freq !== 'WEEKLY' && freq !== 'DAILY') {
    throw new UnsupportedRecurrenceError(
      `Only FREQ=WEEKLY and FREQ=DAILY are supported; got "${freq ?? '(missing)'}"`,
    );
  }

  const interval = Number(map.get('INTERVAL') ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
    throw new UnsupportedRecurrenceError('INTERVAL must be an integer between 1 and 12');
  }

  const byDay = (map.get('BYDAY') ?? '')
    .split(',')
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean)
    .map((token) => {
      // Reject an ordinal prefix (e.g. "2MO") rather than silently reading it as MO:
      // nth-weekday rules are not supported and would book the wrong week.
      if (!/^(SU|MO|TU|WE|TH|FR|SA)$/.test(token)) {
        throw new UnsupportedRecurrenceError(
          `Invalid BYDAY token "${token}" — expected two letters from SU, MO, TU, WE, TH, FR, SA`,
        );
      }
      return RFC5545_WEEKDAYS[token];
    });

  const until = map.get('UNTIL') ? parseUntil(map.get('UNTIL')!, anchor) : undefined;
  const count = map.get('COUNT') ? Number(map.get('COUNT')) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    throw new UnsupportedRecurrenceError('COUNT must be a positive integer');
  }

  return {
    freq,
    interval,
    byDay: byDay.length > 0 ? byDay : freq === 'WEEKLY' ? [anchor.weekday] : [],
    until,
    count,
  };
}

function parseUntil(value: string, anchor: DateTime): DateTime {
  // UNTIL may be a floating local time (20260401T160000) or UTC with a Z suffix.
  if (/Z$/.test(value)) {
    return DateTime.fromISO(value, { zone: 'utc' }).toUTC();
  }
  const basic = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/.exec(value);
  if (!basic) throw new UnsupportedRecurrenceError(`Unparseable UNTIL "${value}"`);
  const [, y, m, d, hh = '00', mm = '00', ss = '00'] = basic;
  return DateTime.fromObject(
    {
      year: Number(y),
      month: Number(m),
      day: Number(d),
      hour: Number(hh),
      minute: Number(mm),
      second: Number(ss),
    },
    { zone: anchor.zoneName ?? 'UTC' },
  );
}

/**
 * Expands a rule into local wall-clock occurrences.
 *
 * Expansion happens in the family's zone and conversion to UTC happens afterwards.
 * That ordering is the whole point: it is what keeps "16:00 every Tuesday" at 16:00
 * after a DST change instead of drifting to 15:00 or 17:00 (FR-SCH-02).
 */
export function expandRecurrence(input: {
  rule: RecurrenceRule;
  anchor: DateTime;
  from: DateTime;
  to: DateTime;
  exdates?: DateTime[];
  maxOccurrences?: number;
}): DateTime[] {
  const { rule, anchor, from, to } = input;
  const limit = input.maxOccurrences ?? 400;
  const excluded = new Set((input.exdates ?? []).map((d) => d.toFormat("yyyyLLdd'T'HHmm")));

  const occurrences: DateTime[] = [];
  const timeOfDay = {
    hour: anchor.hour,
    minute: anchor.minute,
    second: anchor.second,
    millisecond: 0,
  };
  const hardStop = rule.count ? anchor.startOf('day').plus({ days: 4000 }) : (rule.until ?? to);

  let emitted = 0;
  let cursor = anchor.startOf('day');
  let guard = 0;

  while (cursor <= to && occurrences.length < limit && guard < 5_000) {
    guard += 1;

    const matches =
      rule.freq === 'DAILY'
        ? isOnInterval(cursor, anchor.startOf('day'), rule.interval)
        : rule.byDay.includes(cursor.weekday) &&
          isOnInterval(cursor.startOf('week'), anchor.startOf('week'), rule.interval);

    if (matches) {
      const occurrence = cursor.set(timeOfDay);
      if (occurrence >= anchor && occurrence <= hardStop) {
        emitted += 1;
        if (rule.count && emitted > rule.count) break;
        const key = occurrence.toFormat("yyyyLLdd'T'HHmm");
        if (!excluded.has(key) && occurrence >= from && occurrence <= to) {
          occurrences.push(occurrence);
        }
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  return occurrences;
}

function isOnInterval(value: DateTime, anchor: DateTime, interval: number): boolean {
  const days = Math.round(value.startOf('day').diff(anchor.startOf('day'), 'days').days);
  return days >= 0 && days % interval === 0;
}

/** Renders a rule back to RRULE text for storage. */
export function formatRRule(
  rule: Omit<RecurrenceRule, 'until'> & { until?: DateTime | string; count?: number },
): string {
  const parts = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`];
  if (rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.map(toRfc5545Weekday).join(',')}`);
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until)
    parts.push(`UNTIL=${formatUntil(typeof rule.until === 'string' ? rule.until : rule.until)}`);
  return parts.join(';');
}

function formatUntil(until: string | DateTime): string {
  if (typeof until === 'string') return until;
  return until.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/** Renders a luxon weekday back to its RFC 5545 two-letter code. */
function toRfc5545Weekday(weekday: number): string {
  const table: Record<number, string> = {
    1: 'MO',
    2: 'TU',
    3: 'WE',
    4: 'TH',
    5: 'FR',
    6: 'SA',
    7: 'SU',
  };
  const code = table[weekday];
  if (!code)
    throw new UnsupportedRecurrenceError(`Cannot render weekday "${weekday}" as an RRULE BYDAY`);
  return code;
}
