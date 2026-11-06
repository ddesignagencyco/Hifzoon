import { randomUUID } from 'crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConsentPurpose, MISTAKE_TYPES, RETENTION_DAYS, Role } from '@hifzoon/shared';
import {
  MistakeSource,
  MistakeType,
  PracticeAssignmentStatus as PracticeStatus,
  PracticeBoard,
  PracticeMode,
  Prisma,
} from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { QURAN_CONTENT, type QuranContentProvider } from '../../integrations/providers';
import { PolicyService, type PolicySubject } from '../../common/services/policy.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { ConsentService } from '../consent/consent.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import { AYAH_COUNTS, ayahsInRange } from './passage';
import { boardDisplay, boardLabel, boardMistakeTypes, itemRefInBoard } from './board';

/** Recordings a browser can make (MediaRecorder) and the common upload formats. */
const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Nothing is scored automatically: the teacher listens and replies (see `review`).
const TEACHER_NOTE = 'Your teacher will listen and reply.';
const PREPARE_NOTE = 'Practice on your own. Your teacher does not review this part.';

/**
 * A surah/ayah range (the four range fields), or a board item (`board` + `boardLesson`, and for
 * Duas optionally `boardItem`): exactly one of the two.
 */
export interface AssignInput {
  studentId: string;
  fromSurah?: number | null;
  fromAyah?: number | null;
  toSurah?: number | null;
  toAyah?: number | null;
  board?: PracticeBoard | null;
  boardLesson?: number | null;
  boardItem?: number | null;
  mode: PracticeMode;
  targetMinutes: number;
  dueOn?: string;
}

/** A word on the Mushaf, or (board practice) the dua word / Qaida item as `itemRef`. */
export interface ReviewMark {
  surah?: number;
  ayah?: number;
  wordIndex?: number;
  itemRef?: string;
  type: MistakeType;
}

export interface ReviewInput {
  feedback?: string;
  mistakes?: ReviewMark[];
}

const STAFF_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR'];
const MAX_SESSION_MINUTES = 180;
/** Older sessions drop off the teacher's queue: the child has moved on by then. */
const REVIEW_WINDOW_DAYS = 30;

const SESSION_SELECT = {
  id: true,
  startedAt: true,
  endedAt: true,
  minutes: true,
  wordsRecited: true,
  revealsCount: true,
  audioKey: true,
  audioDeleteAfter: true,
  resultSummary: true,
  reviewedAt: true,
  feedback: true,
  reviewedBy: { select: { name: true } },
  // The teacher's marks, for word-by-word feedback.
  mistakes: {
    orderBy: [{ surah: 'asc' }, { ayah: 'asc' }, { wordIndex: 'asc' }],
    select: {
      id: true,
      surah: true,
      ayah: true,
      wordIndex: true,
      type: true,
      note: true,
      source: true,
      confirmed: true,
      dismissedAt: true,
      resolvedAt: true,
    },
  },
} satisfies Prisma.PracticeSessionSelect;

type SessionRow = Prisma.PracticeSessionGetPayload<{ select: typeof SESSION_SELECT }>;

/**
 * A recitation is a session with a recording for the teacher; a prepare session is the child's
 * own practice (reading, listening, testing themselves) and is never queued for review.
 * Audio is deleted after 30 days (the key is cleared, audioDeleteAfter stays set), so a
 * recitation is one that has or had audio. An already reviewed session also counts, so the
 * teacher's reply is never hidden.
 */
