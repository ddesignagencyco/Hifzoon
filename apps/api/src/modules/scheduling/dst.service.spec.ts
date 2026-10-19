import { DateTime } from 'luxon';

import {
  availabilityWarnings,
  findDstClashes,
  instantForLocalTime,
  offsetAt,
  transitionsIn,
} from './dst.service';

/**
 * FR-SCH-02 — a recurring class keeps its local wall-clock time across a DST change.
 * These are the cases that silently break schedules if the arithmetic is wrong.
 */
describe('DST handling for recurring classes (FR-SCH-02)', () => {
  describe('offsetAt', () => {
    it('reports the standard-time offset for Europe/London in January', () => {
      expect(offsetAt('Europe/London', new Date('2026-01-15T12:00:00Z'))).toBe(0);
    });

    it('reports the summer-time offset for Europe/London in July', () => {
      expect(offsetAt('Europe/London', new Date('2026-07-15T12:00:00Z'))).toBe(60);
    });

    it('reports the half-hour offset for Asia/Karachi', () => {
      expect(offsetAt('Asia/Karachi', new Date('2026-01-15T12:00:00Z'))).toBe(300);
    });

    it('rejects an unknown zone rather than silently returning the server offset', () => {
      expect(() => offsetAt('Mars/Olympus', new Date())).toThrow(/Unknown IANA time zone/);
    });
  });

  describe('transitionsIn', () => {
    it('finds the UK spring-forward transition and its 60 minute delta', () => {
      const transitions = transitionsIn(
        'Europe/London',
        new Date('2026-03-01T00:00:00Z'),
        new Date('2026-04-01T00:00:00Z'),
      );

      expect(transitions).toHaveLength(1);
      expect(transitions[0].direction).toBe('FORWARD');
      expect(transitions[0].deltaMinutes).toBe(60);
      // Last Sunday of March 2026 is the 29th; the change happens at 01:00 UTC.
      expect(transitions[0].at.toISOString().slice(0, 10)).toBe('2026-03-29');
    });

    it('finds the UK fall-back transition with a -60 minute delta', () => {
      const transitions = transitionsIn(
        'Europe/London',
        new Date('2026-10-01T00:00:00Z'),
        new Date('2026-11-15T00:00:00Z'),
      );

      expect(transitions).toHaveLength(1);
      expect(transitions[0].direction).toBe('BACKWARD');
      expect(transitions[0].deltaMinutes).toBe(-60);
      expect(transitions[0].at.toISOString().slice(0, 10)).toBe('2026-10-25');
    });

    it('reports no transitions for a zone that never shifts', () => {
      const transitions = transitionsIn(
        'Asia/Karachi',
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-12-01T00:00:00Z'),
      );
      expect(transitions).toHaveLength(0);
    });

    it('reports two transitions across a full year in the US', () => {
      const transitions = transitionsIn(
        'America/New_York',
        new Date('2026-01-01T00:00:00Z'),
        new Date('2027-01-01T00:00:00Z'),
      );
      expect(transitions).toHaveLength(2);
      expect(transitions.map((t) => t.direction)).toEqual(['FORWARD', 'BACKWARD']);
    });
  });

  describe('instantForLocalTime', () => {
    it('maps a London 16:00 local time to the right UTC instant in winter (GMT)', () => {
      const date = DateTime.fromISO('2026-01-13', { zone: 'Europe/London' });
      const result = instantForLocalTime('Europe/London', date, 16 * 60, 30);

      expect(result.resolvedWallClock).toBe('16:00');
      expect(result.startsAt.toISOString()).toBe('2026-01-13T16:00:00.000Z');
      expect(result.endsAt.toISOString()).toBe('2026-01-13T16:30:00.000Z');
    });

    it('maps the same London 16:00 local time one hour earlier in UTC in summer (BST)', () => {
      const date = DateTime.fromISO('2026-06-16', { zone: 'Europe/London' });
      const result = instantForLocalTime('Europe/London', date, 16 * 60, 30);

      // Same wall-clock time, different instant — this is exactly what "keep the local
      // time" means, and the reason a naive UTC-stored schedule drifts by an hour.
      expect(result.resolvedWallClock).toBe('16:00');
      expect(result.startsAt.toISOString()).toBe('2026-06-16T15:00:00.000Z');
    });

    it('keeps a Karachi 19:00 class at 14:00 UTC all year (no DST in PK)', () => {
      const winter = instantForLocalTime(
        'Asia/Karachi',
        DateTime.fromISO('2026-01-13', { zone: 'Asia/Karachi' }),
        19 * 60,
        45,
      );
      const summer = instantForLocalTime(
        'Asia/Karachi',
        DateTime.fromISO('2026-06-16', { zone: 'Asia/Karachi' }),
        19 * 60,
        45,
      );

      expect(winter.startsAt.toISOString()).toBe('2026-01-13T14:00:00.000Z');
      expect(summer.startsAt.toISOString()).toBe('2026-06-16T14:00:00.000Z');
      expect(winter.shiftedByDst).toBe(false);
      expect(summer.shiftedByDst).toBe(false);
    });
  });

  describe('findDstClashes', () => {
    const window = {
      windowFrom: new Date('2026-10-01T00:00:00Z'),
      windowTo: new Date('2026-10-24T00:00:00Z'),
    };

    it("flags a class whose rendered time changes when only the family's zone shifts", () => {
      // Booked Tuesday 20 October at 16:00 London (GMT, so 16:00Z). The UK falls back
      // on 25 October; after that, the *same* 16:00Z instant renders as 15:00 to the
      // family. The teacher in Karachi is unaffected, so nobody agreed to this.
      const reports = findDstClashes({
        sessions: [
          {
            id: 'class-london-family-pakistani-teacher',
            startsAt: new Date('2026-10-20T16:00:00Z'),
            endsAt: new Date('2026-10-20T16:30:00Z'),
            familyZone: 'Europe/London',
            teacherZone: 'Asia/Karachi',
          },
        ],
        ...window,
      });

      expect(reports).toHaveLength(1);
      expect(reports[0].sessionId).toBe('class-london-family-pakistani-teacher');
      // Same wall clock (16:00) now needs to be an hour later in UTC after the clocks
      // go back: 16:00Z → 17:00Z, i.e. startsAt - deltaMinutes where delta is -60.
      expect(reports[0].recomputedStart.toISOString()).toBe('2026-10-20T17:00:00.000Z');
      expect(reports[0].reason).toContain('Europe/London');
    });

    it("notes when the teacher's zone shifts at the same moment", () => {
      const reports = findDstClashes({
        sessions: [
          {
            id: 'both-europe',
            startsAt: new Date('2026-10-20T16:00:00Z'),
            endsAt: new Date('2026-10-20T16:30:00Z'),
            familyZone: 'Europe/London',
            teacherZone: 'Europe/Paris',
          },
        ],
        ...window,
      });

      expect(reports).toHaveLength(1);
      expect(reports[0].reason).toContain('shifts at the same moment');
    });

    it('does not flag a session with no transition inside the look-ahead', () => {
      const reports = findDstClashes({
        sessions: [
          {
            id: 'far-from-transition',
            startsAt: new Date('2026-10-01T16:00:00Z'),
            endsAt: new Date('2026-10-01T16:30:00Z'),
            familyZone: 'Europe/London',
            teacherZone: 'Asia/Karachi',
          },
        ],
        ...window,
        lookAheadDays: 14,
      });

      // The 25 October change is 24 days after 1 October — outside the look-ahead.
      expect(reports).toHaveLength(0);
    });

    it('ignores sessions outside the window', () => {
      const reports = findDstClashes({
        sessions: [
          {
            id: 'far-future',
            startsAt: new Date('2026-12-20T16:00:00Z'),
            endsAt: new Date('2026-12-20T16:30:00Z'),
            familyZone: 'Europe/London',
            teacherZone: 'Asia/Karachi',
          },
        ],
        ...window,
      });

      expect(reports).toHaveLength(0);
    });

    it('ignores a zone with no transitions at all', () => {
      const reports = findDstClashes({
        sessions: [
          {
            id: 'karachi-only',
            startsAt: new Date('2026-10-20T14:00:00Z'),
            endsAt: new Date('2026-10-20T14:30:00Z'),
            familyZone: 'Asia/Karachi',
            teacherZone: 'Asia/Karachi',
          },
        ],
        ...window,
      });

      expect(reports).toHaveLength(0);
    });

    it('computes the spring-forward shift in the other direction', () => {
      const reports = findDstClashes({
        sessions: [
          {
            id: 'spring',
            startsAt: new Date('2026-03-24T16:00:00Z'),
            endsAt: new Date('2026-03-24T16:30:00Z'),
            familyZone: 'Europe/London',
            teacherZone: 'Asia/Karachi',
          },
        ],
        windowFrom: new Date('2026-03-01T00:00:00Z'),
        windowTo: new Date('2026-03-29T00:00:00Z'),
      });

      expect(reports).toHaveLength(1);
      // Clock goes forward on 29 March: 16:00 local will then be 15:00Z, an hour
      // *earlier* than the stored instant.
      expect(reports[0].recomputedStart.toISOString()).toBe('2026-03-24T15:00:00.000Z');
    });
  });
});

