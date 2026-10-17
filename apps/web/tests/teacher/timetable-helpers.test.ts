import { describe, expect, it } from 'vitest';
import { formatDuration, relativeStart } from '@/components/teacher/TimetableScreen';

describe('teacher timetable helpers', () => {
  it('formats teaching time', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(150)).toBe('2 h 30 min');
  });

  it('describes when the next class starts', () => {
    const start = '2026-10-19T16:00:00Z';
    const end = '2026-10-19T16:30:00Z';
    const t = Date.parse(start);
    expect(relativeStart(start, end, t - 5 * 60_000)).toBe('in 5 min');
    expect(relativeStart(start, end, t - 130 * 60_000)).toBe('in 2 h 10 min');
    expect(relativeStart(start, end, t + 10 * 60_000)).toBe('now');
    expect(relativeStart(start, end, t - 3 * 24 * 60 * 60_000)).toBe('in 3 days');
  });
});
