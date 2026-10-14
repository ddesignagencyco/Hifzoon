import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE } from '../../queue/queue.constants';
import { NotificationsService, TEMPLATE } from '../../modules/notifications/notifications.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'send-reminder':
        return this.sendReminder(job.data);
      default:
        this.logger.warn(`Unknown class-reminder job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  private async sendReminder(payload: {
    classId?: string;
    kind?: 'DAY_BEFORE' | 'FIFTEEN_MINUTES';
  }) {
    if (!payload?.classId) return { skipped: 'no classId' };

    const klass = await this.prisma.classSession.findUnique({
      where: { id: payload.classId },
      select: {
        id: true,
        startsAt: true,
        status: true,
        cancelReason: true,
        course: { select: { name: true } },
        teacher: { select: { user: { select: { name: true } } } },
        students: {
          select: {
            student: {
              select: {
                displayName: true,
                family: {
                  select: {
                    members: { select: { user: { select: { id: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!klass) return { skipped: 'class not found' };

    // Never remind for a cancelled class, a rescheduled-away class, or one that has
    // already started — all three produce a notification a family would rightly
    // report as a bug.
    if (klass.status !== 'SCHEDULED') return { skipped: `class is ${klass.status}` };
    if (klass.startsAt.getTime() < Date.now() - 60 * 60_000) {
      return { skipped: 'class already started' };
    }

    // Deduplicate per family: a family with two children in the same class receives one
    // reminder, not two.
    const recipients = new Set<string>();
    for (const link of klass.students) {
      for (const member of link.student.family.members) recipients.add(member.user.id);
    }

    if (recipients.size === 0) return { sent: 0 };

    const fifteenMinutes = payload.kind === 'FIFTEEN_MINUTES';
    await this.notifications.enqueue({
      userIds: [...recipients],
      template: fifteenMinutes
        ? TEMPLATE.CLASS_REMINDER_15_MIN
        : TEMPLATE.CLASS_REMINDER_DAY_BEFORE,
      data: {
        courseName: klass.course.name,
        teacherName: klass.teacher.user.name,
        startsAt: klass.startsAt.toISOString(),
      },
    });

    this.logger.log(
      `Class reminder: ${payload.kind ?? 'DAY_BEFORE'} sent for class ${klass.id} to ${recipients.size} recipient(s)`,
    );
    return { sent: recipients.size, classId: klass.id };
  }
}
