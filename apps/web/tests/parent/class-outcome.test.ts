import { describe, expect, it } from 'vitest';
import { canCancel, classOutcome, isPastClass } from '@/lib/api/modules/scheduling-family';

const START = Date.parse('2026-10-19T10:00:00Z');
const row = (status: string) => ({ status, startsAt: '2026-10-19T10:00:00Z', endsAt: '2026-10-19T10:30:00Z' });
const min = (m: number) => START + m * 60_000;

describe('classOutcome — what a class row says', () => {
  it('follows the clock while the API still says SCHEDULED', () => {
    expect(classOutcome(row('SCHEDULED'), min(-30)).label).toBe('Scheduled');
    expect(classOutcome(row('SCHEDULED'), min(5)).label).toBe('In progress');
    expect(classOutcome(row('SCHEDULED'), min(31))).toMatchObject({ label: 'Ended', tone: 'neutral' });
  });

  it('shows the final result once the API has it', () => {
    expect(classOutcome(row('COMPLETED'), min(40))).toMatchObject({ label: 'Completed', tone: 'green' });
    expect(classOutcome(row('NO_SHOW_STUDENT'), min(40))).toMatchObject({ label: 'Missed', tone: 'red' });
    expect(classOutcome(row('NO_SHOW_TEACHER'), min(40)).label).toBe('Teacher absent');
    expect(classOutcome(row('CANCELLED_FAMILY'), min(-60)).label).toBe('Cancelled by family');
    expect(classOutcome(row('CANCELLED_TEACHER'), min(-60)).label).toBe('Cancelled by teacher');
  });

  it('stops offering Cancel once the class has started, and files ended classes under Past', () => {
    expect(canCancel(row('SCHEDULED') as never, min(-10))).toBe(true);
    expect(canCancel(row('SCHEDULED') as never, min(1))).toBe(false);
    expect(isPastClass(row('SCHEDULED'), min(29))).toBe(false);
    expect(isPastClass(row('SCHEDULED'), min(30))).toBe(true);
  });
});
