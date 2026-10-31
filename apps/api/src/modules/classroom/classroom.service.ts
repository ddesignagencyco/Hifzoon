import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CLASSROOM_EARLY_OPEN_MINUTES,
  ConsentPurpose,
  ErrorCode,
  MUSHAF_MAX_PAGE,
  MUSHAF_MIN_PAGE,
  MushafLayout,
  ParticipantRole,
  Role,
} from '@hifzoon/shared';

import { AuthenticatedUser } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { PolicyService, type PolicySubject } from '../../common/services/policy.service';
import { toSharedLayout, toSharedParticipantRole } from '../../common/prisma-enum-bridge';
import { VIDEO_PROVIDER, VideoProvider } from '../../integrations/providers';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { StorageService } from '../../storage/storage.service';

/** How long a room token stays valid. Short by design: it is scoped to one class. */
export const ROOM_TOKEN_TTL_SECONDS = CLASSROOM_EARLY_OPEN_MINUTES * 60 * 2;

export interface RoomTokenClaims {
  sub: string;
  cid: string;
  role: ParticipantRole;
  studentId: string | null;
  /** Base64url of the signed claims; the gateway verifies without a database hit. */
  token: string;
  url: string;
  /** Video provider (LiveKit) access token the browser connects with. */
  videoToken: string;
  expiresAt: Date;
}

export interface ClassroomSnapshot {
  classId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  layout: MushafLayout;
  tajweedColours: boolean;
  page: number | null;
  highlight: { surah: number; ayah: number; wordIndex: number } | null;
  /** What the class is, so a meeting screen can title it (M55). */
  course: { name: string } | null;
  students: Array<{ id: string; displayName: string }>;
  /** Null until a recording has been started. `startedAt` is when its row was created. */
  recording: { status: string; startedAt: string } | null;
  participants: Array<{
    userId: string;
    /** The child's name for a STUDENT participant, so a guardian joined as a child shows as them (R9). */
    displayName: string;
    /** The student a STUDENT participant sits as; null for teachers and watch-only guardians. */
    studentId: string | null;
    role: ParticipantRole;
    joinedAt: string;
    /** Null until the participant has reported their media state. */
    micOn: boolean | null;
    camOn: boolean | null;
  }>;
  serverTime: string;
}

/** Reported by each participant over the socket; kept for the length of a class. */
export interface MediaState {
  micOn: boolean;
  camOn: boolean;
}

const MEDIA_STATE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Live classroom (CLS-BE-02, CLS-BE-03, CLS-BE-06, CLS-BE-10, CLS-BE-16,
 * FR-CLS-01, FR-CLS-12, FR-CLS-14, FR-CLS-16).
 *
 * Two rules shape the whole module:
 *
 *   **The room opens 10 minutes early and not a second sooner** (FR-CLS-01). A parent
 *   who joins on Monday morning should not be able to sit in a room and hear a class
 *   that has not started — and a teacher should be able to set up first.
 *
 *   **Recording requires consent from every enrolled student** (FR-CLS-12). Not "most",
 *   not "the student", not "the guardian who signed up" — every one, because a recording
 *   with one missing consent is a child-safety incident, not a product bug.
 */
@Injectable()
export class ClassroomService {
  private readonly logger = new Logger(ClassroomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
    private readonly policies: PolicyService,
    private readonly storage: StorageService,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
  ) {}

  // ── Room tokens (FR-CLS-01) ───────────────────────────────────────────────

