import { describe, expect, it } from 'vitest';
import { lessonCardHref, recentCompletedClasses } from '@/lib/api/modules/teacher-schedule';

describe('Recent classes on Today', () => {
  it('lists completed classes before now, newest first', () => {
    const now = Date.parse('2026-10-19T12:00:00.000Z');
    const rows = [
      { id: 'a', status: 'COMPLETED', startsAt: '2026-10-17T09:00:00.000Z' },
      { id: 'b', status: 'CANCELLED', startsAt: '2026-10-18T09:00:00.000Z' },
      { id: 'c', status: 'COMPLETED', startsAt: '2026-10-19T08:00:00.000Z' },
      { id: 'd', status: 'SCHEDULED', startsAt: '2026-10-19T15:00:00.000Z' },
    ] as const;
    expect(recentCompletedClasses(rows, now).map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('links to the lesson-card composer', () => {
    expect(lessonCardHref('cls 1')).toBe('/teacher/classroom/cls%201/lesson-card');
  });
});
