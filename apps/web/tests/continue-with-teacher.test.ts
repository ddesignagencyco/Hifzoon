import { describe, expect, it } from 'vitest';
import { formatClock, weekdayAndTime, weeklyOptions } from '@/lib/continue-with-teacher';

describe('continue with the trial teacher — weekly choices (FR-ADM-05)', () => {
  it('reads the weekday and clock time in the family zone', () => {
    // 12:00 UTC on Monday 2 Nov 2026 is 17:00 in Karachi.
    expect(weekdayAndTime('2026-11-02T12:00:00Z', 'Asia/Karachi')).toEqual({ weekday: 'MO', localTime: '17:00' });
    // 23:30 UTC Monday is already Tuesday in Karachi.
    expect(weekdayAndTime('2026-11-02T23:30:00Z', 'Asia/Karachi').weekday).toBe('TU');
  });

  it('offers each weekday + time once, only for the trial teacher, sorted', () => {
    const slots = [
      { teacherId: 't1', startsAt: '2026-11-02T13:00:00Z' },
      { teacherId: 't1', startsAt: '2026-11-02T12:00:00Z' },
      { teacherId: 't1', startsAt: '2026-11-09T12:00:00Z' }, // same Monday 17:00 a week later
      { teacherId: 't2', startsAt: '2026-11-03T12:00:00Z' }, // another teacher
    ];
    const options = weeklyOptions(slots, 't1', 'Asia/Karachi');
    expect([...options.keys()]).toEqual(['MO']);
    expect(options.get('MO')).toEqual(['17:00', '18:00']);
  });

  it('formats a 12-hour clock', () => {
    expect(formatClock('00:30')).toBe('12:30 am');
    expect(formatClock('12:00')).toBe('12:00 pm');
    expect(formatClock('17:05')).toBe('5:05 pm');
  });
});