  /**
   * Issues a short-lived token for one class, after checking three things: the caller
   * is allowed on this class, the class exists and is not finished, and the window is
   * open. The caller then exchanges it for a provider token and a socket identity.
   */
  async issueRoomToken(
    user: AuthenticatedUser,
    classId: string,
    asStudentId?: string,
  ): Promise<RoomTokenClaims> {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        teacherId: true,
        teacher: { select: { id: true, userId: true } },
        students: {
          select: {
            studentId: true,
            student: { select: { id: true, userId: true, displayName: true } },
          },
        },
      },
    });

    if (!session) throw AppError.notFound('Class');

    const now = Date.now();
    const opensAt = session.startsAt.getTime() - CLASSROOM_EARLY_OPEN_MINUTES * 60_000;
    const closesAt = session.endsAt.getTime() + CLASSROOM_EARLY_OPEN_MINUTES * 60_000;

    if (now < opensAt) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `FR-CLS-01: the room opens ${CLASSROOM_EARLY_OPEN_MINUTES} minutes before the class starts`,
        { opensAt: new Date(opensAt).toISOString(), startsAt: session.startsAt.toISOString() },
      );
    }
    if (now > closesAt) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'This class has already finished', {
        endsAt: session.endsAt.toISOString(),
      });
    }
    if (session.status === 'CANCELLED_FAMILY' || session.status === 'CANCELLED_TEACHER') {
      throw new AppError(ErrorCode.CONFLICT, `This class is ${session.status}`);
    }

    // M48 — a child usually has no login, so a guardian may join *as* the child: they sit
    // the child at their own device and the participant is the student, who can publish.
    // Without this the only role a guardian could get was watch-only, so no student was
    // ever in the room.
    if (asStudentId) await this.assertMayJoinAsStudent(user, session, asStudentId);

    const role = asStudentId
      ? ParticipantRole.STUDENT
      : await this.resolveParticipantRole(user, session);

    const claims = {
      sub: user.id,
      cid: session.id,
      role,
      studentId: asStudentId ?? this.studentIdFor(session, user),
    };

    const token = this.signRoomToken(claims);
    const room = await this.ensureRoom(session.id);

    // R9 — a guardian sitting as their child appears under the child's name, not their own.
    const asChild = asStudentId
      ? session.students.find((s) => s.studentId === asStudentId)?.student.displayName
      : undefined;

    const providerToken = await this.video.issueToken({
      roomId: room.roomId,
      userId: user.id,
      displayName: asChild ?? user.name,
      role:
        role === ParticipantRole.TEACHER
          ? 'teacher'
          : role === ParticipantRole.GUARDIAN_VIEWER
            ? 'guardian'
            : 'student',
      // A guardian joining to watch must never be able to publish audio or video
      // (FR-CLS-13).
      canPublish: role !== ParticipantRole.GUARDIAN_VIEWER,
      ttlSeconds: ROOM_TOKEN_TTL_SECONDS,
    });

    return {
      ...claims,
      token,
      url: providerToken.url,
      videoToken: providerToken.token,
      expiresAt: providerToken.expiresAt,
    };
  }

  /**
   * A guardian may join as one of their own children, and only a child who is on this
   * class. Staff and teachers cannot use this to appear as a student.
   */
  private async assertMayJoinAsStudent(
    user: AuthenticatedUser,
    session: { students: Array<{ studentId: string }> },
    studentId: string,
  ): Promise<void> {
    if (!user.roles.includes(Role.GUARDIAN)) {
      throw AppError.forbidden('Only a guardian can join as their child');
    }
    if (!session.students.some((s) => s.studentId === studentId)) {
      throw AppError.forbidden('That child is not on this class');
    }
    await this.policies.assertGuardianOwnsStudent(user.id, studentId);
  }

  private async resolveParticipantRole(
    user: AuthenticatedUser,
    session: {
      id: string;
      teacher: { id: string; userId: string };
      students: Array<{ studentId: string; student: { userId: string | null } }>;
    },
  ): Promise<ParticipantRole> {
    if (session.teacher.userId === user.id) return ParticipantRole.TEACHER;

    const isStaff = user.roles.some((role) =>
      ([Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN] as Role[]).includes(role),
    );
    if (isStaff) return ParticipantRole.SUPERVISOR;

    const link = session.students.find((s) => s.student.userId === user.id);
    if (link) return ParticipantRole.STUDENT;

    // FR-AUTH-03: a child's account is optional, so a guardian may join on their behalf.
    //
    // The test is deliberately "is one of *this* class's students in the caller's family",
    // nothing looser. An earlier version asked whether any child of the guardian had *an
    // enrolment with this class's teacher*, which let any family taught by the same Ustadh
    // watch any of their classes — other children, in a live room (S12).
    if (user.roles.includes(Role.GUARDIAN)) {
      const owns = await this.prisma.classStudent.count({
        where: {
          classId: session.id,
          student: { family: { members: { some: { userId: user.id } } } },
        },
        take: 1,
      });
      if (owns > 0) return ParticipantRole.GUARDIAN_VIEWER;
    }

    if (user.roles.includes(Role.STUDENT) || user.roles.includes(Role.CHILD_STUDENT)) {
      const owns = await this.policies.studentSelf(user.id, this.studentIdFor(session, user) ?? '');
      if (owns) return ParticipantRole.STUDENT;
    }

    throw AppError.forbidden('You are not enrolled in this class');
  }

  private studentIdFor(
    session: { students: Array<{ studentId: string; student: { userId: string | null } }> },
    user: { id: string },
  ): string | null {
    return session.students.find((s) => s.student.userId === user.id)?.studentId ?? null;
  }

  /**
   * Signs the room token with an HMAC over its claims. The gateway verifies the
   * signature on connect, so a socket handshake costs no database query — but the
   * service still re-checks on every state-changing event.
   */
  private signRoomToken(claims: {
    sub: string;
    cid: string;
    role: ParticipantRole;
    studentId: string | null;
  }): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = this.crypto.hashToken(body).slice(0, 32);
    return `${body}.${signature}`;
  }

  /** Verifies a room token. Returns null when the signature does not match. */
  verifyRoomToken(
    token: string,
  ): { sub: string; cid: string; role: ParticipantRole; studentId: string | null } | null {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    const expected = this.crypto.hashToken(body).slice(0, 32);
    if (!this.crypto.safeEqual(signature, expected)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  private async ensureRoom(classId: string) {
    const existing = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: { roomId: true },
    });
    if (existing?.roomId) {
      await this.markLiveIfStarted(classId);
      return { roomId: existing.roomId };
    }

    const room = await this.video.createRoom({
      classId,
      name: `hifzoon-${classId}`,
      maxParticipants: 8,
      emptyTimeoutSeconds: 900,
    });

    await this.prisma.classSession.update({
      where: { id: classId },
      data: { roomId: room.roomId },
    });
    await this.markLiveIfStarted(classId);

    return room;
  }

  /**
   * Moves a class to LIVE once its start time has passed (B36).
   *
   * Teachers open the room in the early window, so the status cannot be decided when the
   * room is created: the class is still in the future then. It is re-checked on every
   * token and join after the start, and by the worker sweep, so a class whose room was
   * opened early still goes LIVE when the lesson begins. Conditional on SCHEDULED, so a
   * cancelled or already-live class is never touched.
   */
  async markLiveIfStarted(classId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.classSession.updateMany({
      where: { id: classId, status: 'SCHEDULED', startsAt: { lte: now }, endsAt: { gt: now } },
      data: { status: 'LIVE', startedAt: now },
    });
    return result.count > 0;
  }

  /** Worker sweep: any class with an open room whose start time has passed goes LIVE. */
  async promoteStartedClasses(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.classSession.updateMany({
      where: {
        status: 'SCHEDULED',
        roomId: { not: null },
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      data: { status: 'LIVE', startedAt: now },
    });
    return result.count;
  }

  // ── Attendance (FR-CLS-14) ────────────────────────────────────────────────

  /**
   * Records a join and returns the accumulated attendance so far.
   *
   * Reconnects are the normal case, not an edge case: a mobile connection drops. The
   * elapsed minutes from the previous segment are banked and `joined_at` restarts, so
   * a student who drops five times still has an honest total rather than only the
   * minutes of their final connection.
   */
  async recordJoin(input: {
    classId: string;
    userId: string;
    displayName: string;
    role: ParticipantRole;
    studentId: string | null;
  }): Promise<{ participantId: string; minutesPresent: number; rejoined: boolean }> {
    const now = new Date();
    await this.markLiveIfStarted(input.classId);

    const existing = await this.prisma.classParticipant.findFirst({
      where: {
        classId: input.classId,
        userId: input.userId,
        role: input.role,
        ...(input.role === ParticipantRole.STUDENT && input.studentId
          ? { studentId: input.studentId }
          : {}),
      },
      orderBy: { joinedAt: 'desc' },
      select: { id: true, joinedAt: true, leftAt: true, minutesPresent: true },
    });

    if (!existing) {
      const created = await this.prisma.classParticipant.create({
        data: {
          classId: input.classId,
          userId: input.userId,
          studentId: input.studentId,
          role: input.role,
          joinedAt: now,
          minutesPresent: 0,
        },
        select: { id: true, minutesPresent: true },
      });
      return { participantId: created.id, minutesPresent: 0, rejoined: false };
    }

    if (!existing.leftAt) {
      // Double join without a leave (duplicate tab, flaky leave event). Idempotent.
      return {
        participantId: existing.id,
        minutesPresent: existing.minutesPresent,
        rejoined: false,
      };
    }

    const banked = existing.minutesPresent + elapsedMinutes(existing.joinedAt, existing.leftAt);

    await this.prisma.classParticipant.update({
      where: { id: existing.id },
      data: { joinedAt: now, leftAt: null },
    });

    return { participantId: existing.id, minutesPresent: banked, rejoined: true };
  }

  /** Records a leave, banking the minutes since the last join. */
  async recordLeave(classId: string, userId: string): Promise<{ minutesPresent: number }> {
    const now = new Date();

    const open = await this.prisma.classParticipant.findFirst({
      where: { classId, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
      select: { id: true, joinedAt: true, minutesPresent: true },
    });

    if (!open) return { minutesPresent: 0 };

    const total = open.minutesPresent + elapsedMinutes(open.joinedAt, now);

    await this.prisma.classParticipant.update({
      where: { id: open.id },
      data: { leftAt: now, minutesPresent: total },
    });

    return { minutesPresent: total };
  }

  /** Attendance for a class, with the teacher and students broken out. */
  async attendance(classId: string, subject: PolicySubject) {
    await this.policies.assertClassRead(subject, classId);

    const participants = await this.prisma.classParticipant.findMany({
      where: { classId },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        leftAt: true,
        minutesPresent: true,
        user: { select: { id: true, name: true } },
        student: { select: { id: true, displayName: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const students = participants.filter(
      (p) => toSharedParticipantRole(p.role) === ParticipantRole.STUDENT,
    );

    return {
      classId,
      participants,
      summary: {
        studentsPresent: students.length,
        averageMinutes:
          students.length === 0
            ? 0
            : Math.round(students.reduce((sum, p) => sum + p.minutesPresent, 0) / students.length),
        guardiansPresent: participants.filter(
          (p) => toSharedParticipantRole(p.role) === ParticipantRole.GUARDIAN_VIEWER,
        ).length,
        stillConnected: participants.filter((p) => !p.leftAt).length,
      },
    };
  }

  /**
   * Ends the video rooms of classes whose booked time is over, so a 30-minute trial
   * really lasts 30 minutes: everyone is disconnected and nobody can stay on.
   */
  async endRooms(classIds: string[]): Promise<number> {
    if (classIds.length === 0) return 0;
    const rooms = await this.prisma.classSession.findMany({
      where: { id: { in: classIds }, roomId: { not: null } },
      select: { id: true, roomId: true },
    });
    let ended = 0;
    for (const r of rooms) {
      try {
        await this.video.endRoom(r.roomId as string);
        ended += 1;
      } catch (err) {
        // A room that already emptied out is gone at the provider; nothing to close.
        this.logger.warn(
          `Classroom: could not end room for class ${r.id}: ${(err as Error).message}`,
        );
      }
    }
    return ended;
  }

  /**
   * Closes any participant still marked present when a class ends, so a browser tab
   * that was closed without a leave event does not show someone as present forever
   * (and so payroll does not credit a class nobody attended to the end).
   */
  async closeAttendance(classId: string, subject: PolicySubject): Promise<{ closed: number }> {
    await this.policies.assertClassControl(subject, classId);

    const now = new Date();

    const open = await this.prisma.classParticipant.findMany({
      where: { classId, leftAt: null },
      select: { id: true, joinedAt: true, minutesPresent: true },
    });

    for (const participant of open) {
      await this.prisma.classParticipant.update({
        where: { id: participant.id },
        data: {
          leftAt: now,
          minutesPresent: participant.minutesPresent + elapsedMinutes(participant.joinedAt, now),
        },
      });
    }

    if (open.length > 0) {
      this.logger.log(`Closed ${open.length} open attendance record(s) for class ${classId}`);
    }
    return { closed: open.length };
  }

  /**
   * Display name for a socket handshake.
   *
   * Also the account-still-exists check: a socket can outlive the session that
   * authorised it, so the gateway re-reads rather than trusting the token alone.
   *
   * R9 — with `asStudentId` (a STUDENT token), the name is the child's, so a guardian
   * sitting as their child shows under the child's name in presence events.
   */
  async resolveDisplayName(
    userId: string,
    asStudentId?: string | null,
  ): Promise<{ id: string; name: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return null;
    if (asStudentId) {
      const student = await this.prisma.student.findUnique({
        where: { id: asStudentId },
        select: { displayName: true },
      });
      if (student) return { id: user.id, name: student.displayName };
    }
    return { id: user.id, name: user.name };
  }

  // ── Live state (NFR-REL-01) ──────────────────────────────────────────────

  /**
   * Current classroom state for someone who just (re)joined.
   *
   * Redis first because a reconnect must resume in under 10 seconds (NFR-REL-01) and
   * the teacher may have turned a page while the student was offline; the
   * `class_session` columns are the durable fallback if the cache has been evicted.
   */
  async snapshot(classId: string, subject: PolicySubject): Promise<ClassroomSnapshot> {
    await this.policies.assertClassRead(subject, classId);

    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        mushafLayout: true,
        tajweedColours: true,
        lastPage: true,
        lastSurah: true,
        lastAyah: true,
        lastWordIndex: true,
        course: { select: { name: true } },
        students: { select: { student: { select: { id: true, displayName: true } } } },
        recording: { select: { status: true, createdAt: true } },
      },
    });
    if (!session) throw AppError.notFound('Class');

    const cached = await this.redis.getJson<{
      page: number | null;
      layout: MushafLayout;
      tajweedColours: boolean;
    }>(this.redis.key('classroom', classId, 'state'));

    const page = cached?.page ?? session.lastPage;
    const layout = cached?.layout ?? session.mushafLayout;

    const present = await this.prisma.classParticipant.findMany({
      where: { classId, leftAt: null },
      select: {
        user: { select: { id: true, name: true } },
        role: true,
        joinedAt: true,
        studentId: true,
        student: { select: { displayName: true } },
      },
      orderBy: { joinedAt: 'asc' },
      take: 20,
    });

    const media = await Promise.all(
      present.map((p) =>
        this.redis.getJson<MediaState>(this.redis.key('classroom', classId, 'media', p.user.id)),
      ),
    );

    const highlight =
      session.lastSurah && session.lastAyah
        ? {
            surah: session.lastSurah,
            ayah: session.lastAyah,
            wordIndex: session.lastWordIndex ?? 0,
          }
        : null;

    return {
      classId,
      status: session.status,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      layout: toSharedLayout(layout),
      tajweedColours: cached?.tajweedColours ?? session.tajweedColours,
      page: page ?? null,
      highlight,
      course: session.course ? { name: session.course.name } : null,
      students: session.students.map((link) => ({
        id: link.student.id,
        displayName: link.student.displayName,
      })),
      recording: session.recording
        ? {
            status: session.recording.status,
            startedAt: session.recording.createdAt.toISOString(),
          }
        : null,
      participants: present.map((p, index) => ({
        userId: p.user.id,
        // R9 — a guardian joined as their child is named after the child.
        displayName: p.role === 'STUDENT' && p.student ? p.student.displayName : p.user.name,
        studentId: p.studentId ?? null,
        role: toSharedParticipantRole(p.role),
        joinedAt: p.joinedAt.toISOString(),
        micOn: media[index]?.micOn ?? null,
        camOn: media[index]?.camOn ?? null,
      })),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Stores a participant's own microphone and camera state (M55).
   *
   * A meeting screen needs to show who is muted, and the video provider's own events do
   * not reach this server, so each client reports its own state. It is only ever written
   * for the caller, and a watch-only guardian is held at "off" because they cannot publish
   * (FR-CLS-13) whatever their client claims.
   */
  async setMediaState(
    classId: string,
    userId: string,
    role: ParticipantRole,
    state: MediaState,
  ): Promise<MediaState> {
    const effective =
      role === ParticipantRole.GUARDIAN_VIEWER
        ? { micOn: false, camOn: false }
        : { micOn: Boolean(state.micOn), camOn: Boolean(state.camOn) };

    await this.redis.setJson(
      this.redis.key('classroom', classId, 'media', userId),
      effective,
      MEDIA_STATE_TTL_SECONDS,
    );
    return effective;
  }

  /**
   * Applies a page turn and persists it.
   *
   * Both the Redis cache and the row are written: the cache serves the next reconnect
   * in milliseconds, the row survives a cache flush and is what the recording markers
   * and the lesson card are built from later.
   */
  async setPage(
    classId: string,
    page: number,
    subject: PolicySubject,
  ): Promise<{ page: number; layout: MushafLayout }> {
    if (!Number.isInteger(page) || page < MUSHAF_MIN_PAGE || page > MUSHAF_MAX_PAGE) {
      throw AppError.badRequest(`Page must be between ${MUSHAF_MIN_PAGE} and ${MUSHAF_MAX_PAGE}`);
    }
    await this.policies.assertClassControl(subject, classId);

    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: { mushafLayout: true, tajweedColours: true },
    });
    if (!session) throw AppError.notFound('Class');

    await Promise.all([
      this.prisma.classSession.update({ where: { id: classId }, data: { lastPage: page } }),
      this.redis.setJson(
        this.redis.key('classroom', classId, 'state'),
        {
          page,
          layout: toSharedLayout(session.mushafLayout),
          tajweedColours: session.tajweedColours,
        },
        6 * 3_600,
      ),
    ]);

    return { page, layout: toSharedLayout(session.mushafLayout) };
  }

  async setHighlight(
    classId: string,
    highlight: { surah: number; ayah: number; wordIndex: number },
    subject: PolicySubject,
  ): Promise<{ surah: number; ayah: number; wordIndex: number }> {
    if (highlight.surah < 1 || highlight.surah > 114) {
      throw AppError.badRequest('Surah must be between 1 and 114');
    }
    if (highlight.ayah < 1) throw AppError.badRequest('Ayah must be 1 or greater');
    if (highlight.wordIndex < 0) throw AppError.badRequest('wordIndex cannot be negative');
    await this.policies.assertClassControl(subject, classId);

    await this.prisma.classSession.update({
      where: { id: classId },
      data: {
        lastSurah: highlight.surah,
        lastAyah: highlight.ayah,
        lastWordIndex: highlight.wordIndex,
      },
    });

    return highlight;
  }

  /** FR-CLS-04 / FR-CLS-05 — the teacher chooses the layout and the Tajweed layer. */
  async setLayout(
    classId: string,
    layout: MushafLayout,
    subject: PolicySubject,
  ): Promise<{ layout: MushafLayout }> {
    await this.policies.assertClassControl(subject, classId);

    const cached = await this.redis.getJson<{ tajweedColours: boolean }>(
      this.redis.key('classroom', classId, 'state'),
    );

    await Promise.all([
      this.prisma.classSession.update({ where: { id: classId }, data: { mushafLayout: layout } }),
      this.redis.setJson(
        this.redis.key('classroom', classId, 'state'),
        { page: null, layout, tajweedColours: cached?.tajweedColours ?? false },
        6 * 3_600,
      ),
    ]);

    return { layout: toSharedLayout(layout) };
  }

  async setTajweedColours(
    classId: string,
    enabled: boolean,
    subject: PolicySubject,
  ): Promise<{ tajweedColours: boolean }> {
    await this.policies.assertClassControl(subject, classId);

    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: { mushafLayout: true },
    });
    if (!session) throw AppError.notFound('Class');

    await Promise.all([
      this.prisma.classSession.update({
        where: { id: classId },
        data: { tajweedColours: enabled },
      }),
      this.redis.setJson(
        this.redis.key('classroom', classId, 'state'),
        { page: null, layout: session.mushafLayout, tajweedColours: enabled },
        6 * 3_600,
      ),
    ]);

    return { tajweedColours: enabled };
  }

  // ── Recording consent (FR-CLS-12, CR-01) ─────────────────────────────────

  /**
   * Decides whether a class may be recorded.
   *
   * Every enrolled student needs CLASS_RECORDING consent. One missing consent stops
   * recording — it does not start it for the others. The result explains *which*
   * students and which purposes are missing, because the teacher needs to act on it,
   * not just be told "no".
   */
  async recordingConsent(
    classId: string,
    subject: PolicySubject,
  ): Promise<{
    allowed: boolean;
    students: Array<{ studentId: string; displayName: string; consented: boolean }>;
    missing: string[];
  }> {
    await this.policies.assertClassControl(subject, classId);

    const students = await this.prisma.classStudent.findMany({
      where: { classId },
      select: {
        studentId: true,
        student: {
          select: {
            displayName: true,
            consents: {
              where: { purpose: ConsentPurpose.CLASS_RECORDING, status: 'GRANTED' },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    const rows = students.map((s) => ({
      studentId: s.studentId,
      displayName: s.student.displayName,
      consented: s.student.consents.length > 0,
    }));

    const missing = rows.filter((r) => !r.consented).map((r) => r.displayName);

    return { allowed: rows.length > 0 && missing.length === 0, students: rows, missing };
  }

  /**
   * Starts a recording, refusing when consent is incomplete.
   *
   * Called by the recording webhook flow and by an admin override that must state a
   * reason — the audit trail needs to show a human decided to record without consent.
   */
  async startRecording(
    classId: string,
    subject: PolicySubject,
    overrideReason?: string,
  ): Promise<{
    started: boolean;
    egressId: string;
    deleteAfter: string;
  }> {
    await this.policies.assertClassControl(subject, classId);

    const consent = await this.recordingConsent(classId, subject);
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: { roomId: true, mushafLayout: true, courseId: true },
    });
    if (!session?.roomId) throw AppError.badRequest('This class has no video room yet');

    if (!consent.allowed) {
      throw new AppError(
        ErrorCode.CONSENT_REQUIRED,
        'FR-CLS-12: every enrolled student needs CLASS_RECORDING consent before a class can be recorded',
        { classId, missing: consent.missing, override: overrideReason ?? null },
      );
    }

    const storageKey = this.storage.buildKey('recordings', classId, 'class.mp4');

    const handle = await this.video.startRecording({
      roomId: session.roomId,
      classId,
      storageKey,
      layout: toSharedLayout(session.mushafLayout),
    });

    // CR-02 — 90 days, set at creation so a missing job cannot leak a recording.
    const deleteAfter = new Date(Date.now() + 90 * 86_400_000);

    await this.prisma.recording.upsert({
      where: { classId },
      update: { status: 'RECORDING', providerEgressId: handle.egressId, deleteAfter },
      create: {
        classId,
        storageKey,
        status: 'RECORDING',
        providerEgressId: handle.egressId,
        deleteAfter,
      },
    });

    return { started: true, egressId: handle.egressId, deleteAfter: deleteAfter.toISOString() };
  }

  /**
   * Stops a recording; the provider's egress-ended webhook then marks it READY once the
   * file is in storage.
   */
  async stopRecording(classId: string, subject: PolicySubject): Promise<{ stopping: boolean }> {
    await this.policies.assertClassControl(subject, classId);
    const recording = await this.prisma.recording.findUnique({
      where: { classId },
      select: { status: true, providerEgressId: true },
    });
    if (!recording || recording.status !== 'RECORDING' || !recording.providerEgressId) {
      throw AppError.conflict('CONFLICT', 'This class is not being recorded');
    }
    await this.video.stopRecording(recording.providerEgressId);
    return { stopping: true };
  }

  /**
   * The class recording for someone allowed to read the class (FR-PAR-02): a short-lived
   * signed link and the ayah/mistake markers to jump to. Families are refused once any
   * enrolled student's CLASS_RECORDING consent has been withdrawn (FR-AUTH-05); staff and
   * the teacher keep access for review and safeguarding.
   */
  async recordingPlayback(classId: string, subject: PolicySubject) {
    await this.policies.assertClassRead(subject, classId);
    const recording = await this.prisma.recording.findUnique({
      where: { classId },
      select: {
        status: true,
        storageKey: true,
        deleteAfter: true,
        createdAt: true,
        markers: {
          orderBy: { offsetMs: 'asc' },
          select: { offsetMs: true, surah: true, ayah: true, wordIndex: true, kind: true },
        },
      },
    });
    if (!recording || recording.status === 'DELETED') return null;

    let canControl = true;
    try {
      await this.policies.assertClassControl(subject, classId);
    } catch {
      canControl = false;
    }
    if (!canControl) {
      const consent = await this.recordingConsent(classId, subject).catch(() => null);
      if (!consent?.allowed) {
        throw new AppError(
          ErrorCode.CONSENT_REQUIRED,
          'Recording consent has been withdrawn for this class, so it can no longer be watched',
        );
      }
    }

    const url =
      recording.status === 'READY' && recording.storageKey
        ? await this.storage.signedDownloadUrl(recording.storageKey)
        : null;
    return {
      status: recording.status,
      url,
      recordedAt: recording.createdAt,
      deleteAfter: recording.deleteAfter,
      markers: recording.markers,
    };
  }

  // ── Weak networks (FR-CLS-11, CLS-BE-16) ─────────────────────────────────

  /**
   * What the client should do at a given bandwidth.
   *
   * The rule from the SRS: when bandwidth drops, video goes, audio and the Mushaf
   * stay. A child reciting to a frozen picture is worse off than a child reciting with
   * no picture, so the fallback never touches the part of the lesson that carries the
   * teaching.
   */
  bandwidthAdvice(
    rttMs: number,
    downlinkKbps: number,
    packetLossPercent: number,
  ): {
    tier: 'GOOD' | 'DEGRADED' | 'AUDIO_ONLY' | 'RECOVERING';
    publishVideo: boolean;
    publishAudio: boolean;
    requestResolution: string;
    reason: string;
  } {
    if (rttMs > 900 || packetLossPercent > 12 || downlinkKbps < 150) {
      return {
        tier: 'AUDIO_ONLY',
        publishVideo: false,
        publishAudio: true,
        requestResolution: '0',
        reason: 'Bandwidth too low for video. Audio and the Mushaf sync continue (FR-CLS-11).',
      };
    }

    if (rttMs > 400 || packetLossPercent > 5 || downlinkKbps < 600) {
      return {
        tier: 'DEGRADED',
        publishVideo: true,
        publishAudio: true,
        requestResolution: '180p',
        reason: 'Reduced video quality; audio and Mushaf sync unaffected (FR-CLS-11).',
      };
    }

    return {
      tier: 'GOOD',
      publishVideo: true,
      publishAudio: true,
      requestResolution: '720p',
      reason: 'Connection is healthy.',
    };
  }
}

/** Minutes between two instants, never negative and never fractional. */
export function elapsedMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}
