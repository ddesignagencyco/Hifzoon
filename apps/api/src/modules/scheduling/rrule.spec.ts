import { DateTime } from 'luxon';

import { UnsupportedRecurrenceError, expandRecurrence, formatRRule, parseRRule } from './rrule';

const LONDON = 'Europe/London';

describe('RRULE expansion for class schedules (FR-SCH-02)', () => {
  const anchor = DateTime.fromISO('2026-01-06T16:00', { zone: LONDON }); // a Tuesday, 16:00 local

  describe('parseRRule', () => {
    it('parses a weekly rule with BYDAY', () => {
      const rule = parseRRule('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH', anchor);

      expect(rule.freq).toBe('WEEKLY');
      expect(rule.interval).toBe(1);
      // RFC 5545: TU=2, TH=4, which maps to the same luxon weekdays.
      expect(rule.byDay).toEqual([2, 4]);
    });

    it('defaults to the anchor weekday when BYDAY is omitted', () => {
      const rule = parseRRule('FREQ=WEEKLY', anchor);
      expect(rule.byDay).toEqual([anchor.weekday]);
    });

    it('maps RFC 5545 SU=0 onto luxon Sunday=7', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=SU', anchor);
      expect(rule.byDay).toEqual([7]);
    });

    it('accepts a leading RRULE: prefix', () => {
      expect(parseRRule('RRULE:FREQ=DAILY;INTERVAL=2', anchor).freq).toBe('DAILY');
    });

    it('parses UNTIL as a floating local time in the anchor zone', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260331T160000', anchor);
      // 31 March 2026 is after the 29 March BST switch, so the anchor zone is +01:00 —
      // which is exactly why a floating UNTIL must be interpreted in the family zone.
      expect(rule.until?.toISO()).toBe('2026-03-31T16:00:00.000+01:00');
      expect(rule.until?.zoneName).toBe('Europe/London');
    });

    it('parses UNTIL with a Z suffix as UTC', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260331T160000Z', anchor);
      expect(rule.until?.zoneName).toBe('UTC');
    });

    it('rejects FREQ=MONTHLY rather than silently ignoring it', () => {
      expect(() => parseRRule('FREQ=MONTHLY', anchor)).toThrow(UnsupportedRecurrenceError);
    });

    it('rejects a malformed INTERVAL', () => {
      expect(() => parseRRule('FREQ=WEEKLY;INTERVAL=0', anchor)).toThrow(/INTERVAL/);
      expect(() => parseRRule('FREQ=WEEKLY;INTERVAL=99', anchor)).toThrow(/INTERVAL/);
    });

    it('rejects an invalid BYDAY token', () => {
      expect(() => parseRRule('FREQ=WEEKLY;BYDAY=XX', anchor)).toThrow(/BYDAY/);
    });

    it('rejects a COUNT of zero', () => {
      expect(() => parseRRule('FREQ=WEEKLY;COUNT=0', anchor)).toThrow(/COUNT/);
    });
  });

  describe('expandRecurrence', () => {
    it('keeps the local wall-clock time across the UK spring-forward change', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-03-17T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-04-07T00:00', { zone: LONDON }),
      });

      // Every occurrence is 16:00 in the family's zone — the whole point of the rule.
      expect(occurrences.map((o) => o.toFormat('HH:mm'))).toEqual(['16:00', '16:00', '16:00']);

      // Tuesdays are 17, 24 and 31 March. BST starts on 29 March, so only the last one
      // moves an hour earlier in UTC terms while staying 16:00 for the family..toISO()!.slice(11, 16))).toEqual(['16:00', '16:00', '15:00']);
    });

    it('expands two weekdays a week', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU,TH', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-02-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-02-15T00:00', { zone: LONDON }),
      });

      expect(occurrences.map((o) => o.toFormat('ccc'))).toEqual(['Tue', 'Thu', 'Tue', 'Thu']);
    });

    it('honours INTERVAL=2 (fortnightly)', () => {
      const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-01-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-02-15T00:00', { zone: LONDON }),
      });

      expect(occurrences.map((o) => o.toFormat('dd LLL'))).toEqual(['06 Jan', '20 Jan', '03 Feb']);
    });

    it('honours INTERVAL=3 for a daily rule', () => {
      const rule = parseRRule('FREQ=DAILY;INTERVAL=3', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-01-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-02-01T00:00', { zone: LONDON }),
      });

      expect(occurrences.map((o) => o.toFormat('dd'))).toEqual([
        '06',
        '09',
        '12',
        '15',
        '18',
        '21',
        '24',
        '27',
        '30',
      ]);
    });

    it('stops at COUNT', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU;COUNT=3', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-01-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-06-01T00:00', { zone: LONDON }),
      });

      expect(occurrences).toHaveLength(3);
      expect(occurrences.at(-1)?.toFormat('dd LLL')).toBe('20 Jan');
    });

    it('stops at UNTIL', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260127T160000', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-01-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-06-01T00:00', { zone: LONDON }),
      });

      expect(occurrences).toHaveLength(4); // 6, 13, 20, 27 January
    });

    it('skips EXDATE occurrences (a one-off public holiday)', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-01-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-02-01T00:00', { zone: LONDON }),
        exdates: [DateTime.fromISO('2026-01-13T16:00', { zone: LONDON })],
      });

      expect(occurrences.map((o) => o.toFormat('dd'))).toEqual(['06', '20', '27']);
    });

    it('returns only occurrences inside the requested window', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2026-02-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2026-02-15T00:00', { zone: LONDON }),
      });

      expect(occurrences).toHaveLength(2);
    });

    it('caps output at maxOccurrences so a bad range cannot run away', () => {
      const rule = parseRRule('FREQ=DAILY', anchor);
      const occurrences = expandRecurrence({
        rule,
        anchor,
        from: DateTime.fromISO('2020-01-01T00:00', { zone: LONDON }),
        to: DateTime.fromISO('2030-01-01T00:00', { zone: LONDON }),
        maxOccurrences: 25,
      });

      expect(occurrences).toHaveLength(25);
    });
  });

  describe('formatRRule', () => {
    it('round-trips a rule through parse and format', () => {
      const parsed = parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', anchor);
      const text = formatRRule(parsed);

      expect(text).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH');
      expect(parseRRule(text, anchor)).toEqual(parsed);
    });
  });
});
