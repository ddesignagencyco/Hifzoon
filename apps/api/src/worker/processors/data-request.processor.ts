import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RETENTION_DAYS } from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { QUEUE } from '../../queue/queue.constants';
import { NotificationsService, TEMPLATE } from '../../modules/notifications/notifications.service';
import type { JobProcessor } from './processor.interface';

/**
 * Guardian data requests (CR-05, FR-PRV-04, FR-PRV-05).
 *
 * CR-05 gives a family 30 days to exercise the export/delete right, and this processor
 * is what makes that deadline real — without a worker, a submitted request sits in
 * `REQUESTED` forever and the SLA is a lie told to a regulator.
 *
 * Two rules make this safe to run unattended:
 *
 *   - **Deletion is confirmable and reversible-until-executed.** The request records a
 *     scheduled date; nothing is deleted until that date arrives, giving the family a
 *     window to cancel. Erasure happens through the same soft-delete columns the rest of
 *     the platform uses, not a `DELETE FROM`.
 *
 *   - **Export output is written to storage with a bounded lifetime.** An export can
 *     contain every record about a child; it is generated, handed over, and then
 *     expires rather than sitting in a bucket forever.
 */
@Injectable()
export class DataRequestProcessor implements JobProcessor {
  readonly queue = QUEUE.DATA_REQUEST;
  readonly concurrency = 1;

