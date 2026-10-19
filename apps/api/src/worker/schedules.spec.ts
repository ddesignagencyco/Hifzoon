import { ALL_QUEUE_NAMES } from '../queue/queue.constants';
import { RECURRING_JOBS } from './schedules';

describe('RECURRING_JOBS', () => {
  it('has a unique scheduler id per job', () => {
    const ids = RECURRING_JOBS.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every job exactly one of an interval or a cron pattern', () => {
    for (const job of RECURRING_JOBS) {
      expect(Boolean(job.everyMs) !== Boolean(job.cron)).toBe(true);
    }
  });

  it('only targets queues that exist', () => {
    for (const job of RECURRING_JOBS) expect(ALL_QUEUE_NAMES).toContain(job.queue);
  });

  it('does not schedule the clock-only closer that ignored attendance', () => {
    expect(RECURRING_JOBS.find((j) => j.jobName === 'close-expired-classes')).toBeUndefined();
    expect(RECURRING_JOBS.find((j) => j.jobName === 'close-classes')).toBeDefined();
  });
});
