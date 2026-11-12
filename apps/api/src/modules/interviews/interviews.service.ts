import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  BLOCKING_INTERVIEW_STATUSES,
  CLOSED_INTERVIEW_STATUSES,
  ErrorCode,
  INTERVIEW_DURATION,
  INTERVIEW_EARLY_OPEN_MINUTES,
  INTERVIEW_LINK_TTL_HOURS,
  INTERVIEW_SCORE_FIELDS,
  INTERVIEW_SCORE_MAX,
  INTERVIEW_SCORE_MIN,
  InterviewOutcome,
  InterviewParticipantRole,
  InterviewStatus,
  Role,
  TeacherHiringStatus,
} from '@hifzoon/shared';

import { AuthenticatedUser } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { AppConfigService } from '../../config/app-config.service';
import { VIDEO_PROVIDER, VideoProvider } from '../../integrations/providers';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/** How long an interview room token stays valid. Scoped to one interview. */
export const INTERVIEW_ROOM_TOKEN_TTL_SECONDS = INTERVIEW_EARLY_OPEN_MINUTES * 60 * 4;

/** Staff who may see and book interviews at all. */
const INTERVIEW_STAFF: readonly Role[] = [Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN];

/** Staff who may overrule the assigned interviewer's notes and verdict. */
const INTERVIEW_ADMIN: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

/** An applicant has no account, so their provider identity is derived from the interview. */
export function applicantIdentity(interviewId: string): string {
  return `applicant:${interviewId}`;
}

export interface InterviewRoomTokenClaims {
  /** Provider and socket identity: the user id, or `applicant:<interviewId>`. */
  sub: string;
  iid: string;
  role: InterviewParticipantRole;
  /** The signed-in user behind this identity; null for the applicant. */
  uid: string | null;
  /** Base64url of the signed claims; the gateway verifies without a database hit. */
  token: string;
  url: string;
  /** Video provider (LiveKit) access token the browser connects with. */
  videoToken: string;
  expiresAt: Date;
  displayName: string;
}

export type JoinWindowState = 'early' | 'open' | 'closed';

export interface InterviewSnapshot {
  interviewId: string;
  status: InterviewStatus;
  stage: TeacherHiringStatus | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  applicantName: string;
  interviewerName: string;
  /** Qari shb's running notes. Only ever sent to staff — see `snapshot`. */
  notes: string | null;
  outcome: InterviewOutcome;
  participants: Array<{
    identity: string;
    displayName: string;
    role: InterviewParticipantRole;
    joinedAt: string;
    /** Null until the participant has reported their media state. */
    micOn: boolean | null;
    camOn: boolean | null;
  }>;
  serverTime: string;
}

export interface InterviewScores {
  recitationScore?: number | null;
  tajweedScore?: number | null;
  memorisationScore?: number | null;
  teachingScore?: number | null;
  communicationScore?: number | null;
}

/** Reported over the socket; held in memory for the length of the interview. */
interface MediaState {
  micOn: boolean;
  camOn: boolean;
}

/**
 * Hiring interviews (INT) — the live session where Qari shb meets a teaching applicant.
 *
 * Three rules shape this module, and each one is the reason it is not just a `ClassSession`
 * with a new `ClassType`:
 *
 *   **The applicant has no account.** `TeacherApplication.userId` is null until approval,
 *   so there is no user to authenticate, no `TeacherProfile` to hang a class off and no
 *   `Student` to enrol. The applicant joins through an opaque token emailed to the address
 *   they applied with; only its HMAC is stored, and it dies with the interview.
 *
 *   **The room opens 10 minutes early and closes 10 minutes after the booked end**, the
 *   same window as a class (`CLASSROOM_EARLY_OPEN_MINUTES`) so an applicant does not have
 *   to learn a second set of rules — and so a link forwarded to someone else is useless
 *   outside that window.
 *
 *   **The verdict never moves the pipeline by itself.** Recording the `DEMO_CLASS` (or any
 *   other) hiring step stays a deliberate admin action in `TeachersService.recordStep`.
 *   This service stores what Qari shb saw; a human still decides what it means.
 */