export type SessionKind = 'PREPARE' | 'RECITATION';
export function sessionKind(s: {
  audioKey: string | null;
  audioDeleteAfter: Date | null;
  reviewedAt: Date | null;
}): SessionKind {
  return s.audioKey || s.audioDeleteAfter || s.reviewedAt ? 'RECITATION' : 'PREPARE';
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
 * Nothing is scored by machine. The teacher reviews each session (`review`): feedback and the
 * words they heard wrong, which join the student's mistake history. A recording, if one was
 * made, is kept for the teacher to listen to, for 30 days (CR-02).
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
    @Optional() private readonly audit?: AuditService,
    @Optional() @Inject(QURAN_CONTENT) private readonly quran?: QuranContentProvider,
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
    const passage = passageOf(input);
    const dueOn = input.dueOn ? new Date(`${input.dueOn}T00:00:00Z`) : null;
    if (dueOn && dueOn.getTime() < startOfTodayUtc()) {
      throw AppError.badRequest('The due date cannot be in the past');
    }

    const assignment = await this.prisma.practiceAssignment.create({
      data: {
        studentId: input.studentId,
        teacherId: teacher.id,
        ...passage,
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
        sessions: {
          select: {
            minutes: true,
            startedAt: true,
            audioKey: true,
            reviewedAt: true,
            reviewedBy: { select: { name: true } },
          },
        },
      },
    });
    const today = startOfTodayUtc();
    return rows.map(({ sessions, ...a }) => ({
      ...a,
      // Only a recording waits for the teacher; prepare sessions are the child's own practice.
      awaitingReview: sessions.filter((s) => s.audioKey && !s.reviewedAt).length,
      lastReview: sessions.reduce<{ at: Date; by: string | null } | null>(
        (last, s) =>
          s.reviewedAt && (!last || s.reviewedAt > last.at)
            ? { at: s.reviewedAt, by: s.reviewedBy?.name ?? null }
            : last,
        null,
      ),
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
    // The timer rounds up to whole minutes; a sitting longer than this is a tab left open.
    if (
      !Number.isInteger(input.minutes) ||
      input.minutes < 1 ||
      input.minutes > MAX_SESSION_MINUTES
    ) {
      throw AppError.badRequest(`Log between 1 and ${MAX_SESSION_MINUTES} minutes`);
    }
    if (
      input.revealsCount !== undefined &&
      (!Number.isInteger(input.revealsCount) || input.revealsCount < 0)
    ) {
      throw AppError.badRequest('Reveals must be a whole number');
    }
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
        resultSummary: { scored: false, note: input.audioKey ? TEACHER_NOTE : PREPARE_NOTE },
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
      select: SESSION_SELECT,
    });
    return Promise.all(rows.map((row) => this.present(row)));
  }

  /** One session with its assignment, for the teacher's review screen. */
  async session(subject: PolicySubject, sessionId: string) {
    const row = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      select: {
        ...SESSION_SELECT,
        studentId: true,
        assignment: {
          select: {
            id: true,
            studentId: true,
            fromSurah: true,
            fromAyah: true,
            toSurah: true,
            toAyah: true,
            ...BOARD_SELECT,
            mode: true,
            targetMinutes: true,
            student: { select: { id: true, displayName: true } },
            teacher: { select: { id: true, userId: true, user: { select: { name: true } } } },
          },
        },
      },
    });
    if (!row) throw AppError.notFound('Practice session');
    if (!(await this.policies.canAccessStudent(subject, row.studentId))) {
      throw AppError.forbidden('You cannot see this student’s practice');
    }
    const { assignment, studentId: _studentId, ...session } = row;
    return {
      session: await this.present(session),
      assignment: assignment
        ? { ...assignment, teacher: { id: assignment.teacher.id, user: assignment.teacher.user } }
        : null,
      canReview: Boolean(
        assignment && (isStaff(subject) || assignment.teacher.userId === subject.userId),
      ),
    };
  }

  /**
   * The teacher's reply to a session: feedback and the words they heard wrong. This closes the
   * loop without AI. Marks are the teacher's own (source CLASS, confirmed) and tied to the
   * session, so they join the student's mistake history like any other. A second review edits:
   * the feedback is replaced and only marks not already on the session are added.
   */
  async review(subject: PolicySubject, sessionId: string, input: ReviewInput) {
    const row = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        studentId: true,
        startedAt: true,
        audioKey: true,
        audioDeleteAfter: true,
        reviewedAt: true,
        feedback: true,
        assignment: {
          select: {
            id: true,
            fromSurah: true,
            fromAyah: true,
            toSurah: true,
            toAyah: true,
            ...BOARD_SELECT,
            teacher: { select: { userId: true } },
          },
        },
        mistakes: {
          where: { dismissedAt: null, source: MistakeSource.CLASS },
          select: { id: true, surah: true, ayah: true, wordIndex: true, itemRef: true, type: true },
        },
      },
    });
    if (!row) throw AppError.notFound('Practice session');
    const assignment = row.assignment;
    if (!assignment || !(isStaff(subject) || assignment.teacher.userId === subject.userId)) {
      throw AppError.forbidden('Only the teacher who set this practice can review it');
    }
    if (sessionKind(row) !== 'RECITATION') {
      throw AppError.badRequest('Only a recitation can be reviewed; this was a practice session.');
    }

    const marks = input.mistakes ?? [];
    for (const m of marks) assertMarkInPassage(m, assignment);
    const board = assignment.board;
    const feedback =
      input.feedback === undefined ? row.feedback : input.feedback.trim().slice(0, 1000) || null;

    // A word already marked is not added twice, so a re-sent review only adds what is new.
    const key = (m: {
      surah?: number | null;
      ayah?: number | null;
      wordIndex?: number | null;
      itemRef?: string | null;
      type: string;
    }) =>
      board
        ? `${(m.itemRef ?? '').trim()}:${m.type}`
        : `${m.surah}:${m.ayah}:${m.wordIndex}:${m.type}`;
    const existing = new Map(row.mistakes.map((m) => [key(m), m]));
    const seen = new Set<string>();
    const fresh: ReviewMark[] = [];
    for (const m of marks) {
      const k = key(m);
      if (seen.has(k) || existing.has(k)) continue;
      seen.add(k);
      fresh.push(m);
    }

    const now = new Date();
    await this.prisma.$transaction([
      ...(fresh.length > 0
        ? [
            this.prisma.mistake.createMany({
              data: fresh.map((m) => ({
                studentId: row.studentId,
                practiceSessionId: row.id,
                surah: board ? null : m.surah,
                ayah: board ? null : m.ayah,
                wordIndex: board ? null : m.wordIndex,
                itemRef: board ? m.itemRef!.trim().slice(0, 160) : null,
                type: m.type,
                source: MistakeSource.CLASS,
                confirmed: true,
                confirmedById: subject.userId,
                occurredAt: row.startedAt,
              })),
            }),
          ]
        : []),
      this.prisma.practiceSession.update({
        where: { id: row.id },
        data: { reviewedAt: row.reviewedAt ?? now, reviewedById: subject.userId, feedback },
      }),
    ]);

    await this.audit?.record({
      actorId: subject.userId,
      action: 'practice.session.review',
      targetType: 'practice_session',
      targetId: row.id,
      before: { reviewedAt: row.reviewedAt, feedback: row.feedback },
      after: { feedback, added: fresh.length },
    });

    // The family hears on the first reply, and again only when something new was said.
    if (!row.reviewedAt || feedback !== row.feedback || fresh.length > 0) {
      await this.tellFamilyReviewed(row.id, subject.userId, feedback).catch((error: Error) =>
        this.logger.warn(`Family not told about the review of ${row.id}: ${error.message}`),
      );
    }
    return {
      id: row.id,
      reviewedAt: row.reviewedAt ?? now,
      feedback,
      added: fresh.length,
    };
  }

  /**
   * Sessions waiting for the teacher's reply: their own students' practice from the last 30
   * days, newest first. Staff see every teacher's queue.
   */
  async toReview(subject: PolicySubject, status: 'waiting' | 'reviewed' | 'all' = 'waiting') {
    const since = new Date(Date.now() - REVIEW_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.practiceSession.findMany({
      where: {
        ...(status === 'waiting'
          ? { reviewedAt: null }
          : status === 'reviewed'
            ? { reviewedAt: { not: null } }
            : {}),
        startedAt: { gte: since },
        // Only recitations: a recording to hear, or one already reviewed (its audio may have
        // been deleted since). Prepare sessions never reach the teacher.
        ...(status === 'waiting'
          ? { audioKey: { not: null } }
          : { OR: [{ audioKey: { not: null } }, { reviewedAt: { not: null } }] }),
        assignment: isStaff(subject)
          ? { isNot: null }
          : { is: { teacher: { userId: subject.userId } } },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        startedAt: true,
        minutes: true,
        revealsCount: true,
        audioKey: true,
        reviewedAt: true,
        assignment: {
          select: {
            id: true,
            fromSurah: true,
            fromAyah: true,
            toSurah: true,
            toAyah: true,
            ...BOARD_SELECT,
            mode: true,
            student: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    return rows.map(({ audioKey, ...r }) => ({
      ...r,
      hasAudio: Boolean(audioKey),
      kind: 'RECITATION',
    }));
  }

  /** Signed links, never the storage key: the key is an internal path. */
  private async present({ audioKey, mistakes, reviewedBy, ...s }: SessionRow) {
    const rows = mistakes ?? [];
    return {
      ...s,
      reviewedBy: reviewedBy ? { name: reviewedBy.name } : null,
      kind: sessionKind({
        audioKey,
        audioDeleteAfter: s.audioDeleteAfter,
        reviewedAt: s.reviewedAt,
      }),
      hasAudio: Boolean(audioKey),
      audioUrl: audioKey ? await this.storage.signedDownloadUrl(audioKey) : null,
      // The teacher's marks. Rows from the retired automatic scoring count only where the
      // teacher confirmed them; an unconfirmed one was never the teacher's word.
      marks: rows
        .filter((m) => !m.dismissedAt && (m.source === MistakeSource.CLASS || m.confirmed))
        .map((m) => ({
          id: m.id,
          surah: m.surah,
          ayah: m.ayah,
          wordIndex: m.wordIndex,
          type: m.type,
          note: m.note,
          resolvedAt: m.resolvedAt,
        })),
    };
  }

  /**
   * Reference recitation for each ayah of the passage (FR-AIC-04), capped at one sitting.
   * The audio comes from the licensed Quran source, independent of the scoring engine.
   */
  async referenceAudio(subject: PolicySubject, assignmentId: string) {
    const assignment = await this.prisma.practiceAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        studentId: true,
        fromSurah: true,
        fromAyah: true,
        toSurah: true,
        toAyah: true,
        board: true,
      },
    });
    if (!assignment) throw AppError.notFound('Practice');
    if (!(await this.policies.canAccessStudent(subject, assignment.studentId))) {
      throw AppError.forbidden('You cannot see this student’s practice');
    }
    // A dua or Qaida lesson has no qari recitation.
    const range = rangeOf(assignment);
    if (!range) return { available: false, truncated: false, ayahs: [] };
    const { ayahs, truncated } = ayahsInRange(range);
    const quran = this.quran;
    if (!quran?.recitationAudioUrl || !quran.isLicensed()) {
      return { available: false, truncated, ayahs: [] };
    }
    const urls = await Promise.all(
      ayahs.map(async (a) => ({ ...a, url: await quran.recitationAudioUrl!(a.surah, a.ayah) })),
    );
    return { available: true, truncated, ayahs: urls };
  }

  /** Whether a practice recording may be sent, so the screen can say so before recording. */
  async recordingAllowed(subject: PolicySubject, assignmentId: string) {
    const assignment = await this.prisma.practiceAssignment.findUnique({
      where: { id: assignmentId },
      select: { studentId: true },
    });
    if (!assignment) throw AppError.notFound('Practice');
    if (!(await this.policies.canAccessStudent(subject, assignment.studentId))) {
      throw AppError.forbidden('You cannot see this student’s practice');
    }
    return {
      allowed: await this.consent.hasConsent(assignment.studentId, ConsentPurpose.AI_VOICE),
    };
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

  private async tellFamilyReviewed(sessionId: string, reviewerId: string, feedback: string | null) {
    if (!this.notifications) return;
    const [s, reviewer] = await Promise.all([
      this.prisma.practiceSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          assignment: {
            select: {
              id: true,
              fromSurah: true,
              fromAyah: true,
              toSurah: true,
              toAyah: true,
              ...BOARD_SELECT,
            },
          },
          _count: { select: { mistakes: { where: { dismissedAt: null, confirmed: true } } } },
          student: {
            select: {
              id: true,
              displayName: true,
              userId: true,
              family: { select: { members: { select: { userId: true } } } },
            },
          },
        },
      }),
      this.prisma.user.findUnique({ where: { id: reviewerId }, select: { name: true } }),
    ]);
    const a = s.assignment;
    if (!a) return;
    const web = this.config.value.APP_WEB_URL.replace(/\/$/, '');
    const data = {
      studentName: s.student.displayName,
      teacherName: reviewer?.name ?? 'The teacher',
      range: passageText(a),
      feedback: feedback ?? '',
      mistakes: s._count.mistakes,
    };
    const guardians = s.student.family.members
      .map((m) => m.userId)
      .filter((id) => id !== s.student.userId);
    if (guardians.length > 0) {
      await this.notifications.enqueue({
        userIds: guardians,
        template: TEMPLATE.PRACTICE_REVIEWED,
        data: { ...data, url: `${web}/parent/children/${s.student.id}/practice/${a.id}` },
      });
    }
    if (s.student.userId) {
      await this.notifications.enqueue({
        userIds: [s.student.userId],
        template: TEMPLATE.PRACTICE_REVIEWED,
        data: { ...data, url: `${web}/student/practice/${a.id}` },
      });
    }
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
        ...BOARD_SELECT,
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
      range: passageText(a),
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

function isStaff(subject: PolicySubject): boolean {
  return STAFF_ROLES.some((r) => subject.roles.includes(r));
}

type PassageColumns = {
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  board: PracticeBoard | null;
  boardLesson: number | null;
  boardItem: number | null;
  label: string | null;
};

/** The board columns, selected wherever the range columns are. */
const BOARD_SELECT = { board: true, boardLesson: true, boardItem: true, label: true } as const;

/** The surah/ayah range of an assignment, or null for a board item. */
function rangeOf(a: {
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  board?: PracticeBoard | null;
}) {
  if (
    a.board ||
    a.fromSurah === null ||
    a.fromAyah === null ||
    a.toSurah === null ||
    a.toAyah === null
  ) {
    return null;
  }
  return { fromSurah: a.fromSurah, fromAyah: a.fromAyah, toSurah: a.toSurah, toAyah: a.toAyah };
}

/** "67:1–67:10", or "Duas: Before eating" / "Qaida: Lesson 3 — …", for notifications. */
function passageText(a: PassageColumns): string {
  if (a.board) return boardDisplay({ board: a.board, boardLesson: a.boardLesson, label: a.label });
  return `${a.fromSurah}:${a.fromAyah}–${a.toSurah}:${a.toAyah}`;
}

/**
 * A mark must sit on what was assigned, with a category of its kind: a word of the passage
 * (recitation categories), or for a board practice a dua word / Qaida item of it (the course's
 * own categories).
 */
function assertMarkInPassage(m: ReviewMark, a: PassageColumns) {
  if (a.board) {
    const ref = typeof m.itemRef === 'string' ? m.itemRef.trim() : '';
    if (!ref || m.surah !== undefined || m.ayah !== undefined || m.wordIndex !== undefined) {
      throw AppError.badRequest('Mark the dua word or Qaida item, not an ayah');
    }
    if (
      ref.length > 160 ||
      a.boardLesson === null ||
      !itemRefInBoard(ref, { board: a.board, boardLesson: a.boardLesson, boardItem: a.boardItem })
    ) {
      throw AppError.badRequest(`“${ref.slice(0, 60)}” is not in this practice`);
    }
    if (!boardMistakeTypes(a.board).includes(m.type)) {
      throw AppError.badRequest(`Choose a ${a.board === 'DUAS' ? 'Duas' : 'Qaida'} mistake type`);
    }
    return;
  }
  const range = rangeOf(a);
  if (!range) throw AppError.badRequest('This practice has no passage');
  if (m.itemRef !== undefined) throw AppError.badRequest('Mark a word of the passage');
  const surah = m.surah as number;
  const ayah = m.ayah as number;
  const count = AYAH_COUNTS[surah - 1];
  if (!Number.isInteger(surah) || count === undefined) {
    throw AppError.badRequest('Surahs are numbered 1 to 114');
  }
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > count) {
    throw AppError.badRequest(`Surah ${surah} has ${count} ayahs`);
  }
  if (!Number.isInteger(m.wordIndex) || (m.wordIndex as number) < 0) {
    throw AppError.badRequest('Pick a word in the ayah');
  }
  const at = surah * 1000 + ayah;
  if (at < range.fromSurah * 1000 + range.fromAyah || at > range.toSurah * 1000 + range.toAyah) {
    throw AppError.badRequest(`${surah}:${ayah} is not in this practice passage`);
  }
  if (!(MISTAKE_TYPES as readonly string[]).includes(m.type)) {
    throw AppError.badRequest('Choose a recitation mistake type');
  }
}

const given = (v: unknown) => v !== undefined && v !== null;

/**
 * The columns an assignment stores: a checked surah/ayah range, or a board item with its label.
 * Exactly one of the two must be given.
 */
export function passageOf(input: AssignInput): PassageColumns {
  const rangeFields = [input.fromSurah, input.fromAyah, input.toSurah, input.toAyah];
  const hasRange = rangeFields.some(given);
  const hasBoard = given(input.board) || given(input.boardLesson) || given(input.boardItem);
  if (hasRange && hasBoard) {
    throw AppError.badRequest('Set either a surah/ayah passage or a dua / Qaida lesson, not both');
  }
  if (!hasRange && !hasBoard) {
    throw AppError.badRequest('Choose a passage, a dua chapter or a Qaida lesson');
  }
  if (hasBoard) {
    const board = input.board;
    if (board !== PracticeBoard.DUAS && board !== PracticeBoard.QAIDA) {
      throw AppError.badRequest('Choose Duas or Qaida');
    }
    const lesson = input.boardLesson;
    if (typeof lesson !== 'number' || !Number.isInteger(lesson) || lesson < 1) {
      throw AppError.badRequest(
        board === 'DUAS' ? 'Choose a dua chapter' : 'Choose a Qaida lesson',
      );
    }
    const item = input.boardItem ?? null;
    if (item !== null && (board === 'QAIDA' || !Number.isInteger(item) || item < 0)) {
      throw AppError.badRequest(
        board === 'QAIDA' ? 'A Qaida practice is a whole lesson' : 'Choose a dua of the chapter',
      );
    }
    const label = boardLabel({ board, boardLesson: lesson, boardItem: item });
    if (!label) {
      throw AppError.badRequest(
        board === 'DUAS' ? 'That dua chapter or dua does not exist' : 'The Qaida has 17 lessons',
      );
    }
    return {
      fromSurah: null,
      fromAyah: null,
      toSurah: null,
      toAyah: null,
      board,
      boardLesson: lesson,
      boardItem: item,
      label,
    };
  }
  if (!rangeFields.every((v) => typeof v === 'number' && Number.isInteger(v))) {
    throw AppError.badRequest('Give the surah and ayah where the passage starts and ends');
  }
  const [fromSurah, fromAyah, toSurah, toAyah] = rangeFields as number[];
  const inRange = (n: number) => n >= 1 && n <= 114;
  if (!inRange(fromSurah) || !inRange(toSurah)) {
    throw AppError.badRequest('Surahs are numbered 1 to 114');
  }
  if (fromAyah < 1 || toAyah < 1) throw AppError.badRequest('Ayahs start at 1');
  if (toSurah * 1000 + toAyah < fromSurah * 1000 + fromAyah) {
    throw AppError.badRequest('The passage ends before it starts');
  }
  return {
    fromSurah,
    fromAyah,
    toSurah,
    toAyah,
    board: null,
    boardLesson: null,
    boardItem: null,
    label: null,
  };
}

function startOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
