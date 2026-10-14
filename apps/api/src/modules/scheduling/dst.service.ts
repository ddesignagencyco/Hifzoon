import { DateTime, IANAZone } from 'luxon';

/**
 * Daylight-saving arithmetic for recurring classes (FR-SCH-01, FR-SCH-02, TRD
 * section 4.3).
 *
 * The rule the product agreed: a recurring class keeps its **local wall-clock time**.
 * A family in `Europe/London` booked for 16:00 keeps getting 16:00 local, which means
 * the UTC instant moves by an hour twice a year. Everything here exists to make that
 * shift explicit and testable rather than an emergent surprise.
 *
 * These are pure functions so DST behaviour can be unit tested without a database or a
 * clock — the TRD section 22 risk register calls out DST bugs specifically.
 */

export interface ZoneTransition {
  zone: string;
  /** Instant at which the offset changes. */
  at: Date;
  /** Offset before the change, minutes east of UTC. */
  offsetBeforeMinutes: number;
  /** Offset after the change. */
  offsetAfterMinutes: number;
  /** `offsetAfter - offsetBefore`: +60 for spring forward, -60 for fall back. */
  deltaMinutes: number;
  direction: 'FORWARD' | 'BACKWARD';
}

export interface LocalTimeSpec {
  /** `HH:mm` in the family's own wall clock. */
  localStartTime: string;
  /** Minutes from midnight, used for the arithmetic. */
  localStartMinutes: number;
  durationMinutes: number;
}

/** Validates an IANA zone name, returning false rather than throwing. */
export function isValidZone(zone: string): boolean {
  return IANAZone.isValidZone(zone);
}

/**
 * UTC offset of `zone` at `instant`, in minutes east of UTC.
 * Luxon's `offset()` already returns minutes, so no /60 bug to make.
 */
export function offsetAt(zone: string, instant: Date): number {
  if (!IANAZone.isValidZone(zone)) {
    throw new Error(`Unknown IANA time zone "${zone}"`);
  }
  return IANAZone.create(zone).offset(instant.getTime());
}

/**
 * Every offset change for `zone` between `from` and `to`.
 *
 * Resolution is one day, which is ample: no IANA zone changes its offset twice within
 * a day, and it keeps the scan cheap enough to run nightly over a 60 day horizon.
 */
export function transitionsIn(zone: string, from: Date, to: Date): ZoneTransition[] {
  if (!IANAZone.isValidZone(zone)) throw new Error(`Unknown IANA time zone "${zone}"`);

  const transitions: ZoneTransition[] = [];

  let cursor = DateTime.fromJSDate(from, { zone }).startOf('day');
  const end = DateTime.fromJSDate(to, { zone });

  while (cursor < end) {
    const next = cursor.plus({ days: 1 });
    const before = cursor.offset;
    const after = next.offset;

    if (after !== before) {
      const delta = after - before;
      // The change lands somewhere in the 24h window; narrow it to the exact hour by
      // bisection so the reported instant is usable for a precise clash check.
      const at = narrowTransition(zone, cursor.toJSDate(), next.toJSDate(), before);
      transitions.push({
        zone,
        at,
        offsetBeforeMinutes: before,
        offsetAfterMinutes: after,
        deltaMinutes: delta,
        direction: delta > 0 ? 'FORWARD' : 'BACKWARD',
      });
    }
    cursor = next;
  }

  return transitions;
}

function narrowTransition(zone: string, windowStart: Date, windowEnd: Date, before: number): Date {
  let low = windowStart.getTime();
  let high = windowEnd.getTime();

  while (high - low > 60_000) {
    const mid = Math.floor((low + high) / 2);
    const offset = offsetAt(zone, new Date(mid));
    if (offset === before) low = mid;
    else high = mid;
  }
  return new Date(high);
}

/**
 * The UTC instant for a local wall-clock time on a given calendar date.
 *
 * `endOfDay: 'earlier'` matters at the spring-forward boundary: on the day the UK
 * clocks go forward, local 01:30 does not exist, and luxon will otherwise jump the
 * session to 02:30 — silently moving a child's class. Returning the *earlier* valid
 * instant keeps the session on the day the family booked it; the DST warning surfaces
 * the change so staff can re-agree a time with the family.
 */
