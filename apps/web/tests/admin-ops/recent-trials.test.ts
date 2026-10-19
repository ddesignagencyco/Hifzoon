import { describe, expect, it } from 'vitest';
import { recentTrialClasses, TimetableEntry } from '@/lib/api/modules/scheduling-admin';

function entry(id: string, type: string, status: string, startsAt: string): TimetableEntry {
  return {
    id,
    type,
    status,
    startsAt,
    endsAt: startsAt,
    roomId: null,
    course: { name: 'Hifz programme', code: 'HIFZ' },
    students: [{ student: { id: 's1', displayName: 'Maryam' } }],
    localStart: startsAt,
    localEnd: startsAt,
    viewerZone: 'UTC',
  };
}

describe('Recent trial classes (stopgap for M22)', () => {
  it('keeps past, not-cancelled trials across teachers, newest first, once each', () => {
    const now = Date.parse('2026-10-19T12:00:00.000Z');
    const rows = recentTrialClasses(
      [
        {
          teacherId: 'tp-1',
          teacherName: 'Ustadh Bilal',
          entries: [
            entry('t1', 'TRIAL', 'COMPLETED', '2026-10-15T09:00:00.000Z'),
            entry('r1', 'REGULAR', 'COMPLETED', '2026-10-16T09:00:00.000Z'),
            entry('t2', 'TRIAL', 'CANCELLED_FAMILY', '2026-10-17T09:00:00.000Z'),
            entry('t3', 'TRIAL', 'SCHEDULED', '2026-10-25T09:00:00.000Z'),
          ],
        },
        { teacherId: 'tp-2', teacherName: 'Ustadha Khadija', entries: [entry('t4', 'TRIAL', 'SCHEDULED', '2026-10-18T09:00:00.000Z'), entry('t1', 'TRIAL', 'COMPLETED', '2026-10-15T09:00:00.000Z')] },
        { teacherId: 'tp-3', teacherName: 'Not loaded', entries: undefined },
      ],
      now,
    );
    expect(rows.map((r) => [r.id, r.teacherName])).toEqual([
      ['t4', 'Ustadha Khadija'],
      ['t1', 'Ustadh Bilal'],
    ]);
  });
});
