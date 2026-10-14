import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  LESSON_CARD_LOCK_HOURS,
  LESSON_CARD_SHARE_SLA_MINUTES,
  NotificationChannel,
} from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { NotificationsService, TEMPLATE } from '../../modules/notifications/notifications.service';
import type { JobProcessor } from './processor.interface';

/**
 * Lesson card follow-up (REC-BE-04, REC-BE-05, FR-REC-06, FR-REC-08).
 *
 * Two jobs with hard deadlines:
 *   - share the card with the family within 15 minutes of the class ending
 *     (LESSON_CARD_SHARE_SLA_MINUTES)
 *   - lock it 48 hours later so a teacher's honest correction cannot quietly change
 *     what the parent already read; later edits become supervisor-only and logged
 */
@Injectable()
export class LessonCardProcessor implements JobProcessor {
  readonly queue = QUEUE.LESSON_CARD;
  readonly concurrency = 4;

  private readonly logger = new Logger(LessonCardProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly queues: QueueService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'share-lesson-card':
        return this.shareLessonCard(job.data.lessonCardId as string);
      case 'lock-lesson-card':
        return this.lockLessonCard(job.data.lessonCardId as string);
      case 'sweep-unshared-cards':
        return this.alertOnUnsharedCards();
      default:
        this.logger.warn(`Unknown lesson-card job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /** FR-REC-06 — notify the family and mark the card shared. */
  async shareLessonCard(lessonCardId: string) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: {
        id: true,
        sharedAt: true,
        submittedAt: true,
        homework: true,
        student: {
          select: {
            displayName: true,
            family: {
              select: { members: { where: { isPrimary: true }, select: { userId: true } } },
            },
          },
        },
        teacher: { select: { name: true } },
        class: { select: { endsAt: true } },
      },
    });

    if (!card) return { skipped: 'not_found' };
    if (!card.submittedAt) {
      this.logger.warn(`Lesson card ${lessonCardId} is not submitted yet; skipping share`);
      return { skipped: 'not_submitted' };
    }
    if (card.sharedAt) return { alreadyShared: true };

    const guardians = card.student.family.members.map((m) => m.userId);

    const { queued } = await this.notifications.enqueue({
      userIds: guardians,
      template: TEMPLATE.LESSON_CARD_READY,
      channel: NotificationChannel.EMAIL,
      data: {
        studentName: card.student.displayName,
        teacherName: card.teacher.name,
        homework: card.homework ?? '',
        lessonCardId: card.id,
      },
    });

    await this.prisma.lessonCard.update({
      where: { id: lessonCardId },
      data: { sharedAt: new Date() },
    });

    // FR-REC-08 — the lock is scheduled from submission, not from the share, so the
    // 48 hour window is measured on the record the family is reading.
    if (!card.class.endsAt) {
      await this.scheduleLock(lessonCardId, card.submittedAt);
    }

    const minutesLate = card.class.endsAt ? (Date.now() - card.class.endsAt.getTime()) / 60_000 : 0;
    if (minutesLate > LESSON_CARD_SHARE_SLA_MINUTES) {
      this.logger.warn(
        `FR-REC-06 SLA breached: lesson card ${lessonCardId} shared ${Math.round(minutesLate)} min after class end`,
      );
    }

    return { queued, minutesLate: Math.round(minutesLate) };
  }

  /** FR-REC-08 — 48 hours after submit, the card stops being editable by the teacher. */
  async lockLessonCard(lessonCardId: string) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: { id: true, submittedAt: true, lockedAt: true },
    });
    if (!card?.submittedAt || card.lockedAt) return { skipped: 'already_locked' };

    await this.prisma.lessonCard.update({
      where: { id: lessonCardId },
      data: { lockedAt: card.submittedAt },
    });
    this.logger.log(`FR-REC-08: lesson card ${lessonCardId} locked`);
    return { locked: true };
  }

  private async scheduleLock(lessonCardId: string, submittedAt: Date | null): Promise<void> {
    if (!submittedAt) return;
    const lockAt = submittedAt.getTime() + LESSON_CARD_LOCK_HOURS * 3_600_000;
    if (lockAt <= Date.now()) return;

    await this.queues.addDelayed(
      QUEUE.LESSON_CARD,
      'lock-lesson-card',
      { lessonCardId },
      lockAt - Date.now(),
    );
  }

  /**
   * Catches cards whose share job died. Cheap enough to run hourly and it is the
   * difference between "the parent never got the lesson card" being noticed on day
   * one rather than at the next parent meeting.
   */
  async alertOnUnsharedCards() {
    const cutoff = new Date(Date.now() - LESSON_CARD_SHARE_SLA_MINUTES * 60_000);
    const stranded = await this.prisma.lessonCard.findMany({
      where: { submittedAt: { not: null }, sharedAt: null },
      select: { id: true, submittedAt: true },
      take: 100,
    });

    const overdue = stranded.filter((card) => card.submittedAt && card.submittedAt <= cutoff);
    for (const card of overdue) {
      await this.shareLessonCard(card.id);
    }

    if (overdue.length > 0) {
      this.logger.warn(
        `Recovered ${overdue.length} unshared lesson card(s) past the ${LESSON_CARD_SHARE_SLA_MINUTES} min SLA`,
      );
    }
    return { recovered: overdue.length };
  }
}
