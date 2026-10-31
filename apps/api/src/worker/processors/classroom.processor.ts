import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { RecordingStorageService } from '../../storage/recording-storage.service';
import { QUEUE } from '../../queue/queue.constants';
import { ClassroomService } from '../../modules/classroom/classroom.service';
import type { JobProcessor } from './processor.interface';

/**
 * Background jobs act on the academy's behalf, not a person's, so they carry a staff
 * scope that passes class-ownership checks without a database lookup.
 */
const SYSTEM_ACTOR = { userId: 'system', roles: ['SUPER_ADMIN'] };

/**
 * Classroom recording lifecycle (FR-CLS-12, FR-REC-07, FR-REC-10).
 *
 * Recording is consent-gated and retention-bound, and both of those are enforced by the
 * *database* as well as here. This processor's job is the part the database cannot do:
 * reconciling with the provider so a recording that failed to upload does not leave a
 * row claiming it exists.
 *
 * The most important behaviour is `reconcile-recordings`, which exists because a
 * "READY" recording whose object is missing is worse than no recording at all: a parent
 * clicks play and gets an error, which reads as data loss.
 */
@Injectable()
export class ClassroomProcessor implements JobProcessor {
  readonly queue = QUEUE.CLASSROOM;
  readonly concurrency = 4;

