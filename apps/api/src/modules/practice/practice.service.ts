import { randomUUID } from 'crypto';

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConsentPurpose, RETENTION_DAYS, Role } from '@hifzoon/shared';
import { PracticeAssignmentStatus as PracticeStatus, PracticeMode } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { PolicyService, type PolicySubject } from '../../common/services/policy.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { ConsentService } from '../consent/consent.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

/** Recordings a browser can make (MediaRecorder) and the common upload formats. */
const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface AssignInput {
  studentId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  mode: PracticeMode;
  targetMinutes: number;
  dueOn?: string;
}

export interface SessionInput {
  assignmentId: string;
  minutes: number;
  wordsRecited?: number;
  revealsCount?: number;
  audioKey?: string;
}

/**
 * Practice between classes (FR-AIC): a teacher assigns a passage, the student practises
 * and logs each session, the teacher and family see the progress.
 *
 * No speech engine is wired yet (SPEECH_PROVIDER has only the fake, which marks every word
 * correct), so sessions are not machine-scored and no AI mistakes are created: a fabricated
 * "perfect" score would mislead the family and the teacher. The recording is kept for the
 * teacher to listen to, for 30 days (CR-02).
 */
@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly consent: ConsentService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async assign(subject: PolicySubject, input: AssignInput) {
    if (!(await this.policies.teacherOwnsStudent(subject.userId, input.studentId))) {
      throw AppError.forbidden('You can assign practice only to students you teach');
    }
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: subject.userId },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!teacher) throw AppError.forbidden('Only a teacher can assign practice');
    assertRange(input);
    const dueOn = input.dueOn ? new Date(`${input.dueOn}T00:00:00Z`) : null;
    if (dueOn && dueOn.getTime() < startOfTodayUtc()) {
      throw AppError.badRequest('The due date cannot be in the past');
    }

    const assignment = await this.prisma.practiceAssignment.create({
      data: {
        studentId: input.studentId,
        teacherId: teacher.id,
        fromSurah: input.fromSurah,
        fromAyah: input.fromAyah,
        toSurah: input.toSurah,
        toAyah: input.toAyah,
        mode: input.mode,
        targetMinutes: input.targetMinutes,
        dueOn,
      },
    });
    await this.tellFamily(assignment.id, teacher.user.name).catch((error: Error) =>
      this.logger.warn(`Family not told about practice ${assignment.id}: ${error.message}`),
    );
    return assignment;
  }

  /** Assignments the subject may see: their own (teacher), their children's, or their own (student). */
  async list(subject: PolicySubject, filter: { studentId?: string; status?: PracticeStatus }) {
    if (filter.studentId && !(await this.policies.canAccessStudent(subject, filter.studentId))) {
      throw AppError.forbidden('You cannot see this student’s practice');
    }
    const staff = ['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR'].some((r) => subject.roles.includes(r));
    const scope = staff
      ? {}
      : {
          OR: [
            { teacher: { userId: subject.userId } },
            { student: { family: { members: { some: { userId: subject.userId } } } } },
            { student: { userId: subject.userId } },
          ],
        };
    const rows = await this.prisma.practiceAssignment.findMany({
      where: {
        ...scope,
        ...(filter.studentId ? { studentId: filter.studentId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        student: { select: { id: true, displayName: true } },
        teacher: { select: { id: true, user: { select: { name: true } } } },
        sessions: { select: { minutes: true, startedAt: true } },
      },
    });
    const today = startOfTodayUtc();
    return rows.map(({ sessions, ...a }) => ({
      ...a,
      minutesDone: sessions.reduce((n, s) => n + s.minutes, 0),
      sessionCount: sessions.length,
      lastPractisedAt: sessions.reduce<Date | null>(
        (last, s) => (!last || s.startedAt > last ? s.startedAt : last),
        null,
      ),
      overdue:
        a.status !== PracticeStatus.COMPLETED && a.dueOn !== null && a.dueOn.getTime() < today,
    }));
  }

  /** A signed upload for a practice recording, under the student's own prefix. */
  async uploadUrl(
    subject: PolicySubject,
    input: { assignmentId: string; contentType: string; size: number },
  ) {
    const assignment = await this.assignmentForPractice(subject, input.assignmentId);
    await this.assertVoiceConsent(assignment.studentId);
    const ext = AUDIO_TYPES[input.contentType.split(';')[0].trim()];
    if (!ext) throw AppError.badRequest('Record in webm, ogg, m4a, mp3 or wav');
    if (input.size <= 0 || input.size > MAX_AUDIO_BYTES) {
      throw AppError.badRequest('A practice recording must be under 25 MB');
    }
    const key = this.storage.buildKey('practice', assignment.studentId, `${randomUUID()}.${ext}`);
    const url = await this.storage.signedUploadUrl(key, input.contentType, input.size);
    return { key, url };
  }

  async logSession(subject: PolicySubject, input: SessionInput) {
    // Practice past the target is still recorded; the assignment simply stays complete.
    const assignment = await this.assignmentForPractice(subject, input.assignmentId);
    if (input.audioKey) {
      await this.assertVoiceConsent(assignment.studentId);
      // Only a key this service issued: the student's prefix, a fresh name, an audio type.
      const name = input.audioKey.slice(`practice/${assignment.studentId}/`.length);
      if (
        !input.audioKey.startsWith(`practice/${assignment.studentId}/`) ||
        !/^[0-9a-f-]{36}\.(webm|ogg|m4a|mp3|wav)$/.test(name)
      ) {
        throw AppError.badRequest('That recording does not belong to this student');
      }
      if (!(await this.storage.objectExists(input.audioKey))) {
        throw AppError.badRequest('The recording has not finished uploading');
      }
    }
    const now = new Date();
    const session = await this.prisma.practiceSession.create({
      data: {
        assignmentId: assignment.id,
        studentId: assignment.studentId,
        startedAt: new Date(now.getTime() - input.minutes * 60_000),
        endedAt: now,
        minutes: input.minutes,
        wordsRecited: input.wordsRecited ?? 0,
        revealsCount: input.revealsCount ?? 0,
        audioKey: input.audioKey ?? null,
        audioDeleteAfter: input.audioKey
          ? new Date(now.getTime() + RETENTION_DAYS.AI_AUDIO * 86_400_000)
          : null,
        resultSummary: {
          scored: false,
          note: 'Automatic recitation scoring is not switched on yet; the teacher reviews the recording.',
        },
      },
    });

    const total = await this.prisma.practiceSession.aggregate({
      where: { assignmentId: assignment.id },
      _sum: { minutes: true },
    });
    const status =
      assignment.status === PracticeStatus.COMPLETED ||
      (total._sum.minutes ?? 0) >= assignment.targetMinutes
        ? PracticeStatus.COMPLETED
        : PracticeStatus.IN_PROGRESS;
    if (status !== assignment.status) {
      await this.prisma.practiceAssignment.update({
        where: { id: assignment.id },
        data: { status },
      });
    }
    return { session, assignmentStatus: status, minutesDone: total._sum.minutes ?? 0 };
  }

  async sessions(subject: PolicySubject, assignmentId: string) {
    const assignment = await this.prisma.practiceAssignment.findUnique({
      where: { id: assignmentId },
      select: { studentId: true },
    });
    if (!assignment) throw AppError.notFound('Practice');
    if (!(await this.policies.canAccessStudent(subject, assignment.studentId))) {
      throw AppError.forbidden('You cannot see this student’s practice');
    }
    const rows = await this.prisma.practiceSession.findMany({
      where: { assignmentId },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        minutes: true,
        wordsRecited: true,
        revealsCount: true,
        audioKey: true,
        audioDeleteAfter: true,
        resultSummary: true,
      },
    });
    // Signed links, never the storage key: the key is an internal path.
    return Promise.all(
      rows.map(async ({ audioKey, ...s }) => ({
        ...s,
        hasAudio: Boolean(audioKey),
        audioUrl: audioKey ? await this.storage.signedDownloadUrl(audioKey) : null,
      })),
    );
  }

  /** A child's voice is kept only while a guardian's AI_VOICE consent stands (FR-AIC-09). */
  private async assertVoiceConsent(studentId: string) {
    if (!(await this.consent.hasConsent(studentId, ConsentPurpose.AI_VOICE))) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'A guardian has not agreed to practice recordings. Practice can still be logged without one.',
        { studentId, missing: [ConsentPurpose.AI_VOICE] },
      );
    }
  }

  /** The assignment, if the subject is the student or one of their guardians. */
  private async assignmentForPractice(subject: PolicySubject, assignmentId: string) {
    const assignment = await this.prisma.practiceAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, studentId: true, status: true, targetMinutes: true },
    });
    if (!assignment) throw AppError.notFound('Practice');
    const own =
      ((subject.roles.includes(Role.STUDENT) || subject.roles.includes(Role.CHILD_STUDENT)) &&
        (await this.policies.studentSelf(subject.userId, assignment.studentId))) ||
      (subject.roles.includes(Role.GUARDIAN) &&
        (await this.policies.guardianOwnsStudent(subject.userId, assignment.studentId)));
    if (!own) throw AppError.forbidden('Only the student or their family can log this practice');
    return assignment;
  }

  private async tellFamily(assignmentId: string, teacherName: string) {
    if (!this.notifications) return;
    const a = await this.prisma.practiceAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        fromSurah: true,
        fromAyah: true,
        toSurah: true,
        toAyah: true,
        targetMinutes: true,
        dueOn: true,
        student: {
          select: {
            id: true,
            displayName: true,
            userId: true,
            family: { select: { members: { select: { userId: true } } } },
          },
        },
      },
    });
    const web = this.config.value.APP_WEB_URL.replace(/\/$/, '');
    const data = {
      studentName: a.student.displayName,
      teacherName,
      range: `${a.fromSurah}:${a.fromAyah}–${a.toSurah}:${a.toAyah}`,
      minutes: a.targetMinutes,
      due: a.dueOn ? a.dueOn.toISOString().slice(0, 10) : 'no set date',
    };
    // Each reader gets a link into their own portal.
    const guardians = a.student.family.members
      .map((m) => m.userId)
      .filter((id) => id !== a.student.userId);
    if (guardians.length > 0) {
      await this.notifications.enqueue({
        userIds: guardians,
        template: TEMPLATE.PRACTICE_ASSIGNED,
        data: { ...data, url: `${web}/parent/children/${a.student.id}/practice/${assignmentId}` },
      });
    }
    if (a.student.userId) {
      await this.notifications.enqueue({
        userIds: [a.student.userId],
        template: TEMPLATE.PRACTICE_ASSIGNED,
        data: { ...data, url: `${web}/student/practice/${assignmentId}` },
      });
    }
  }
}

function assertRange(input: AssignInput) {
  const inRange = (s: number) => Number.isInteger(s) && s >= 1 && s <= 114;
  if (!inRange(input.fromSurah) || !inRange(input.toSurah)) {
    throw AppError.badRequest('Surahs are numbered 1 to 114');
  }
  if (input.fromAyah < 1 || input.toAyah < 1) throw AppError.badRequest('Ayahs start at 1');
  const start = input.fromSurah * 1000 + input.fromAyah;
  const end = input.toSurah * 1000 + input.toAyah;
  if (end < start) throw AppError.badRequest('The passage ends before it starts');
}

function startOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
