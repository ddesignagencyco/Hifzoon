import { QUEUE, type QueueName } from '../queue/queue.constants';

/**
 * Every job the worker must run on its own, with no request to trigger it.
 *
 * The processors implement these sweeps, but nothing used to enqueue them, so class
 * closing, session materialisation, dunning, retention and the SLA checks never ran
 * unless someone queued them by hand. This table is the single place that decides what
 * runs and how often. Each entry becomes a BullMQ job scheduler keyed by `id`, so
 * registering on every boot (and from several worker instances) is idempotent.
 *
 * Every job here must be safe to run twice: BullMQ retries, and two workers may boot at
 * once (TRD section 13).
 */
export interface RecurringJob {
  id: string;
  queue: QueueName;
  jobName: string;
  /** Either a fixed interval, or a UTC cron pattern. */
  everyMs?: number;
  cron?: string;
}

const MINUTE = 60_000;

export const RECURRING_JOBS: RecurringJob[] = [
  // Classroom: closing a class decides COMPLETED vs NO_SHOW_* from attendance (B37).
  {
    id: 'classroom:close-classes',
    queue: QUEUE.CLASSROOM,
    jobName: 'close-classes',
    everyMs: 5 * MINUTE,
  },
  {
    id: 'classroom:reconcile-recordings',
    queue: QUEUE.CLASSROOM,
    jobName: 'reconcile-recordings',
    cron: '30 * * * *',
  },

  // Scheduling
  {
    id: 'scheduling:materialise-sessions',
    queue: QUEUE.SCHEDULING,
    jobName: 'materialise-sessions',
    cron: '0 2 * * *',
  },
  {
    id: 'scheduling:detect-dst-clashes',
    queue: QUEUE.SCHEDULING,
    jobName: 'detect-dst-clashes',
    cron: '0 3 * * *',
  },
  {
    id: 'scheduling:plan-reminders',
    queue: QUEUE.SCHEDULING,
    jobName: 'plan-reminders',
    cron: '*/30 * * * *',
  },

  // Lesson cards: a card must be shared within 15 minutes of class end (FR-REC-06).
  {
    id: 'lesson-card:sweep-unshared-cards',
    queue: QUEUE.LESSON_CARD,
    jobName: 'sweep-unshared-cards',
    everyMs: 15 * MINUTE,
  },

  // Billing
  { id: 'billing:run-dunning', queue: QUEUE.BILLING, jobName: 'run-dunning', cron: '0 6 * * *' },
  {
    id: 'billing:expire-pauses',
    queue: QUEUE.BILLING,
    jobName: 'expire-pauses',
    cron: '15 * * * *',
  },
  {
    id: 'billing:close-periods',
    queue: QUEUE.BILLING,
    jobName: 'close-periods',
    cron: '0 1 * * *',
  },

  // Safeguarding: the lead is alerted within 15 minutes (CR-08), so these poll tightly.
  {
    id: 'safeguarding:check-breaches',
    queue: QUEUE.SAFEGUARDING,
    jobName: 'check-breaches',
    everyMs: 5 * MINUTE,
  },
  {
    id: 'safeguarding:check-sla-warnings',
    queue: QUEUE.SAFEGUARDING,
    jobName: 'check-sla-warnings',
    everyMs: 15 * MINUTE,
  },

  // Privacy: 30-day request SLA, short-lived exports.
  {
    id: 'data-request:check-sla',
    queue: QUEUE.DATA_REQUEST,
    jobName: 'check-sla',
    cron: '0 7 * * *',
  },
  {
    id: 'data-request:purge-expired-exports',
    queue: QUEUE.DATA_REQUEST,
    jobName: 'purge-expired-exports',
    cron: '45 * * * *',
  },

  // Notifications: repair anything that got stuck mid-send.
  {
    id: 'notification:sweep-stale',
    queue: QUEUE.NOTIFICATION,
    jobName: 'sweep-stale',
    everyMs: 15 * MINUTE,
  },
  {
    id: 'notification:reconcile',
    queue: QUEUE.NOTIFICATION,
    jobName: 'reconcile',
    everyMs: 15 * MINUTE,
  },
  {
    id: 'notification:requeue-retryable',
    queue: QUEUE.NOTIFICATION,
    jobName: 'requeue-retryable',
    everyMs: 10 * MINUTE,
  },

  // Retention (CR-02): recordings 90d, AI audio 30d, leads 12m, audit 3y.
  {
    id: 'retention:delete-expired-recordings',
    queue: QUEUE.RETENTION,
    jobName: 'delete-expired-recordings',
    cron: '0 4 * * *',
  },
  {
    id: 'retention:delete-ai-audio',
    queue: QUEUE.RETENTION,
    jobName: 'delete-ai-audio',
    cron: '10 4 * * *',
  },
  {
    id: 'retention:delete-old-leads',
    queue: QUEUE.RETENTION,
    jobName: 'delete-old-leads',
    cron: '20 4 * * *',
  },
  {
    id: 'retention:trim-audit-log',
    queue: QUEUE.RETENTION,
    jobName: 'trim-audit-log',
    cron: '30 4 * * *',
  },
  {
    id: 'retention:purge-content-cache',
    queue: QUEUE.RETENTION,
    jobName: 'purge-content-cache',
    cron: '40 4 * * *',
  },
];