  private readonly logger = new Logger(ClassroomProcessor.name);
  private warnedNoRecordingStorage = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recordings: RecordingStorageService,
    private readonly classroom: ClassroomService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'handle-recording-webhook':
        return this.handleRecordingWebhook(job.data);
      case 'persist-marker':
        return this.persistMarker(job.data);
      case 'delete-recording':
        return this.deleteRecording(job.data?.recordingId as string);
      case 'reconcile-recordings':
        return this.reconcileRecordings();
      case 'close-classes':
        return this.closeFinishedClasses();
      default:
        this.logger.warn(`Unknown classroom job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * Provider webhook → local row.
   *
   * `status` is only ever advanced, never rewound: a late-arriving `started` webhook must
   * not un-ready a recording that has already produced clips.
   */
  private async handleRecordingWebhook(payload: {
    recordingId?: string;
    classId?: string;
    status?: 'PENDING' | 'RECORDING' | 'READY' | 'FAILED';
    storageKey?: string;
    durationSeconds?: number;
  }) {
    if (!payload.recordingId) return { skipped: 'no recordingId' };

    const existing = await this.prisma.recording.findUnique({
      where: { id: payload.recordingId },
      select: { id: true, status: true },
    });
    if (!existing) return { skipped: 'recording not found' };

    // Monotonic status: a late-arriving `RECORDING` webhook must not un-ready a
    // recording that has already produced clips.
    const order: Record<string, number> = {
      PENDING: 0,
      RECORDING: 1,
      READY: 2,
      FAILED: 3,
      DELETED: 4,
    };
    const incoming = payload.status ?? 'RECORDING';
    if ((order[incoming] ?? 0) < (order[existing.status] ?? 0)) {
      this.logger.warn(
        `Classroom: ignoring out-of-order recording webhook ${incoming} for ${existing.id}`,
      );
      return { ignored: true, current: existing.status };
    }

    const updated = await this.prisma.recording.update({
      where: { id: existing.id },
      data: {
        status: incoming as never,
        ...(payload.storageKey ? { storageKey: payload.storageKey } : {}),
        ...(payload.durationSeconds ? { durationSeconds: payload.durationSeconds } : {}),
      },
      select: { id: true, status: true, deleteAfter: true },
    });

    this.logger.log(`Classroom: recording ${updated.id} → ${updated.status}`);
    return updated;
  }

  /** Ayah marker captured live in the classroom (FR-CLS-12). */
  private async persistMarker(payload: {
    classId: string;
    surah?: number;
    ayah?: number;
    wordIndex?: number;
    kind?: 'PAGE_TURN' | 'HIGHLIGHT' | 'MISTAKE';
    offsetMs?: number;
  }) {
    if (!payload?.classId) return { skipped: 'no classId' };

    const recording = await this.prisma.recording.findFirst({
      where: { classId: payload.classId },
      select: { id: true },
    });
    if (!recording) return { skipped: 'no recording for class' };

    const marker = await this.prisma.recordingMarker.create({
      data: {
        recordingId: recording.id,
        surah: payload.surah ?? null,
        ayah: payload.ayah ?? null,
        wordIndex: payload.wordIndex ?? null,
        kind: (payload.kind ?? 'HIGHLIGHT') as never,
        offsetMs: payload.offsetMs ?? 0,
      },
    });

    return marker;
  }

  /** Erasure path — removes the object first, then the row. */
  private async deleteRecording(recordingId: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      select: { id: true, storageKey: true, status: true },
    });
    if (!recording) return { skipped: 'recording not found' };

    if (recording.storageKey) {
      try {
        await this.recordings.remove(recording.storageKey);
      } catch (error) {
        // Leave the row intact so retention retries; orphaning a file in storage is
        // recoverable, losing the pointer to it is not.
        this.logger.error(`Could not remove ${recording.storageKey}: ${(error as Error).message}`);
        return { removed: false };
      }
    }

    await this.prisma.recording.update({
      where: { id: recording.id },
      data: { status: 'DELETED', storageKey: null },
    });

    return { removed: true };
  }

  /**
   * Finds recordings marked READY whose object is gone.
   *
   * This is the check that turns "the video doesn't play" from a support ticket into a
   * log line. It is bounded and read-only apart from the correction.
   */
  private async reconcileRecordings() {
    // Egress writes recordings to their own bucket. Without it there are no recording
    // objects to reconcile, and treating every row as missing would mark real recordings
    // FAILED — skip until an operator configures the bucket.
    if (!this.recordings.configured) {
      if (!this.warnedNoRecordingStorage) {
        this.warnedNoRecordingStorage = true;
        this.logger.warn('Classroom: recording storage is not configured; skipping reconciliation');
      }
      return { scanned: 0, missing: 0, skipped: 'recording storage not configured' };
    }

    const candidates = await this.prisma.recording.findMany({
      where: { status: 'READY', storageKey: { not: null } },
      select: { id: true, storageKey: true },
      take: 200,
    });

    const missing: string[] = [];
    for (const recording of candidates) {
      try {
        const present = await this.recordings.objectExists(recording.storageKey!);
        if (!present) missing.push(recording.id);
      } catch (error) {
        // A storage outage must not mark healthy recordings FAILED; the next sweep retries.
        this.logger.error(
          `Classroom: could not check ${recording.storageKey} for recording ${recording.id}: ${(error as Error).message}`,
        );
      }
    }

    if (missing.length > 0) {
      // Marked, not deleted: an operator should decide whether the recording failed or
      // the storage path is wrong, and a job should not silently erase the evidence.
      await this.prisma.recording.updateMany({
        where: { id: { in: missing } },
        data: { status: 'FAILED' },
      });
      this.logger.error(
        `Classroom: ${missing.length} recording(s) marked READY have no object in storage: ${missing.join(', ')}`,
      );
    }

    return { scanned: candidates.length, missing: missing.length };
  }

  /**
   * Closes classes whose end time passed, which is what payroll keys off.
   *
   * The outcome comes from who actually joined (B37), not from the clock alone:
   *   - no teacher joined            -> NO_SHOW_TEACHER
   *   - teacher joined, nobody from the student's side (student or guardian) -> NO_SHOW_STUDENT
   *   - both sides joined            -> COMPLETED
   * A supervisor observing does not count as either side. Classes that started are
   * promoted to LIVE first (B36), so the two sweeps never disagree about a lesson that ran.
   */
  private async closeFinishedClasses() {
    const promoted = await this.classroom.promoteStartedClasses();

    const stale = await this.prisma.classSession.findMany({
      where: { endsAt: { lt: new Date() }, status: { in: ['SCHEDULED', 'LIVE'] } },
      select: { id: true },
      take: 500,
    });

    if (stale.length === 0) return { closed: 0, promoted };

    const participants = await this.prisma.classParticipant.findMany({
      where: { classId: { in: stale.map((c) => c.id) } },
      select: { classId: true, role: true },
    });
    const present = new Map<string, Set<string>>();
    for (const p of participants) {
      if (!present.has(p.classId)) present.set(p.classId, new Set());
      present.get(p.classId)!.add(p.role);
    }

    const outcome = (classId: string): 'COMPLETED' | 'NO_SHOW_TEACHER' | 'NO_SHOW_STUDENT' => {
      const roles = present.get(classId) ?? new Set<string>();
      if (!roles.has('TEACHER')) return 'NO_SHOW_TEACHER';
      if (!roles.has('STUDENT') && !roles.has('GUARDIAN_VIEWER')) return 'NO_SHOW_STUDENT';
      return 'COMPLETED';
    };

    const byStatus = new Map<string, string[]>();
    for (const session of stale) {
      const status = outcome(session.id);
      byStatus.set(status, [...(byStatus.get(status) ?? []), session.id]);
    }
    for (const [status, ids] of byStatus) {
      await this.prisma.classSession.updateMany({
        where: { id: { in: ids }, status: { in: ['SCHEDULED', 'LIVE'] } },
        data: { status: status as 'COMPLETED' | 'NO_SHOW_TEACHER' | 'NO_SHOW_STUDENT' },
      });
    }

    // Attendance minutes are banked here rather than on socket disconnect, because a
    // participant whose connection dies never sends a leave event.
    let banked = 0;
    for (const session of stale) {
      const result = await this.classroom
        .closeAttendance(session.id, SYSTEM_ACTOR)
        .catch(() => null);
      banked += result?.closed ?? 0;
    }

    const roomsEnded = await this.classroom.endRooms(stale.map((c) => c.id));

    this.logger.log(
      `Classroom: ended ${roomsEnded} room(s), closed ${stale.length} class(es) (${[...byStatus].map(([s, i]) => `${s}=${i.length}`).join(', ')}), banked ${banked} attendance record(s), promoted ${promoted} to LIVE`,
    );
    return { closed: stale.length, banked, promoted };
  }
}