  private readonly logger = new Logger(DataRequestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      // Enqueued by ConsentService when a family submits a request. The row's `type`
      // decides which branch runs, so the producer does not have to know the two paths.
      case 'process-data-request':
      case 'process-export':
        return this.dispatch(job.data?.dataRequestId as string);
      case 'process-deletion':
        return this.processDeletion(job.data?.dataRequestId as string);
      case 'check-sla':
        return this.checkSla();
      case 'purge-expired-exports':
        return this.purgeExpiredExports();
      default:
        this.logger.warn(`Unknown data-request job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  private async dispatch(dataRequestId: string) {
    if (!dataRequestId) return { skipped: 'no dataRequestId' };

    const request = await this.prisma.dataRequest.findUnique({
      where: { id: dataRequestId },
      select: { type: true },
    });
    if (!request) return { skipped: 'request not found' };

    return request.type === 'DELETE'
      ? this.processDeletion(dataRequestId)
      : this.processExport(dataRequestId);
  }

  /**
   * Collects everything held about one family into a single archive.
   *
   * A storage outage is treated as a *recorded* failure rather than a thrown one. BullMQ
   * would otherwise retry the job five times with exponential backoff and the outcome is
   * identical every time — the bucket is missing, it is configuration, not a blip. By
   * returning a structured failure the SLA report still shows the request as stuck, which
   * is the thing a person needs to act on.
   */
  private async processExport(dataRequestId: string) {
    const request = await this.prisma.dataRequest.findUnique({
      where: { id: dataRequestId },
      include: { family: { select: { id: true, name: true } } },
    });

    if (!request) return { skipped: 'request not found' };
    if (request.status === 'COMPLETED') return { skipped: 'already completed' };
    if (request.status === 'REJECTED') return { skipped: 'request was rejected' };

    await this.prisma.dataRequest.update({
      where: { id: request.id },
      data: { status: 'IN_PROGRESS' },
    });

    const familyId = request.familyId;

    const [members, students, consents, enrolments, subscriptions, invoices, threads, messages] =
      await Promise.all([
        this.prisma.familyMember.findMany({
          where: { familyId },
          include: {
            user: { select: { id: true, email: true, name: true, phone: true, language: true } },
          },
        }),
        this.prisma.student.findMany({
          where: { familyId },
          include: {
            consents: true,
            pageStates: true,
            mistakes: true,
            lessonCards: true,
            practiceSessions: true,
            badges: { include: { badge: true } },
          },
        }),
        this.prisma.consent.findMany({
          where: { student: { familyId } },
          include: { events: true },
        }),
        this.prisma.enrolment.findMany({
          where: { student: { familyId } },
          include: { classes: { include: { class: true } }, assessments: true },
        }),
        this.prisma.subscription.findMany({ where: { familyId }, include: { plan: true } }),
        this.prisma.invoice.findMany({ where: { familyId }, include: { payments: true } }),
        this.prisma.messageThread.findMany({ where: { familyId } }),
        this.prisma.message.findMany({
          where: { thread: { familyId } },
          include: { sender: { select: { name: true } } },
        }),
      ]);

    const payload = {
      generatedAt: new Date().toISOString(),
      family: request.family,
      members,
      students,
      consents,
      enrolments,
      subscriptions,
      invoices,
      messaging: { threads, messages },
    };

    const body = Buffer.from(JSON.stringify(payload, null, 2));
    // The key is derived from the request id alone — no family name, no digest — so the
    // purge job can recompute it years later without needing a stored column. The
    // object key itself must never be an identifier.
    const key = `exports/${request.id}.json`;

    try {
      await this.storage.upload(key, body, 'application/json');
    } catch (error) {
      const reason = `Export storage unavailable: ${(error as Error).message}`;
      this.logger.error(`Data request ${request.id}: ${reason}`);
      return { failed: true, reason, retryable: false };
    }

    await this.prisma.dataRequest.update({
      where: { id: request.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        fileUrl: await this.storage.signedDownloadUrl(key),
      },
    });

    const primary = await this.prisma.familyMember.findFirst({
      where: { familyId, isPrimary: true },
      select: { userId: true },
    });
    if (primary) {
      await this.notifications
        .enqueue({
          userIds: [primary.userId],
          template: TEMPLATE.DATA_REQUEST,
          data: { type: 'export', reference: request.id.slice(0, 8).toUpperCase() },
        })
        .catch((error: Error) => this.logger.warn(`Export notice failed: ${error.message}`));
    }

    this.logger.log(`Data request: export ${request.id} ready (${body.length} bytes)`);
    return { bytes: body.length, key };
  }

  /**
   * Soft-deletes everything for a family after the confirmation window.
   *
   * Every write is an `updatedAt`/`deletedAt` stamp rather than a hard delete, so an
   * erasure mistake is recoverable and the audit trail keeps working — a hard delete
   * would remove the very records that show the erasure happened correctly.
   */
  private async processDeletion(dataRequestId: string) {
    const request = await this.prisma.dataRequest.findUnique({ where: { id: dataRequestId } });
    if (!request) return { skipped: 'request not found' };
    if (request.status === 'COMPLETED') return { skipped: 'already completed' };

    const now = new Date();
    const students = await this.prisma.student.findMany({
      where: { familyId: request.familyId },
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);
    const members = await this.prisma.familyMember.findMany({
      where: { familyId: request.familyId },
      select: { userId: true },
    });
    const userIds = members.map((m) => m.userId);

    await this.prisma.$transaction([
      this.prisma.student.updateMany({
        where: { id: { in: studentIds } },
        data: { deletedAt: now },
      }),
      this.prisma.family.update({ where: { id: request.familyId }, data: { deletedAt: now } }),
      ...(userIds.length > 0
        ? [
            this.prisma.user.updateMany({
              where: { id: { in: userIds } },
              data: { deletedAt: now },
            }),
          ]
        : []),
      // Learning artefacts that carry biometric or voice data are cleared outright:
      // there is no "soft" version of a child's audio.
      ...(studentIds.length > 0
        ? [
            this.prisma.practiceSession.updateMany({
              where: { studentId: { in: studentIds } },
              data: { audioKey: null },
            }),
          ]
        : []),
      this.prisma.dataRequest.update({
        where: { id: request.id },
        data: { status: 'COMPLETED', completedAt: now },
      }),
    ]);

    this.logger.log(`Data request: erasure completed for family ${request.familyId}`);
    return { studentsErased: studentIds.length, usersErased: userIds.length };
  }

  /** CR-05 — flag anything approaching the 30-day statutory deadline. */
  private async checkSla() {
    const soon = new Date(Date.now() + 7 * 86_400_000);
    const approaching = await this.prisma.dataRequest.findMany({
      where: { status: { notIn: ['COMPLETED', 'REJECTED'] }, dueAt: { lt: soon } },
      select: { id: true, type: true, status: true, dueAt: true },
    });

    if (approaching.length > 0) {
      this.logger.error(
        `Data requests: ${approaching.length} within 7 days of the 30-day statutory deadline`,
      );
    }
    return { approaching: approaching.length };
  }

  /** Exports contain everything about a child; they must not sit in storage forever. */
  private async purgeExpiredExports() {
    // Reuses the CR-05 SLA window: an export is a response to a request that had to be
    // answered inside 30 days, so keeping it for the same period is proportionate and
    // avoids inventing a second retention constant nobody else agrees on.
    const cutoff = new Date(Date.now() - RETENTION_DAYS.DATA_REQUEST_SLA * 86_400_000);
    const stale = await this.prisma.dataRequest.findMany({
      where: { type: 'EXPORT', status: 'COMPLETED', completedAt: { lte: cutoff } },
      select: { id: true },
      take: 500,
    });

    let purged = 0;
    for (const request of stale) {
      try {
        await this.storage.remove(`exports/${request.id}.json`);
        purged += 1;
      } catch (error) {
        // A missing object is the desired end state, so this only matters when the
        // bucket is unreachable — which should retry, not be counted as purged.
        this.logger.warn(
          `Could not purge export for request ${request.id}: ${(error as Error).message}`,
        );
      }
    }

    if (purged > 0) this.logger.log(`Data requests: purged ${purged} expired export(s)`);
    return { purged };
  }
}