@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  /**
   * Mic/camera state per interview, by identity. Deliberately in memory and not Redis or
   * Postgres: it is worthless a second after the call ends, and an interview is a single
   * room that both parties are connected to at once.
   */
  private readonly mediaStates = new Map<string, Map<string, MediaState>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
  ) {}

  // ── Booking ───────────────────────────────────────────────────────────────

  /**
   * Books an interview against an open application and emails the applicant their link.
   *
   * The interviewer defaults to the caller, which is the common case: Qari shb opens the
   * application and books himself. Booking for someone else is allowed, but only onto
   * another staff account — an interview conducted by a guardian is not a thing.
   */
  async schedule(
    actor: AuthenticatedUser,
    input: {
      applicationId: string;
      startsAt: Date;
      durationMinutes?: number;
      interviewerId?: string;
      stage?: TeacherHiringStatus;
      timeZone?: string;
      notifyApplicant?: boolean;
    },
  ) {
    this.assertStaff(actor);

    const application = await this.prisma.teacherApplication.findUnique({
      where: { id: input.applicationId },
      select: { id: true, applicantName: true, email: true, status: true },
    });
    if (!application) throw AppError.notFound('Application');

    // A closed application has nothing left to interview for; booking one is almost
    // always a stale tab, and an email to a rejected applicant is worse than an error.
    const applicationStatus = application.status as TeacherHiringStatus;
    if (
      applicationStatus === TeacherHiringStatus.APPROVED ||
      applicationStatus === TeacherHiringStatus.REJECTED
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `This application is already ${application.status}; there is nothing left to interview for`,
        { status: application.status },
      );
    }

    const interviewerId = input.interviewerId ?? actor.id;
    const interviewer = await this.resolveInterviewer(interviewerId);
    const { startsAt, endsAt, durationMinutes } = this.window(
      input.startsAt,
      input.durationMinutes,
    );
    await this.assertInterviewerFree(interviewerId, startsAt, endsAt);

    const openForApplication = await this.prisma.interviewSession.findFirst({
      where: {
        applicationId: application.id,
        status: { in: [...BLOCKING_INTERVIEW_STATUSES] },
      },
      select: { id: true, startsAt: true },
    });
    if (openForApplication) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This applicant already has an interview booked; reschedule or cancel that one first',
        {
          interviewId: openForApplication.id,
          startsAt: openForApplication.startsAt.toISOString(),
        },
      );
    }

    const plainToken = this.crypto.issueOpaqueToken(32);
    const interview = await this.prisma.interviewSession.create({
      data: {
        applicationId: application.id,
        stage: input.stage ?? null,
        interviewerId,
        startsAt,
        endsAt,
        timeZone: input.timeZone?.trim() || 'UTC',
        applicantTokenHash: this.crypto.hashToken(plainToken),
        applicantTokenExpiresAt: new Date(endsAt.getTime() + INTERVIEW_LINK_TTL_HOURS * 3_600_000),
        createdById: actor.id,
      },
      select: { id: true, startsAt: true, endsAt: true, timeZone: true, status: true, stage: true },
    });

    if (input.notifyApplicant !== false) {
      await this.emailApplicant(TEMPLATE.INTERVIEW_SCHEDULED, {
        email: application.email,
        applicantName: application.applicantName,
        interviewerName: interviewer.name,
        startsAt,
        timeZone: interview.timeZone,
        durationMinutes,
        joinToken: plainToken,
      });
    }

    this.logger.log(
      `Interview ${interview.id} booked for application ${application.id} with ${interviewerId}`,
    );

    return {
      ...interview,
      durationMinutes,
      applicantName: application.applicantName,
      interviewerName: interviewer.name,
      /**
       * Returned exactly once, at creation, so the booker can hand the link over in person
       * or on WhatsApp if the email bounces. It is never readable again — only its HMAC
       * is stored.
       */
      applicantJoinUrl: this.joinUrl(plainToken),
    };
  }

  /**
   * Moves an interview, keeping the applicant's existing link alive.
   *
   * Re-issuing the token on every reschedule would invalidate the link already sitting in
   * the applicant's inbox, which is the one thing they have. The token's expiry is
   * extended to follow the new end instead.
   */
  async reschedule(
    actor: AuthenticatedUser,
    interviewId: string,
    input: {
      startsAt?: Date;
      durationMinutes?: number;
      interviewerId?: string;
      stage?: TeacherHiringStatus | null;
      timeZone?: string;
      notifyApplicant?: boolean;
    },
  ) {
    this.assertStaff(actor);
    const existing = await this.loadForStaff(interviewId);
    this.assertMayConduct(actor, existing.interviewerId);
    // Handing the interview to someone else is an admin decision. Otherwise a supervisor
    // could reassign it to themselves and then record the verdict.
    if (
      input.interviewerId !== undefined &&
      input.interviewerId !== existing.interviewerId &&
      !this.isInterviewAdmin(actor)
    ) {
      throw AppError.forbidden('Only an admin can change who conducts an interview');
    }

    if (CLOSED_INTERVIEW_STATUSES.includes(existing.status as InterviewStatus)) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `This interview is ${existing.status} and can no longer be moved; book a new one`,
      );
    }

    const interviewerId = input.interviewerId ?? existing.interviewerId;
    const interviewer =
      interviewerId === existing.interviewerId
        ? existing.interviewer
        : await this.resolveInterviewer(interviewerId);

    const currentDuration = Math.round(
      (existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000,
    );
    const { startsAt, endsAt, durationMinutes } = this.window(
      input.startsAt ?? existing.startsAt,
      input.durationMinutes ?? currentDuration,
      { allowPast: input.startsAt === undefined },
    );
    await this.assertInterviewerFree(interviewerId, startsAt, endsAt, interviewId);

    const moved =
      startsAt.getTime() !== existing.startsAt.getTime() ||
      endsAt.getTime() !== existing.endsAt.getTime();

    const updated = await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: {
        startsAt,
        endsAt,
        interviewerId,
        ...(input.stage !== undefined ? { stage: input.stage } : {}),
        ...(input.timeZone?.trim() ? { timeZone: input.timeZone.trim() } : {}),
        applicantTokenExpiresAt: new Date(endsAt.getTime() + INTERVIEW_LINK_TTL_HOURS * 3_600_000),
      },
      select: { id: true, startsAt: true, endsAt: true, timeZone: true, status: true, stage: true },
    });

    if (moved && input.notifyApplicant !== false) {
      // The link itself is unchanged, so the email points at the page rather than at a
      // token we no longer hold in plaintext.
      await this.emailApplicant(TEMPLATE.INTERVIEW_RESCHEDULED, {
        email: existing.application.email,
        applicantName: existing.application.applicantName,
        interviewerName: interviewer.name,
        startsAt,
        timeZone: updated.timeZone,
        durationMinutes,
        joinToken: null,
      });
    }

    return { ...updated, durationMinutes, interviewerName: interviewer.name };
  }

  async cancel(actor: AuthenticatedUser, interviewId: string, reason?: string) {
    this.assertStaff(actor);
    const existing = await this.loadForStaff(interviewId);
    this.assertMayConduct(actor, existing.interviewerId);

    if (CLOSED_INTERVIEW_STATUSES.includes(existing.status as InterviewStatus)) {
      throw new AppError(ErrorCode.CONFLICT, `This interview is already ${existing.status}`);
    }

    const cancelled = await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason?.trim() || null,
        // A cancelled interview's link must stop working immediately, not at its old expiry.
        applicantTokenExpiresAt: new Date(),
      },
      select: { id: true, status: true, cancelledAt: true, cancelReason: true },
    });

    await this.closeRoom(interviewId, existing.roomId);
    await this.emailApplicant(TEMPLATE.INTERVIEW_CANCELLED, {
      email: existing.application.email,
      applicantName: existing.application.applicantName,
      interviewerName: existing.interviewer.name,
      startsAt: existing.startsAt,
      timeZone: existing.timeZone,
      durationMinutes: Math.round(
        (existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000,
      ),
      joinToken: null,
      reason: reason?.trim() || null,
    });

    return cancelled;
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  async list(
    actor: AuthenticatedUser,
    filter: {
      applicationId?: string;
      status?: InterviewStatus;
      interviewerId?: string;
      mine?: boolean;
      from?: Date;
      to?: Date;
      awaitingOutcome?: boolean;
    },
  ) {
    this.assertStaff(actor);
    const interviewerId = filter.mine ? actor.id : filter.interviewerId;

    const rows = await this.prisma.interviewSession.findMany({
      where: {
        ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(interviewerId ? { interviewerId } : {}),
        // The admin nav badge: over, not cancelled or missed, and still without a verdict.
        ...(filter.awaitingOutcome
          ? {
              outcome: 'PENDING' as const,
              endsAt: { lt: new Date() },
              status: {
                in: [InterviewStatus.SCHEDULED, InterviewStatus.LIVE, InterviewStatus.COMPLETED],
              },
            }
          : {}),
        ...(filter.from || filter.to
          ? {
              startsAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        applicationId: true,
        stage: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        status: true,
        outcome: true,
        decidedAt: true,
        interviewerId: true,
        interviewer: { select: { name: true } },
        application: { select: { applicantName: true, email: true, status: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      ...row,
      durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
    }));
  }

  async get(actor: AuthenticatedUser, interviewId: string) {
    this.assertStaff(actor);
    const row = await this.loadForStaff(interviewId, { withParticipants: true });

    return {
      id: row.id,
      applicationId: row.applicationId,
      stage: row.stage,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timeZone: row.timeZone,
      durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
      notes: row.notes,
      outcome: row.outcome,
      outcomeNotes: row.outcomeNotes,
      scores: {
        recitationScore: row.recitationScore,
        tajweedScore: row.tajweedScore,
        memorisationScore: row.memorisationScore,
        teachingScore: row.teachingScore,
        communicationScore: row.communicationScore,
      },
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      interviewer: { id: row.interviewerId, name: row.interviewer.name },
      applicant: {
        name: row.application.applicantName,
        email: row.application.email,
        applicationStatus: row.application.status,
      },
      participants: row.participants ?? [],
      /** What recording this verdict would feed, so the UI can deep-link the step form. */
      servesStep: row.stage ?? TeacherHiringStatus.DEMO_CLASS,
      canConduct: this.mayConduct(actor, row.interviewerId),
    };
  }

  // ── Joining: staff ────────────────────────────────────────────────────────

  /**
   * A room token for a staff member: the assigned interviewer gets `INTERVIEWER`, any
   * other staff member sits in as an `OBSERVER`. Both may publish — an interview with a
   * muted interviewer is not an interview.
   */
  async issueStaffToken(
    actor: AuthenticatedUser,
    interviewId: string,
  ): Promise<InterviewRoomTokenClaims> {
    this.assertStaff(actor);
    const interview = await this.loadForStaff(interviewId);
    this.assertJoinable(interview);

    const role =
      interview.interviewerId === actor.id
        ? InterviewParticipantRole.INTERVIEWER
        : InterviewParticipantRole.OBSERVER;

    return this.issueToken({
      interviewId,
      identity: actor.id,
      userId: actor.id,
      displayName: actor.name,
      role,
      roomId: interview.roomId,
    });
  }

  // ── Joining: the applicant, by emailed token ──────────────────────────────

  /**
   * What the applicant's lobby page shows before they join: when it is, who they are
   * meeting and whether the room is open yet.
   *
   * Deliberately says nothing about the application itself — no hiring status, no step
   * notes, no other interviews. The token proves they hold a link, not that they are
   * signed in, so it buys exactly one interview's worth of information.
   */
  async lobby(plainToken: string) {
    const interview = await this.loadByApplicantToken(plainToken);
    const now = Date.now();

    return {
      interviewId: interview.id,
      applicantName: interview.application.applicantName,
      interviewerName: interview.interviewer.name,
      startsAt: interview.startsAt,
      endsAt: interview.endsAt,
      timeZone: interview.timeZone,
      durationMinutes: Math.round(
        (interview.endsAt.getTime() - interview.startsAt.getTime()) / 60_000,
      ),
      status: interview.status,
      window: this.windowState(interview, now),
      opensAt: new Date(interview.startsAt.getTime() - INTERVIEW_EARLY_OPEN_MINUTES * 60_000),
      earlyOpenMinutes: INTERVIEW_EARLY_OPEN_MINUTES,
      serverTime: new Date(now).toISOString(),
    };
  }

  /**
   * The applicant's own view of the room, in exchange for their emailed token.
   *
   * It exists so the applicant's screen has the same polling fallback staff do: the
   * staff `state` route is role-guarded and an applicant holds no session, so without
   * this their room would go blank the moment a corporate proxy blocked the WebSocket.
   * The snapshot is taken as an APPLICANT viewer, so the interviewer's notes are stripped.
   */
  async applicantSnapshot(plainToken: string): Promise<InterviewSnapshot> {
    const interview = await this.loadByApplicantToken(plainToken);
    return this.snapshot(interview.id, { role: InterviewParticipantRole.APPLICANT });
  }

  /** The applicant's room token, in exchange for the token from their emailed link. */
  async issueApplicantToken(plainToken: string): Promise<InterviewRoomTokenClaims> {
    const interview = await this.loadByApplicantToken(plainToken);
    this.assertJoinable(interview);

    return this.issueToken({
      interviewId: interview.id,
      identity: applicantIdentity(interview.id),
      userId: null,
      displayName: interview.application.applicantName,
      role: InterviewParticipantRole.APPLICANT,
      roomId: interview.roomId,
    });
  }

  // ── Room tokens ───────────────────────────────────────────────────────────

  private async issueToken(input: {
    interviewId: string;
    identity: string;
    userId: string | null;
    displayName: string;
    role: InterviewParticipantRole;
    roomId: string | null;
  }): Promise<InterviewRoomTokenClaims> {
    const claims = {
      sub: input.identity,
      iid: input.interviewId,
      role: input.role,
      uid: input.userId,
    };
    const token = this.signRoomToken(claims);
    const room = await this.ensureRoom(input.interviewId, input.roomId);

    const providerToken = await this.video.issueToken({
      roomId: room.roomId,
      userId: input.identity,
      displayName: input.displayName,
      role: input.role === InterviewParticipantRole.APPLICANT ? 'applicant' : 'interviewer',
      // Everyone in an interview can speak, including an observing supervisor: there is
      // no watch-only role here, and an observer who could not be heard would be a
      // surprise to the applicant.
      canPublish: true,
      ttlSeconds: INTERVIEW_ROOM_TOKEN_TTL_SECONDS,
    });

    return {
      ...claims,
      token,
      url: providerToken.url,
      videoToken: providerToken.token,
      expiresAt: providerToken.expiresAt,
      displayName: input.displayName,
    };
  }

  /** HMAC over the claims, so the socket handshake costs no database query. */
  private signRoomToken(claims: {
    sub: string;
    iid: string;
    role: InterviewParticipantRole;
    uid: string | null;
  }): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = this.crypto.hashToken(body).slice(0, 32);
    return `${body}.${signature}`;
  }

  /** Verifies a room token. Returns null when the signature does not match. */
  verifyRoomToken(token: string): {
    sub: string;
    iid: string;
    role: InterviewParticipantRole;
    uid: string | null;
  } | null {
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

  /**
   * Re-checks, on socket connect, that the holder of a room token may still be in the
   * room: a socket can outlive the interview that authorised it.
   */
  async resolveSocketIdentity(claims: {
    sub: string;
    iid: string;
    role: InterviewParticipantRole;
    uid: string | null;
  }): Promise<{ displayName: string } | null> {
    const interview = await this.prisma.interviewSession.findUnique({
      where: { id: claims.iid },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        interviewerId: true,
        application: { select: { applicantName: true } },
      },
    });
    if (!interview) return null;
    if (CLOSED_INTERVIEW_STATUSES.includes(interview.status as InterviewStatus)) return null;
    if (this.windowState(interview) !== 'open') return null;

    if (claims.role === InterviewParticipantRole.APPLICANT) {
      if (claims.sub !== applicantIdentity(interview.id)) return null;
      return { displayName: interview.application.applicantName };
    }

    if (!claims.uid) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: claims.uid },
      select: { name: true, status: true, roles: { select: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') return null;
    if (!user.roles.some((r) => INTERVIEW_STAFF.includes(r.role as Role))) return null;
    return { displayName: user.name };
  }

  private async ensureRoom(
    interviewId: string,
    knownRoomId: string | null,
  ): Promise<{ roomId: string }> {
    if (knownRoomId) {
      await this.markLiveIfStarted(interviewId);
      return { roomId: knownRoomId };
    }

    const room = await this.video.createRoom({
      interviewId,
      name: `hifzoon-interview-${interviewId}`,
      // The interviewer, the applicant and room for a second panellist or two. Small on
      // purpose: an interview is not a broadcast.
      maxParticipants: 4,
      emptyTimeoutSeconds: 900,
    });

    await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: { roomId: room.roomId },
    });
    await this.markLiveIfStarted(interviewId);
    return { roomId: room.roomId };
  }

  /**
   * Moves an interview to LIVE once its start time has passed.
   *
   * Conditional on SCHEDULED, so a cancelled or already-live interview is never touched.
   * Re-checked on every token and join because the room opens before the start, when the
   * interview is still in the future.
   */
  async markLiveIfStarted(interviewId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.interviewSession.updateMany({
      where: {
        id: interviewId,
        status: InterviewStatus.SCHEDULED,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      data: { status: InterviewStatus.LIVE, startedAt: now },
    });
    return result.count > 0;
  }

  // ── Presence and attendance ───────────────────────────────────────────────

  /**
   * Records a join, banking the minutes from any previous connection.
   *
   * Reconnects are the normal case on a weak line, and an applicant interviewing from a
   * phone in another country is exactly the person who will drop. Their total has to be
   * honest, because "did they turn up" is part of the hiring record.
   */
  async recordJoin(input: {
    interviewId: string;
    identity: string;
    userId: string | null;
    displayName: string;
    role: InterviewParticipantRole;
  }): Promise<{ participantId: string; minutesPresent: number; rejoined: boolean }> {
    const now = new Date();
    await this.markLiveIfStarted(input.interviewId);

    const existing = await this.prisma.interviewParticipant.findUnique({
      where: { interviewId_identity: { interviewId: input.interviewId, identity: input.identity } },
      select: { id: true, joinedAt: true, leftAt: true, minutesPresent: true },
    });

    if (!existing) {
      const created = await this.prisma.interviewParticipant.create({
        data: {
          interviewId: input.interviewId,
          identity: input.identity,
          userId: input.userId,
          displayName: input.displayName,
          role: input.role,
          joinedAt: now,
          minutesPresent: 0,
        },
        select: { id: true },
      });
      return { participantId: created.id, minutesPresent: 0, rejoined: false };
    }

    if (!existing.leftAt) {
      // Double join without a leave (a duplicate tab, or a lost leave event). Idempotent.
      return {
        participantId: existing.id,
        minutesPresent: existing.minutesPresent,
        rejoined: false,
      };
    }

    const banked = existing.minutesPresent + elapsedMinutes(existing.joinedAt, existing.leftAt);
    await this.prisma.interviewParticipant.update({
      where: { id: existing.id },
      data: { joinedAt: now, leftAt: null, minutesPresent: banked, displayName: input.displayName },
    });
    return { participantId: existing.id, minutesPresent: banked, rejoined: true };
  }

  /** Records a leave, banking the minutes since the last join. */
  async recordLeave(interviewId: string, identity: string): Promise<{ minutesPresent: number }> {
    const now = new Date();
    const open = await this.prisma.interviewParticipant.findFirst({
      where: { interviewId, identity, leftAt: null },
      select: { id: true, joinedAt: true, minutesPresent: true },
    });
    if (!open) return { minutesPresent: 0 };

    const total = open.minutesPresent + elapsedMinutes(open.joinedAt, now);
    await this.prisma.interviewParticipant.update({
      where: { id: open.id },
      data: { leftAt: now, minutesPresent: total },
    });
    this.mediaStates.get(interviewId)?.delete(identity);
    return { minutesPresent: total };
  }

  /** Closes anyone still marked present, so a closed tab does not read as "still here". */
  async closeAttendance(interviewId: string): Promise<{ closed: number }> {
    const now = new Date();
    const open = await this.prisma.interviewParticipant.findMany({
      where: { interviewId, leftAt: null },
      select: { id: true, joinedAt: true, minutesPresent: true },
    });
    for (const participant of open) {
      await this.prisma.interviewParticipant.update({
        where: { id: participant.id },
        data: {
          leftAt: now,
          minutesPresent: participant.minutesPresent + elapsedMinutes(participant.joinedAt, now),
        },
      });
    }
    this.mediaStates.delete(interviewId);
    return { closed: open.length };
  }

  async attendance(actor: AuthenticatedUser, interviewId: string) {
    this.assertStaff(actor);
    await this.loadForStaff(interviewId);

    const participants = await this.prisma.interviewParticipant.findMany({
      where: { interviewId },
      select: {
        id: true,
        identity: true,
        displayName: true,
        role: true,
        joinedAt: true,
        leftAt: true,
        minutesPresent: true,
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    // Prisma emits its own enum union, so the role is narrowed once here rather than
    // cast at every comparison below.
    const roleOf = (p: { role: string }) => p.role as InterviewParticipantRole;
    const minutesFor = (role: InterviewParticipantRole) =>
      participants
        .filter((p) => roleOf(p) === role)
        .reduce(
          (sum, p) =>
            sum + p.minutesPresent + (p.leftAt ? 0 : elapsedMinutes(p.joinedAt, new Date())),
          0,
        );

    return {
      interviewId,
      participants,
      summary: {
        applicantAttended: participants.some(
          (p) => roleOf(p) === InterviewParticipantRole.APPLICANT,
        ),
        interviewerAttended: participants.some(
          (p) => roleOf(p) === InterviewParticipantRole.INTERVIEWER,
        ),
        applicantMinutes: minutesFor(InterviewParticipantRole.APPLICANT),
        interviewerMinutes: minutesFor(InterviewParticipantRole.INTERVIEWER),
        stillConnected: participants.filter((p) => !p.leftAt).length,
      },
    };
  }

  setMediaState(interviewId: string, identity: string, state: MediaState): MediaState {
    let room = this.mediaStates.get(interviewId);
    if (!room) {
      room = new Map();
      this.mediaStates.set(interviewId, room);
    }
    room.set(identity, state);
    return state;
  }

  // ── Live state ────────────────────────────────────────────────────────────

  /**
   * The room's current state for someone who just (re)joined.
   *
   * `notes` are Qari shb's and are stripped for an applicant viewer — the applicant is in
   * the same room, and a half-written "weak on Tajweed" must never reach them.
   */
  async snapshot(
    interviewId: string,
    viewer: { role: InterviewParticipantRole },
  ): Promise<InterviewSnapshot> {
    const interview = await this.prisma.interviewSession.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        status: true,
        stage: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        notes: true,
        outcome: true,
        interviewer: { select: { name: true } },
        application: { select: { applicantName: true } },
      },
    });
    if (!interview) throw AppError.notFound('Interview');

    const present = await this.prisma.interviewParticipant.findMany({
      where: { interviewId, leftAt: null },
      select: { identity: true, displayName: true, role: true, joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    });
    const media = this.mediaStates.get(interviewId);
    const staffViewer = viewer.role !== InterviewParticipantRole.APPLICANT;

    return {
      interviewId: interview.id,
      status: interview.status as InterviewStatus,
      stage: interview.stage as TeacherHiringStatus | null,
      startsAt: interview.startsAt.toISOString(),
      endsAt: interview.endsAt.toISOString(),
      timeZone: interview.timeZone,
      applicantName: interview.application.applicantName,
      interviewerName: interview.interviewer.name,
      notes: staffViewer ? interview.notes : null,
      outcome: interview.outcome as InterviewOutcome,
      participants: present.map((p) => ({
        identity: p.identity,
        displayName: p.displayName,
        role: p.role as InterviewParticipantRole,
        joinedAt: p.joinedAt.toISOString(),
        micOn: media?.get(p.identity)?.micOn ?? null,
        camOn: media?.get(p.identity)?.camOn ?? null,
      })),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * The room snapshot for a staff viewer, which includes the interviewer's notes.
   *
   * A separate entry point from `snapshot` on purpose: `snapshot` is also what the socket
   * serves to the applicant, and the decision of who may read the notes belongs with the
   * authorisation check, not with a flag the caller passes in.
   */
  async staffSnapshot(actor: AuthenticatedUser, interviewId: string): Promise<InterviewSnapshot> {
    this.assertStaff(actor);
    await this.loadForStaff(interviewId);
    return this.snapshot(interviewId, { role: InterviewParticipantRole.INTERVIEWER });
  }

  /** Autosaves the interviewer's running notes. */
  async saveNotes(actor: AuthenticatedUser, interviewId: string, notes: string) {
    this.assertStaff(actor);
    const interview = await this.loadForStaff(interviewId);
    this.assertMayConduct(actor, interview.interviewerId);

    const updated = await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: { notes: notes.trim() || null },
      select: { id: true, notes: true, updatedAt: true },
    });
    return updated;
  }

  /**
   * Records the verdict and wraps the interview up.
   *
   * It does **not** touch the hiring pipeline. `TeachersService.recordStep` stays the one
   * place an application moves, so a verdict typed in a hurry at the end of a call cannot
   * advance or reject someone on its own — the response names the step this feeds so the
   * UI can offer it, and an admin still presses the button.
   */
  async recordOutcome(
    actor: AuthenticatedUser,
    interviewId: string,
    input: { outcome: InterviewOutcome; outcomeNotes?: string; scores?: InterviewScores },
  ) {
    this.assertStaff(actor);
    const interview = await this.loadForStaff(interviewId);
    this.assertMayConduct(actor, interview.interviewerId);

    const status = interview.status as InterviewStatus;
    if (status === InterviewStatus.CANCELLED) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This interview was cancelled; there is no outcome to record',
      );
    }
    if (input.outcome === InterviewOutcome.PENDING) {
      throw AppError.badRequest('Choose PASSED or FAILED; PENDING is the state before a verdict');
    }
    const scores = normaliseScores(input.scores);

    const now = new Date();
    await this.closeAttendance(interviewId);
    const updated = await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: {
        outcome: input.outcome,
        outcomeNotes: input.outcomeNotes?.trim() || null,
        ...scores,
        decidedById: actor.id,
        decidedAt: now,
        // A no-show already carries its own status; a verdict after one does not rewrite it.
        ...(status === InterviewStatus.NO_SHOW_APPLICANT ||
        status === InterviewStatus.NO_SHOW_INTERVIEWER
          ? {}
          : { status: InterviewStatus.COMPLETED }),
        endedAt: interview.endedAt ?? now,
      },
      select: {
        id: true,
        status: true,
        outcome: true,
        outcomeNotes: true,
        decidedAt: true,
        recitationScore: true,
        tajweedScore: true,
        memorisationScore: true,
        teachingScore: true,
        communicationScore: true,
      },
    });

    await this.closeRoom(interviewId, interview.roomId);
    this.logger.log(`Interview ${interviewId} recorded as ${input.outcome} by ${actor.id}`);

    return {
      ...updated,
      /**
       * The hiring step this verdict is evidence for. Recording it stays manual — see
       * `POST /teachers/applications/:id/steps`.
       */
      recordStepHint: {
        applicationId: interview.applicationId,
        step: (interview.stage as TeacherHiringStatus | null) ?? TeacherHiringStatus.DEMO_CLASS,
        suggestedStatus: input.outcome === InterviewOutcome.PASSED ? 'PASSED' : 'FAILED',
      },
    };
  }

  /** Marks who failed to turn up, and closes the room. */
  async markNoShow(
    actor: AuthenticatedUser,
    interviewId: string,
    who: 'APPLICANT' | 'INTERVIEWER',
    note?: string,
  ) {
    this.assertStaff(actor);
    const interview = await this.loadForStaff(interviewId);
    this.assertMayConduct(actor, interview.interviewerId);

    if (CLOSED_INTERVIEW_STATUSES.includes(interview.status as InterviewStatus)) {
      throw new AppError(ErrorCode.CONFLICT, `This interview is already ${interview.status}`);
    }
    if (Date.now() < interview.startsAt.getTime()) {
      throw AppError.badRequest('This interview has not started yet');
    }

    const now = new Date();
    await this.closeAttendance(interviewId);
    const updated = await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: {
        status:
          who === 'APPLICANT'
            ? InterviewStatus.NO_SHOW_APPLICANT
            : InterviewStatus.NO_SHOW_INTERVIEWER,
        endedAt: now,
        outcomeNotes: note?.trim() || interview.outcomeNotes,
      },
      select: { id: true, status: true, endedAt: true, outcomeNotes: true },
    });
    await this.closeRoom(interviewId, interview.roomId);
    return updated;
  }

  /** Ends the call without recording a verdict yet (the room closes; notes are kept). */
  async end(actor: AuthenticatedUser, interviewId: string) {
    this.assertStaff(actor);
    const interview = await this.loadForStaff(interviewId);
    this.assertMayConduct(actor, interview.interviewerId);

    const now = new Date();
    const { closed } = await this.closeAttendance(interviewId);
    const updated = await this.prisma.interviewSession.update({
      where: { id: interviewId },
      data: {
        ...(CLOSED_INTERVIEW_STATUSES.includes(interview.status as InterviewStatus)
          ? {}
          : { status: InterviewStatus.COMPLETED }),
        endedAt: interview.endedAt ?? now,
      },
      select: { id: true, status: true, endedAt: true, outcome: true },
    });
    await this.closeRoom(interviewId, interview.roomId);
    return { ...updated, attendanceClosed: closed };
  }

  // ── Worker sweeps ─────────────────────────────────────────────────────────

  /** Any interview whose room is open and whose start has passed goes LIVE. */
  async promoteStartedInterviews(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.interviewSession.updateMany({
      where: {
        status: InterviewStatus.SCHEDULED,
        roomId: { not: null },
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      data: { status: InterviewStatus.LIVE, startedAt: now },
    });
    return result.count;
  }

  /**
   * Closes interviews whose join window has fully passed: the room is deleted, anyone
   * still "present" is banked, and the status settles. A LIVE interview nobody ended
   * would otherwise sit live forever and keep a provider room alive with it.
   */
  async closeFinishedInterviews(): Promise<{ closed: number; roomsEnded: number }> {
    const cutoff = new Date(Date.now() - INTERVIEW_EARLY_OPEN_MINUTES * 60_000);
    const stale = await this.prisma.interviewSession.findMany({
      where: {
        status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.LIVE] },
        endsAt: { lt: cutoff },
      },
      select: { id: true, status: true, roomId: true },
      take: 200,
    });

    let roomsEnded = 0;
    for (const interview of stale) {
      await this.closeAttendance(interview.id);
      await this.prisma.interviewSession.update({
        where: { id: interview.id },
        data: {
          // Nobody joined a SCHEDULED interview whose window has passed, so it is a
          // no-show rather than a completed one; LIVE means it did happen.
          status:
            (interview.status as InterviewStatus) === InterviewStatus.LIVE
              ? InterviewStatus.COMPLETED
              : InterviewStatus.NO_SHOW_APPLICANT,
          endedAt: new Date(),
        },
      });
      if (await this.closeRoom(interview.id, interview.roomId)) roomsEnded += 1;
    }

    return { closed: stale.length, roomsEnded };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertStaff(actor: AuthenticatedUser): void {
    if (!actor.roles?.some((role) => INTERVIEW_STAFF.includes(role))) {
      throw AppError.forbidden('Only academy staff can work with hiring interviews');
    }
  }

  private isInterviewAdmin(actor: AuthenticatedUser): boolean {
    return Boolean(actor.roles?.some((role) => INTERVIEW_ADMIN.includes(role)));
  }

  private mayConduct(actor: AuthenticatedUser, interviewerId: string): boolean {
    return actor.id === interviewerId || this.isInterviewAdmin(actor);
  }

  /**
   * Notes and the verdict belong to whoever ran the interview. A supervisor who merely
   * sat in cannot overwrite Qari shb's judgement; an admin can, because somebody has to
   * be able to fix a mistake.
   */
  private assertMayConduct(actor: AuthenticatedUser, interviewerId: string): void {
    if (!this.mayConduct(actor, interviewerId)) {
      throw AppError.forbidden(
        'Only the assigned interviewer (or an admin) can change this interview',
      );
    }
  }

  private async resolveInterviewer(userId: string): Promise<{ id: string; name: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, status: true, roles: { select: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') throw AppError.notFound('Interviewer');
    if (!user.roles.some((r) => INTERVIEW_STAFF.includes(r.role as Role))) {
      throw AppError.badRequest('An interview can only be assigned to a supervisor or admin', {
        interviewerId: userId,
      });
    }
    return { id: user.id, name: user.name };
  }

  /** Validates and normalises the booked window. */
  private window(
    startsAt: Date,
    durationMinutes: number | undefined,
    options: { allowPast?: boolean } = {},
  ): { startsAt: Date; endsAt: Date; durationMinutes: number } {
    if (Number.isNaN(startsAt.getTime())) throw AppError.badRequest('startsAt is not a valid date');

    const minutes = durationMinutes ?? INTERVIEW_DURATION.DEFAULT_MINUTES;
    if (
      !Number.isInteger(minutes) ||
      minutes < INTERVIEW_DURATION.MIN_MINUTES ||
      minutes > INTERVIEW_DURATION.MAX_MINUTES
    ) {
      throw AppError.badRequest(
        `An interview lasts between ${INTERVIEW_DURATION.MIN_MINUTES} and ${INTERVIEW_DURATION.MAX_MINUTES} minutes`,
        { durationMinutes: minutes },
      );
    }
    if (!options.allowPast && startsAt.getTime() < Date.now() - 60_000) {
      throw AppError.badRequest('An interview cannot be booked in the past', {
        startsAt: startsAt.toISOString(),
      });
    }

    return {
      startsAt,
      endsAt: new Date(startsAt.getTime() + minutes * 60_000),
      durationMinutes: minutes,
    };
  }

  /**
   * The database has an exclusion constraint for this, which is what actually guarantees
   * it under concurrency. Checking here first turns a raw Postgres error into a message
   * that names the clashing interview.
   */
  private async assertInterviewerFree(
    interviewerId: string,
    startsAt: Date,
    endsAt: Date,
    ignoreInterviewId?: string,
  ): Promise<void> {
    const clash = await this.prisma.interviewSession.findFirst({
      where: {
        interviewerId,
        status: { in: [...BLOCKING_INTERVIEW_STATUSES] },
        ...(ignoreInterviewId ? { id: { not: ignoreInterviewId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (clash) {
      throw new AppError(
        ErrorCode.DOUBLE_BOOKED,
        'That interviewer already has an interview then',
        {
          interviewId: clash.id,
          startsAt: clash.startsAt.toISOString(),
          endsAt: clash.endsAt.toISOString(),
        },
      );
    }
  }

  private windowState(
    interview: { startsAt: Date; endsAt: Date },
    now: number = Date.now(),
  ): JoinWindowState {
    const opensAt = interview.startsAt.getTime() - INTERVIEW_EARLY_OPEN_MINUTES * 60_000;
    const closesAt = interview.endsAt.getTime() + INTERVIEW_EARLY_OPEN_MINUTES * 60_000;
    if (now < opensAt) return 'early';
    if (now > closesAt) return 'closed';
    return 'open';
  }

  private assertJoinable(interview: { status: string; startsAt: Date; endsAt: Date }): void {
    if (CLOSED_INTERVIEW_STATUSES.includes(interview.status as InterviewStatus)) {
      throw new AppError(ErrorCode.CONFLICT, `This interview is ${interview.status}`, {
        status: interview.status,
      });
    }
    const state = this.windowState(interview);
    if (state === 'early') {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `The interview room opens ${INTERVIEW_EARLY_OPEN_MINUTES} minutes before the start`,
        {
          opensAt: new Date(
            interview.startsAt.getTime() - INTERVIEW_EARLY_OPEN_MINUTES * 60_000,
          ).toISOString(),
          startsAt: interview.startsAt.toISOString(),
        },
      );
    }
    if (state === 'closed') {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'This interview has already finished', {
        endsAt: interview.endsAt.toISOString(),
      });
    }
  }

  private async loadForStaff(interviewId: string, options: { withParticipants?: boolean } = {}) {
    const interview = await this.prisma.interviewSession.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        applicationId: true,
        stage: true,
        interviewerId: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        status: true,
        roomId: true,
        notes: true,
        outcome: true,
        outcomeNotes: true,
        recitationScore: true,
        tajweedScore: true,
        memorisationScore: true,
        teachingScore: true,
        communicationScore: true,
        decidedAt: true,
        decidedBy: { select: { id: true, name: true } },
        cancelledAt: true,
        cancelReason: true,
        startedAt: true,
        endedAt: true,
        interviewer: { select: { name: true } },
        application: { select: { applicantName: true, email: true, status: true } },
        ...(options.withParticipants
          ? {
              participants: {
                select: {
                  identity: true,
                  displayName: true,
                  role: true,
                  joinedAt: true,
                  leftAt: true,
                  minutesPresent: true,
                },
                orderBy: { joinedAt: 'asc' as const },
              },
            }
          : {}),
      },
    });
    if (!interview) throw AppError.notFound('Interview');
    return interview as typeof interview & {
      participants?: Array<{
        identity: string;
        displayName: string;
        role: string;
        joinedAt: Date;
        leftAt: Date | null;
        minutesPresent: number;
      }>;
    };
  }

  /**
   * Finds an interview by the applicant's opaque token.
   *
   * The lookup is by HMAC, so the plaintext is never compared and never stored. An expired
   * or unknown token gets the same 404: a wrong token must not reveal that an interview
   * with that id exists.
   */
  private async loadByApplicantToken(plainToken: string) {
    const token = plainToken?.trim();
    if (!token) throw AppError.notFound('Interview');

    const interview = await this.prisma.interviewSession.findUnique({
      where: { applicantTokenHash: this.crypto.hashToken(token) },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        roomId: true,
        applicantTokenExpiresAt: true,
        interviewer: { select: { name: true } },
        application: { select: { applicantName: true } },
      },
    });
    if (!interview) throw AppError.notFound('Interview');
    if (interview.applicantTokenExpiresAt.getTime() < Date.now()) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, 'This interview link has expired');
    }
    return interview;
  }

  private joinUrl(plainToken: string): string {
    const base = this.config.value.APP_WEB_URL.replace(/\/$/, '');
    return `${base}/interview/${encodeURIComponent(plainToken)}`;
  }

  /**
   * Emails the applicant. Never throws: a bounced email must not undo a booking that the
   * admin can still read the link off the screen for.
   */
  private async emailApplicant(
    template: (typeof TEMPLATE)[keyof typeof TEMPLATE],
    input: {
      email: string;
      applicantName: string;
      interviewerName: string;
      startsAt: Date;
      timeZone: string;
      durationMinutes: number;
      joinToken: string | null;
      reason?: string | null;
    },
  ): Promise<void> {
    await this.notifications.emailAddress({
      to: input.email,
      template,
      data: {
        name: input.applicantName,
        interviewerName: input.interviewerName,
        localTime: formatInZone(input.startsAt, input.timeZone),
        timeZone: input.timeZone,
        durationMinutes: input.durationMinutes,
        earlyOpenMinutes: INTERVIEW_EARLY_OPEN_MINUTES,
        // A reschedule/cancel no longer holds the plaintext token, so it points at the
        // lobby the applicant already has in their inbox.
        joinUrl: input.joinToken
          ? this.joinUrl(input.joinToken)
          : `${this.config.value.APP_WEB_URL.replace(/\/$/, '')}/interview`,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    });
  }

  /** Deletes the provider room. Tolerant: a room that already emptied out is gone. */
  private async closeRoom(interviewId: string, roomId: string | null): Promise<boolean> {
    if (!roomId) return false;
    try {
      await this.video.endRoom(roomId);
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not end the room for interview ${interviewId}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}

/** Whole minutes between two instants, never negative. */
export function elapsedMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

/**
 * Keeps only the rubric fields, and only on the 1–5 scale. `null` clears a score;
 * `undefined` leaves it as it was, so a partial save does not wipe the rest.
 */
export function normaliseScores(scores: InterviewScores | undefined): InterviewScores {
  if (!scores) return {};
  const out: InterviewScores = {};
  for (const field of INTERVIEW_SCORE_FIELDS) {
    const value = scores[field];
    if (value === undefined) continue;
    if (value === null) {
      out[field] = null;
      continue;
    }
    if (!Number.isInteger(value) || value < INTERVIEW_SCORE_MIN || value > INTERVIEW_SCORE_MAX) {
      throw AppError.badRequest(
        `${field} must be a whole number between ${INTERVIEW_SCORE_MIN} and ${INTERVIEW_SCORE_MAX}`,
        { field, value },
      );
    }
    out[field] = value;
  }
  return out;
}

/** The booked time as the applicant will read it, in the zone it was booked in. */
function formatInZone(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(at);
  } catch {
    // An unknown IANA zone must not stop the email going out.
    return at.toISOString();
  }
}
