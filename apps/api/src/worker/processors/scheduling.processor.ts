import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DST_WARNING_LEAD_DAYS, SCHEDULE_MATERIALISE_DAYS } from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE } from '../../queue/queue.constants';
import { ScheduleMaterialiser } from '../../modules/scheduling/schedule-materialiser.service';
import { findDstClashes } from '../../modules/scheduling/dst.service';
import { ClassReminderService } from '../../modules/notifications/class-reminder.service';
import type { JobProcessor } from './processor.interface';

/**
 * Nightly scheduling work (SCH-BE-02, SCH-BE-04, TRD section 4.3).
 *
 * Materialising forward means a class that is cancelled today never disappears from
 * the family's calendar, and a family that reschedules does not need every occurrence
 * rewritten at once. `materialisedUntil` on each schedule makes the job idempotent,
 * so running it twice in one night is harmless.
 */
@Injectable()
export class SchedulingProcessor implements JobProcessor {
  readonly queue = QUEUE.SCHEDULING;
  readonly concurrency = 2;

  private readonly logger = new Logger(SchedulingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materialiser: ScheduleMaterialiser,
    private readonly reminders: ClassReminderService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'materialise-sessions': {
        const horizon = new Date(Date.now() + SCHEDULE_MATERIALISE_DAYS * 86_400_000);
        const result = await this.materialiser.materialiseDueSchedules(horizon);
        this.logger.log(
          `Scheduling: materialised ${result.created} session(s) from ${result.schedules} schedule(s) up to ${horizon.toISOString().slice(0, 10)}`,
        );
        return result;
      }
      case 'detect-dst-clashes':
        return this.detectDstClashes();
      case 'plan-reminders': {
        const planned = await this.reminders.planReminders(new Date(Date.now() + 7 * 86_400_000));
        this.logger.log(`Scheduling: planned ${planned} class reminder(s)`);
        return planned;
      }
      case 'close-expired-classes':
        return this.closeExpiredClasses();
      default:
        this.logger.warn(`Unknown scheduling job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * FR-SCH-02 — a recurring class keeps its *local* wall-clock time across a DST
   * transition, which in UTC terms means the instant moves by an hour. When only one
   * of the two zones shifts, the session can land outside the teacher's availability
   * or on top of another booking. We look ahead DST_WARNING_LEAD_DAYS so staff still
   * have time to re-agree a time with the family.
   */
  private async detectDstClashes() {
    const windowFrom = new Date();
    const windowTo = new Date(Date.now() + (DST_WARNING_LEAD_DAYS + 45) * 86_400_000);

    const sessions = await this.prisma.classSession.findMany({
      where: {
        startsAt: { gte: windowFrom, lte: windowTo },
        status: 'SCHEDULED',
        schedule: { isNot: null },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        schedule: { select: { familyTimeZone: true } },
        teacher: { select: { user: { select: { timeZone: true } } } },
      },
      take: 2_000,
    });

    const candidates = sessions
      .filter((session) => session.schedule?.familyTimeZone)
      .map((session) => ({
        id: session.id,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        familyZone: session.schedule!.familyTimeZone,
        teacherZone: session.teacher.user.timeZone,
      }));

    if (candidates.length === 0) return { warnings: 0, scanned: 0 };

    const clashes = findDstClashes({ sessions: candidates, windowFrom, windowTo });

    if (clashes.length > 0) {
      // Re-check the teacher's calendar at the recomputed instant before alerting, so
      // staff are never told about a clash that does not actually collide.
      const conflicts = await this.countTeacherConflicts(clashes);
      for (const clash of clashes) {
        this.logger.warn(
          `FR-SCH-02 DST warning: class ${clash.sessionId} — ${clash.reason} (teacher busy: ${conflicts.get(clash.sessionId) ?? 0})`,
        );
      }
      this.logger.warn(
        `${clashes.length} DST review(s) needed inside ${DST_WARNING_LEAD_DAYS} days`,
      );
    }

    return { warnings: clashes.length, scanned: candidates.length, details: clashes.slice(0, 50) };
  }

  /** How many classes the teacher already has at the shifted instant. */
  private async countTeacherConflicts(
    clashes: Array<{ sessionId: string; recomputedStart: Date }>,
  ) {
    const counts = new Map<string, number>();
    for (const clash of clashes) {
      const teacherId = await this.teacherIdFor(clash.sessionId);
      if (!teacherId) continue;
      const overlaps = await this.prisma.classSession.count({
        where: {
          teacherId,
          id: { not: clash.sessionId },
          status: { in: ['SCHEDULED', 'LIVE', 'COMPLETED'] },
          startsAt: { lt: new Date(clash.recomputedStart.getTime() + 30 * 60_000) },
          endsAt: { gt: clash.recomputedStart },
        },
      });
      counts.set(clash.sessionId, overlaps);
    }
    return counts;
  }

  private async teacherIdFor(classId: string): Promise<string | undefined> {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: { teacherId: true },
    });
    return session?.teacherId;
  }

  /**
   * Marks sessions whose end time has passed and that never went live, so attendance,
   * payroll and reminder logic stop treating them as upcoming.
   */
  private async closeExpiredClasses() {
    const result = await this.prisma.classSession.updateMany({
      where: { status: 'SCHEDULED', endsAt: { lt: new Date() } },
      data: { status: 'NO_SHOW_TEACHER' },
    });
    if (result.count > 0) this.logger.log(`Scheduling: closed ${result.count} expired session(s)`);
    return { closed: result.count };
  }
}