export function instantForLocalTime(
  zone: string,
  date: DateTime,
  localStartMinutes: number,
  durationMinutes: number,
): { startsAt: Date; endsAt: Date; shiftedByDst: boolean; resolvedWallClock: string } {
  const hours = Math.floor(localStartMinutes / 60);
  const minutes = localStartMinutes % 60;

  const local = date
    .setZone(zone, { keepLocalTime: false })
    .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

  const startsAt = local.toUTC().toJSDate();
  const resolvedWallClock = DateTime.fromJSDate(startsAt, { zone }).toFormat('HH:mm');

  // A wall-clock time either exists on that date or it does not. On a spring-forward
  // day, local 01:30 never happens and luxon rolls it to 02:30; on a fall-back day
  // 01:30 happens twice and luxon picks the first. Round-tripping the resulting
  // instant back to a wall clock is the only reliable way to notice — comparing
  // offsets would report a shift for every zone that is not UTC.
  const shiftedByDst = !local.isValid || resolvedWallClock !== `${pad(hours)}:${pad(minutes)}`;

  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    shiftedByDst,
    resolvedWallClock,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar dates a recurrence covers between two UTC instants. */
export function localDatesBetween(zone: string, from: Date, to: Date): DateTime[] {
  const start = DateTime.fromJSDate(from, { zone }).startOf('day');
  const end = DateTime.fromJSDate(to, { zone }).startOf('day');
  const dates: DateTime[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    dates.push(d);
  }
  return dates;
}

export interface ClashReport {
  sessionId: string;
  familyZone: string;
  teacherZone: string;
  transitionAt: Date;
  /** UTC instant the session lands on once the offset change is applied. */
  recomputedStart: Date;
  reason: string;
}

/**
 * Finds already-materialised sessions whose *rendered* local time changes because a
 * DST transition falls within `lookAheadDays` after them.
 *
 * This is the failure mode worth warning about, and it is not the obvious one:
 * materialisation recomputes each occurrence from the wall clock, so a session booked
 * for "Tuesday 16:00 London" is stored correctly either side of a transition. What
 * breaks is the session that was *already written* — the family agreed 16:00 with the
 * teacher, the row holds a fixed UTC instant, and after the clocks change that same
 * instant renders as 15:00 to the family and a different hour to the teacher.
 *
 * The corrected instant for the same wall clock is `startsAt - deltaMinutes`: a spring
 * forward moves the local time an hour earlier in UTC terms, a fall back an hour later.
 */
export function findDstClashes(input: {
  sessions: Array<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    familyZone: string;
    teacherZone: string;
  }>;
  windowFrom: Date;
  windowTo: Date;
  lookAheadDays?: number;
}): ClashReport[] {
  const reports: ClashReport[] = [];
  const lookAhead = (input.lookAheadDays ?? 14) * 86_400_000;

  const allZones = new Set(input.sessions.flatMap((s) => [s.familyZone, s.teacherZone]));
  const transitionsByZone = new Map<string, ZoneTransition[]>();

  for (const zone of allZones) {
    if (!IANAZone.isValidZone(zone)) continue;
    transitionsByZone.set(
      zone,
      // Look far enough past each session to catch a transition up to `lookAhead` later.
      transitionsIn(zone, input.windowFrom, new Date(input.windowTo.getTime() + lookAhead)),
    );
  }

  for (const session of input.sessions) {
    const familyTransitions = (transitionsByZone.get(session.familyZone) ?? []).filter(
      (t) => t.at > session.startsAt && t.at <= new Date(session.startsAt.getTime() + lookAhead),
    );

    for (const transition of familyTransitions) {
      const teacherMovesTogether = (transitionsByZone.get(session.teacherZone) ?? []).some(
        (t) =>
          t.deltaMinutes === transition.deltaMinutes &&
          Math.abs(t.at.getTime() - transition.at.getTime()) < 36_00_000,
      );

      const localBefore = DateTime.fromJSDate(session.startsAt, { zone: session.familyZone });
      const recomputed = new Date(session.startsAt.getTime() - transition.deltaMinutes * 60_000);

      reports.push({
        sessionId: session.id,
        familyZone: session.familyZone,
        teacherZone: session.teacherZone,
        transitionAt: transition.at,
        recomputedStart: recomputed,
        reason:
          `${localBefore.toFormat('ccc HH:mm')} in ${session.familyZone} becomes ` +
          `${DateTime.fromJSDate(recomputed, { zone: session.familyZone }).toFormat('HH:mm')} after the ` +
          `${transition.direction === 'FORWARD' ? 'spring forward' : 'fall back'} on ` +
          `${transition.at.toISOString().slice(0, 10)}` +
          (teacherMovesTogether
            ? " (the teacher's zone shifts at the same moment)"
            : `, while ${session.teacherZone} does not — re-agree the time`),
      });
    }
  }

  return reports;
}
