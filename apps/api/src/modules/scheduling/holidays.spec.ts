import { holidayOn, parseShiftRule, shiftedStartMinutes, type HolidayRow } from './holidays';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const row = (over: Partial<HolidayRow>): HolidayRow => ({
  id: 'h',
  name: 'x',
  type: 'HOLIDAY',
  startsOn: d('2026-12-24'),
  endsOn: d('2026-12-26'),
  shiftRule: null,
  ...over,
});

describe('holidays', () => {
  it('finds a holiday on its first, middle and last day, and not outside', () => {
    const list = [row({})];
    expect(holidayOn('2026-12-24', list)?.id).toBe('h');
    expect(holidayOn('2026-12-25', list)?.id).toBe('h');
    expect(holidayOn('2026-12-26', list)?.id).toBe('h');
    expect(holidayOn('2026-12-23', list)).toBeUndefined();
    expect(holidayOn('2026-12-27', list)).toBeUndefined();
  });

  it('a closure beats a Ramadan shift on the same date', () => {
    const list = [
      row({ id: 'r', type: 'RAMADAN_TIMETABLE', shiftRule: { shiftMinutes: -60 } }),
      row({ id: 'closed' }),
    ];
    expect(holidayOn('2026-12-25', list)?.id).toBe('closed');
  });

  it('parses only a usable shift rule', () => {
    expect(parseShiftRule({ shiftMinutes: -60, durationMinutes: 25 })).toEqual({
      shiftMinutes: -60,
      durationMinutes: 25,
    });
    expect(parseShiftRule({ durationMinutes: 20 })).toEqual({
      shiftMinutes: 0,
      durationMinutes: 20,
    });
    expect(parseShiftRule({})).toBeNull();
    expect(parseShiftRule(null)).toBeNull();
    expect(parseShiftRule({ shiftMinutes: 1.5 })).toBeNull();
  });

  it('keeps a shifted start inside the day', () => {
    expect(shiftedStartMinutes(16 * 60, -60)).toBe(15 * 60);
    expect(shiftedStartMinutes(30, -120)).toBe(0);
    expect(shiftedStartMinutes(23 * 60, 300)).toBe(24 * 60 - 1);
  });
});
