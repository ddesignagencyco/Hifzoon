import { describe, it, expect } from 'vitest';
import {
  addDays,
  formatOffset,
  plainDateInZone,
  splitInZone,
  startOfWeek,
  upcomingTransitions,
  weekdayOf,
  zonedTimeToUtc,
  zoneOffsetMinutes,
} from '@/components/teacher/zoned-time';
import { serialiseAvailability, validateAvailability, AvailabilityRow } from '@/components/teacher/availability-form';

const row = (key: string, weekday: number, startTime: string, endTime: string): AvailabilityRow => ({ key, weekday, startTime, endTime });

describe('zoned time helpers', () => {
  it('computes offsets across the UK clock change', () => {
    expect(zoneOffsetMinutes('Europe/London', new Date('2026-10-20T12:00:00Z'))).toBe(60);
    expect(zoneOffsetMinutes('Europe/London', new Date('2026-10-26T12:00:00Z'))).toBe(0);
    expect(zoneOffsetMinutes('UTC', new Date())).toBe(0);
  });

  it('converts local wall-clock time to UTC on either side of DST', () => {
    expect(zonedTimeToUtc('2026-10-20', '16:00', 'Europe/London').toISOString()).toBe('2026-10-20T15:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-27', '16:00', 'Europe/London').toISOString()).toBe('2026-10-27T16:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-20', '09:30', 'Asia/Karachi').toISOString()).toBe('2026-10-20T04:30:00.000Z');
  });

  it('splits an instant into local date and time', () => {
    expect(splitInZone('2026-10-20T23:30:00Z', 'Asia/Karachi')).toEqual({ date: '2026-10-21', time: '04:30' });
    expect(plainDateInZone(new Date('2026-10-20T23:30:00Z'), 'America/New_York')).toBe('2026-10-20');
  });

  it('does plain-date arithmetic and finds Monday', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekdayOf('2026-10-15')).toBe(4);
    expect(startOfWeek('2026-10-15')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });

  it('lists upcoming DST transitions and none for UTC', () => {
    const t = upcomingTransitions('Europe/London', new Date('2026-10-15T09:00:00Z'));
    expect(t[0]).toEqual({ date: '2026-10-25', fromOffset: 60, toOffset: 0 });
    expect(t[1]).toMatchObject({ date: '2027-03-28', fromOffset: 0, toOffset: 60 });
    expect(upcomingTransitions('UTC', new Date('2026-10-15T00:00:00Z'))).toEqual([]);
    expect(formatOffset(60)).toBe('UTC+1');
    expect(formatOffset(-330)).toBe('UTC−5:30');
  });
});

describe('availability validation and serialisation', () => {
  it('accepts touching ranges and sorts to the DTO shape', () => {
    const rows = [row('a', 1, '18:00', '20:00'), row('b', 1, '16:00', '18:00'), row('c', 0, '10:00', '11:00')];
    expect(validateAvailability(rows).valid).toBe(true);
    expect(serialiseAvailability(rows)).toEqual({
      slots: [
        { weekday: 0, startTime: '10:00', endTime: '11:00' },
        { weekday: 1, startTime: '16:00', endTime: '18:00' },
        { weekday: 1, startTime: '18:00', endTime: '20:00' },
      ],
    });
  });

  it('flags end before start, bad times and overlaps on the same day only', () => {
    const v = validateAvailability([
      row('a', 2, '16:00', '18:00'),
      row('b', 2, '17:30', '19:00'),
      row('c', 3, '17:30', '19:00'),
      row('d', 4, '12:00', '11:00'),
      row('e', 5, '24:00', '25:00'),
    ]);
    expect(v.valid).toBe(false);
    expect(v.rowErrors.b).toMatch(/Overlaps 16:00–18:00/);
    expect(v.rowErrors.c).toBeUndefined();
    expect(v.rowErrors.d).toMatch(/after the start/);
    expect(v.rowErrors.e).toMatch(/HH:mm/);
  });

  it('requires at least one slot and an ordered effective range', () => {
    expect(validateAvailability([]).formError).toMatch(/at least one/);
    const v = validateAvailability([row('a', 1, '09:00', '10:00')], { from: '2026-11-10', to: '2026-11-01' });
    expect(v.formError).toMatch(/Effective until/);
    expect(serialiseAvailability([row('a', 1, '09:00', '10:00')], { from: '2026-11-01' })).toEqual({
      slots: [{ weekday: 1, startTime: '09:00', endTime: '10:00' }],
      effectiveFrom: '2026-11-01',
    });
  });
});