describe('availabilityWarnings (M14)', () => {
  const NOW = new Date('2026-03-01T00:00:00Z');
  // Sunday 29 March 2026: UK clocks go forward at 01:00 UTC, so local 01:00-02:00 is skipped.
  // Sunday 25 October 2026: they go back, so local 01:00-02:00 happens twice.

  it('warns that a zone is about to change its offset, with the date and direction', () => {
    const [warning] = availabilityWarnings({
      zone: 'Europe/London',
      slots: [],
      now: NOW,
      horizonDays: 60,
    });

    expect(warning).toMatchObject({
      type: 'ZONE_OFFSET_CHANGE',
      zone: 'Europe/London',
      direction: 'FORWARD',
      deltaMinutes: 60,
    });
    expect(warning.at).toBe('2026-03-29T01:00:00.000Z');
    expect(warning.message).toContain('29 Mar 2026');
  });

  it('flags a weekly window that sits on the skipped hour', () => {
    const warnings = availabilityWarnings({
      zone: 'Europe/London',
      slots: [{ weekday: 0, startTime: '00:30', endTime: '01:30' }],
      now: NOW,
      horizonDays: 60,
    });

    expect(warnings.map((w) => w.type)).toEqual(['ZONE_OFFSET_CHANGE', 'SLOT_AFFECTED']);
    expect(warnings[1].message).toContain('skipped');
  });

  it('flags a window on the repeated hour when the clocks go back', () => {
    const warnings = availabilityWarnings({
      zone: 'Europe/London',
      slots: [{ weekday: 0, startTime: '01:15', endTime: '01:45' }],
      now: new Date('2026-10-01T00:00:00Z'),
      horizonDays: 60,
    });

    const affected = warnings.find((w) => w.type === 'SLOT_AFFECTED');
    expect(affected?.direction).toBe('BACKWARD');
    expect(affected?.message).toContain('repeated');
  });

  it('does not flag a window that is clear of the changed hour, or on another weekday', () => {
    const warnings = availabilityWarnings({
      zone: 'Europe/London',
      slots: [
        { weekday: 0, startTime: '16:00', endTime: '18:00' },
        { weekday: 3, startTime: '01:00', endTime: '02:00' },
      ],
      now: NOW,
      horizonDays: 60,
    });

    expect(warnings.map((w) => w.type)).toEqual(['ZONE_OFFSET_CHANGE']);
  });

  it('does not flag a window that starts exactly when the skipped hour ends', () => {
    const warnings = availabilityWarnings({
      zone: 'Europe/London',
      slots: [{ weekday: 0, startTime: '02:00', endTime: '03:00' }],
      now: NOW,
      horizonDays: 60,
    });

    expect(warnings.map((w) => w.type)).toEqual(['ZONE_OFFSET_CHANGE']);
  });

  it('has nothing to say about a zone without daylight saving', () => {
    expect(
      availabilityWarnings({
        zone: 'Asia/Karachi',
        slots: [{ weekday: 0, startTime: '01:00', endTime: '02:00' }],
        now: NOW,
        horizonDays: 365,
      }),
    ).toEqual([]);
  });
});
