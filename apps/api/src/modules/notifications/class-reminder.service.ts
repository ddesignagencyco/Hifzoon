import { Injectable, Logger } from '@nestjs/common';
import { CLASSROOM_EARLY_OPEN_MINUTES, LESSON_CARD_SHARE_SLA_MINUTES } from '@hifzoon/shared';
import { DateTime } from 'luxon';

import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { NotificationsService, TEMPLATE } from './notifications.service';

export type ReminderKind = 'DAY_BEFORE' | 'FIFTEEN_MINUTES';

/**
 * Class reminders (NTF-BE-03, FR-NTF-01).
 *
 * Two reminders per class: 24 hours before and 15 minutes before. Both are scheduled
 * as delayed BullMQ jobs when the session materialises, and both are cancelled and
 * re-planned when a class is rescheduled — a reminder for a class that moved is worse
 * than no reminder, because the family joins the wrong room.
 */
@Injectable()
export class ClassReminderService {
  private readonly logger = new Logger(ClassReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Plans both reminders for one class. Idempotent per (class, kind). */
  async planForClass(classId: string): Promise<{ planned: number }> {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        id: true,
        startsAt: true,
        status: true,
        schedule: { select: { familyTimeZone: true } },
      },
    });

    if (!session || session.status !== 'SCHEDULED') return { planned: 0 };

    const kindLeads: Array<{ kind: ReminderKind; leadMinutes: number }> = [
      { kind: 'DAY_BEFORE', leadMinutes: 24 * 60 },
      { kind: 'FIFTEEN_MINUTES', leadMinutes: 15 },
    ];

    let planned = 0;
    for (const { kind, leadMinutes } of kindLeads) {
      const sendAt = session.startsAt.getTime() - leadMinutes * 60_000;
      if (sendAt <= Date.now()) continue;

      await this.queues.addDelayed(
        QUEUE.CLASS_REMINDER,
        'send-reminder',
        { classId, kind },
        sendAt - Date.now(),
      );
      planned += 1;
    }

    const zone = session.schedule?.familyTimeZone ?? 'UTC';
    this.logger.log(
      `Planned ${planned} reminder(s) for class ${classId} ` +
        `(${DateTime.fromJSDate(session.startsAt, { zone }).toFormat('ccc dd LLL, HH:mm')} ${zone})`,
    );
    return { planned };
  }

  /** Re-plans reminders for everything starting inside the window (nightly job). */
  async planReminders(until: Date): Promise<number> {
    const sessions = await this.prisma.classSession.findMany({
      where: { status: 'SCHEDULED', startsAt: { gt: new Date(), lt: until } },
      select: { id: true },
      take: 1_000,
    });

    let planned = 0;
    for (const session of sessions) {
      planned += (await this.planForClass(session.id)).planned;
    }
    return planned;
  }

  /** Sends one reminder. Called by the worker. */
  async sendReminder(classId: string, kind: ReminderKind): Promise<{ sent: number }> {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        id: true,
        startsAt: true,
        status: true,
        schedule: { select: { familyTimeZone: true } },
        students: {
          select: {
            student: {
              select: {
                displayName: true,
                family: {
                  select: { members: { where: { isPrimary: true }, select: { userId: true } } },
                },
              },
            },
          },
        },
        teacher: { select: { user: { select: { name: true } } } },
      },
    });

    if (!session || session.status !== 'SCHEDULED') return { sent: 0 };

    const zone = session.schedule?.familyTimeZone ?? 'UTC';
    const localTime = DateTime.fromJSDate(session.startsAt, { zone }).toFormat('HH:mm');

    // FR-CLS-01 — the room opens 10 minutes early, so the link is valid before class.
    const opensAt = DateTime.fromJSDate(session.startsAt)
      .minus({ minutes: CLASSROOM_EARLY_OPEN_MINUTES })
      .toISO();

    const guardians = session.students.flatMap((link) =>
      link.student.family.members.map((m) => m.userId),
    );
    if (guardians.length === 0) return { sent: 0 };

    const template =
      kind === 'DAY_BEFORE' ? TEMPLATE.CLASS_REMINDER_DAY_BEFORE : TEMPLATE.CLASS_REMINDER_15_MIN;

    const { queued } = await this.notifications.enqueue({
      userIds: guardians,
      template,
      data: {
        studentName: session.students[0]?.student.displayName ?? '',
        teacherName: session.teacher.user.name,
        localTime,
        timeZone: zone,
        opensAt,
        joinUrl: `${process.env.APP_WEB_URL ?? 'https://app.hifzoon.com'}/classroom/${session.id}`,
      },
    });

    return { sent: queued };
  }

  /** Removes pending reminders for a class — called before a reschedule or cancellation. */
  async cancelForClass(classId: string): Promise<{ removed: boolean }> {
    await this.queues.removePending(QUEUE.CLASS_REMINDER, 'send-reminder', (job) => {
      return job.data?.classId === classId;
    });
    return { removed: true };
  }

  /** FR-REC-06 — the lesson card must reach the family within 15 minutes of class end. */
  async scheduleLessonCardShare(lessonCardId: string): Promise<void> {
    await this.queues.addDelayed(
      QUEUE.LESSON_CARD,
      'share-lesson-card',
      { lessonCardId },
      LESSON_CARD_SHARE_SLA_MINUTES * 60_000,
    );
  }
}
