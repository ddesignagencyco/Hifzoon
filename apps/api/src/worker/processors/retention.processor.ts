import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RETENTION_DAYS } from '@hifzoon/shared';

import type { RecordingStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { RecordingStorageService } from '../../storage/recording-storage.service';
import { StorageService } from '../../storage/storage.service';
import { QUEUE } from '../../queue/queue.constants';
import type { JobProcessor } from './processor.interface';

/**
 * Retention and compliance sweeps (CMP-BE-01, ERD section 4, CR-02).
 *
 * Every rule from the SRS retention table is a branch here, and each branch is
 * idempotent so a retry cannot double-delete or skip a record. Deletion is always
 * "mark for deletion, then remove the object, then drop the row" so a storage outage
 * leaves the row to be retried rather than orphaning the file forever.
 */
@Injectable()
export class RetentionProcessor implements JobProcessor {
  readonly queue = QUEUE.RETENTION;
  readonly concurrency = 1;

  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly recordings: RecordingStorageService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'delete-expired-recordings':
        return this.deleteExpiredRecordings(job.data);
      case 'delete-ai-audio':
        return this.deleteAiAudio();
      case 'delete-old-leads':
        return this.deleteOldLeads();
      case 'trim-audit-log':
        return this.trimAuditLog();
      case 'purge-content-cache':
        return this.purgeContentCache();
      // Enqueued by ConsentService the moment a CLASS_RECORDING consent is withdrawn
      // (FR-PRV-02, CR-04). It is a deletion, so it belongs to retention rather than to
      // the classroom queue — and it runs immediately, not on the 90-day schedule.
      case 'withdrawal-recording-cleanup':
        return this.withdrawalRecordingCleanup(job.data);
      default:
        this.logger.warn(`Unknown retention job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * Immediate takedown of a recording after consent is withdrawn.
   *
   * Any `deleteAfter` is pulled back to now so the ordinary expiry sweep picks it up on
   * its next pass, rather than this job duplicating the object-removal logic. One code
   * path that deletes recordings means one place to get the ordering right.
   */
  private async withdrawalRecordingCleanup(data: { studentId?: string } = {}) {
    const where = {
      ...(data.studentId ? { class: { students: { some: { studentId: data.studentId } } } } : {}),
      status: { in: ['RECORDING', 'READY', 'PENDING'] as RecordingStatus[] },
    };

    const affected = await this.prisma.recording.updateMany({
      where,
      data: { deleteAfter: new Date() },
    });

    // Withdrawn consent also clears any child-specific practice audio immediately.
    if (data.studentId) {
      await this.prisma.practiceSession.updateMany({
        where: { studentId: data.studentId, audioKey: { not: null } },
        data: { audioKey: null },
      });
    }

    this.logger.log(
      `Retention: consent withdrawal pulled ${affected.count} recording(s) forward for immediate deletion`,
    );
    return { flagged: affected.count };
  }

  /**
   * CR-02 — recordings are deleted 90 days after the class unless a case retains
   * them. A withdrawn CLASS_RECORDING consent sets `deleteAfter` to now, so the same
   * job also serves an immediate takedown.
   */
  private async deleteExpiredRecordings(data: { studentId?: string } = {}) {
    const where = {
      status: { in: ['RECORDING', 'READY'] as RecordingStatus[] },
      deleteAfter: { lte: new Date() },
      retainedForCaseId: null,
      ...(data.studentId ? { class: { students: { some: { studentId: data.studentId } } } } : {}),
    };

    const expired = await this.prisma.recording.findMany({
      where,
      select: { id: true, storageKey: true, classId: true },
      take: 500,
    });

    let deleted = 0;
    for (const recording of expired) {
      if (recording.storageKey) {
        try {
          await this.recordings.remove(recording.storageKey);
        } catch (error) {
          this.logger.error(
            `Could not remove object ${recording.storageKey} for recording ${recording.id}: ${(error as Error).message}`,
          );
          continue;
        }
      }
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: { status: 'DELETED', storageKey: null },
      });
      deleted += 1;
    }

    this.logger.log(`Retention: removed ${deleted} expired recording(s)`);
    return { deleted };
  }

  /**
   * CR-02 — a child's practice audio is deleted after 30 days. The derived results
   * (word alignment, flags) are kept: they are the learning record, the audio is the
   * biometric data.
   */
  private async deleteAiAudio() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS.AI_AUDIO * 86_400_000);
    const sessions = await this.prisma.practiceSession.findMany({
      where: { audioKey: { not: null }, startedAt: { lte: cutoff } },
      select: { id: true, audioKey: true },
      take: 1_000,
    });

    let deleted = 0;
    for (const session of sessions) {
      if (session.audioKey) {
        try {
          await this.storage.remove(session.audioKey);
        } catch (error) {
          this.logger.error(
            `Could not remove AI audio ${session.audioKey}: ${(error as Error).message}`,
          );
          continue;
        }
      }
      await this.prisma.practiceSession.update({
        where: { id: session.id },
        data: { audioKey: null, audioDeleteAfter: new Date() },
      });
      deleted += 1;
    }

    this.logger.log(
      `Retention: deleted ${deleted} practice recording(s) older than ${RETENTION_DAYS.AI_AUDIO} days`,
    );
    return { deleted };
  }

  /**
   * CR-02 — leads that never enrolled are swept after 12 months. A converted lead
   * points at a family and is therefore customer data, not marketing data.
   */
  private async deleteOldLeads() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS.LEAD * 86_400_000);
    const result = await this.prisma.lead.deleteMany({
      where: { familyId: null, createdAt: { lte: cutoff } },
    });
    this.logger.log(`Retention: deleted ${result.count} unconverted lead(s)`);
    return { deleted: result.count };
  }

  /** FR-OPS-06 — audit rows are kept three years. */
  private async trimAuditLog() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS.AUDIT_LOG * 86_400_000);
    const stale = await this.prisma.$queryRaw<Array<{ id: string }>>`
      DELETE FROM audit_log WHERE at < ${cutoff} RETURNING id
    `;
    this.logger.log(`Retention: trimmed ${stale.length} audit row(s) older than 3 years`);
    return { deleted: stale.length };
  }

  /**
   * CR-11 — licensed Quran content may be cached for at most a week. The CHECK
   * constraint already refuses anything longer; this purges what has aged out.
   */
  private async purgeContentCache() {
    const result = await this.prisma.contentCache.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    this.logger.log(`Retention: purged ${result.count} expired content cache entr(ies)`);
    return { deleted: result.count };
  }
}
