import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QUEUE } from '../../queue/queue.constants';
import { ClassReminderService } from '../../modules/notifications/class-reminder.service';
import type { JobProcessor } from './processor.interface';

/**
 * Class reminder delivery (FR-NTF-01, TRD section 13).
 *
 * `ClassReminderService.planReminders` decides *what* to send and enqueues a delayed
 * job per class; this processor is what actually sends it when the delay expires.
 *
 * The idempotency check matters more than it looks. A class can be rescheduled between
 * planning and firing, and the planner re-plans on every reschedule — so without the
 * `cancelReason`/status check a family who moved their class would receive a reminder
 * for the slot they no longer attend. The reminder is also skipped for a class that
 * started more than an hour ago, because a reminder for a class that has already
 * happened is pure noise.
 */
@Injectable()
export class ClassReminderProcessor implements JobProcessor {
  readonly queue = QUEUE.CLASS_REMINDER;
  readonly concurrency = 8;

  private readonly logger = new Logger(ClassReminderProcessor.name);

  constructor(private readonly reminders: ClassReminderService) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'send-reminder':
        return this.sendReminder(job.data);
      default:
        this.logger.warn(`Unknown class-reminder job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * Delegates to `ClassReminderService.sendReminder`, the single producer of reminder
   * copy. This processor used to build its own payload with only courseName, teacherName
   * and startsAt, so the templates rendered "undefined" into every stored message (B34).
   */
  private async sendReminder(payload: {
    classId?: string;
    kind?: 'DAY_BEFORE' | 'FIFTEEN_MINUTES';
  }) {
    if (!payload?.classId) return { skipped: 'no classId' };

    const kind = payload.kind ?? 'DAY_BEFORE';
    const result = await this.reminders.sendReminder(payload.classId, kind);
    this.logger.log(`Class reminder: ${kind} for class ${payload.classId}, queued ${result.sent}`);
    return { ...result, classId: payload.classId };
  }
}
