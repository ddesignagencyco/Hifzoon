import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';
import { TeacherHiringStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import {
  COURSE_CODE,
  COURSE_MODULES,
  COURSE_VERSION,
  TERMS_VERSION,
  TRAINING_LINK_DAYS,
} from './applicant-course';

const HOUR = 3_600_000;

/**
 * The TRAINING hiring step (CR-09): the applicant reads every module of the guided course,
 * confirms each one, then accepts the teacher terms. Accepting the terms after the last module
 * completes the training; that completion is the evidence for the step, which the admin then
 * records as they do every other one.
 *
 * Applicants have no account, so they hold an emailed link. Only the token's HMAC is
 * stored, the token travels in request bodies, and it unlocks this course and nothing
 * else about the application.
 */
@Injectable()
export class ApplicantTrainingService {
  private readonly logger = new Logger(ApplicantTrainingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── The hiring team ────────────────────────────────────────────────────────

  /**
   * Issues a fresh link and emails it; any earlier link stops working. With `onlyIfUnsent`
   * (the automatic send when the application reaches training) an applicant who already has a
   * link keeps it, so a course in progress is not cut off. Progress is kept either way. Returns
   * the link once, for handing over in person if the email bounces; null when nothing was sent.
   */
  async send(
    applicationId: string,
    { onlyIfUnsent = false }: { onlyIfUnsent?: boolean } = {},
  ): Promise<{ trainingUrl: string; status: string } | null> {
    const app = await this.prisma.teacherApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        applicantName: true,
        email: true,
        training: { select: { status: true } },
      },
    });
    if (!app) throw AppError.notFound('Application');
    if (onlyIfUnsent && app.training) return null;
    if (
      app.status === TeacherHiringStatus.REJECTED ||
      app.status === TeacherHiringStatus.APPROVED
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `This application is already ${app.status.toLowerCase()}`,
      );
    }
    if (app.training?.status === 'PASSED') {
      throw new AppError(ErrorCode.CONFLICT, 'The applicant has already passed the training');
    }
    if (app.training?.status === 'LOCKED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This training is closed. Decide the training step (fail it, or reset it to pending) instead of re-sending',
      );
    }

    const token = this.crypto.issueOpaqueToken(32);
    const fresh = {
      tokenHash: this.crypto.hashToken(token),
      tokenExpiresAt: new Date(Date.now() + TRAINING_LINK_DAYS * 24 * HOUR),
      sentAt: new Date(),
    };
    const training = await this.prisma.applicantTraining.upsert({
      where: { applicationId },
      update: fresh,
      create: { applicationId, courseCode: COURSE_CODE, courseVersion: COURSE_VERSION, ...fresh },
      select: { status: true },
    });

    const trainingUrl = `${this.config.value.APP_WEB_URL.replace(/\/$/, '')}/training/${encodeURIComponent(token)}`;
    await this.notifications.emailAddress({
      to: app.email,
      template: TEMPLATE.TEACHER_TRAINING_INVITE,
      data: { name: app.applicantName, trainingUrl, days: TRAINING_LINK_DAYS },
    });
    return { trainingUrl, status: training.status };
  }

  /** The training as the admin page shows it. */
  async summary(applicationId: string) {
    const t = await this.prisma.applicantTraining.findUnique({
      where: { applicationId },
      select: {
        status: true,
        courseVersion: true,
        sentAt: true,
        tokenExpiresAt: true,
        acknowledgements: true,
        termsVersion: true,
        termsAcceptedAt: true,
        passedAt: true,
      },
    });
    if (!t) return null;
    const acks = (t.acknowledgements ?? {}) as Record<string, string>;
    return {
      status: t.status,
      courseVersion: t.courseVersion,
      sentAt: t.sentAt,
      linkExpiresAt: t.tokenExpiresAt,
      modulesRead: COURSE_MODULES.filter((m) => acks[m.id]).length,
      modulesTotal: COURSE_MODULES.length,
      termsVersion: t.termsVersion,
      termsAcceptedAt: t.termsAcceptedAt,
      passedAt: t.passedAt,
    };
  }

  /** True when the applicant completed the course: the TRAINING step's only evidence. */
  async hasPassed(applicationId: string): Promise<boolean> {
    const t = await this.prisma.applicantTraining.findUnique({
      where: { applicationId },
      select: { status: true },
    });
    return t?.status === 'PASSED';
  }

  // ── The applicant, by link ────────────────────────────────────────────────

  /** Everything the course page needs. */
  async session(token: string) {
    const t = await this.byToken(token);
    const acks = (t.acknowledgements ?? {}) as Record<string, string>;
    return {
      applicantName: t.application.applicantName,
      status: t.status,
      courseVersion: t.courseVersion,
      modules: COURSE_MODULES.map((m) => ({ ...m, acknowledgedAt: acks[m.id] ?? null })),
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: t.termsAcceptedAt,
    };
  }

  async acknowledge(token: string, moduleId: string) {
    const t = await this.byToken(token);
    this.assertOpen(t.status);
    if (!COURSE_MODULES.some((m) => m.id === moduleId)) throw AppError.badRequest('Unknown module');
    const acks = { ...((t.acknowledgements ?? {}) as Record<string, string>) };
    acks[moduleId] ??= new Date().toISOString();
    await this.prisma.applicantTraining.update({
      where: { id: t.id },
      data: { acknowledgements: acks, status: 'IN_PROGRESS' },
    });
    return { moduleId, acknowledgedAt: acks[moduleId] };
  }

  /**
   * Accepting the terms, once every module is confirmed, completes the training: the pass
   * fills the application's training dates (which approval and readiness read), is stamped on
   * an existing teacher profile, and the hiring team is told.
   */
  async acceptTerms(token: string) {
    const t = await this.byToken(token);
    this.assertOpen(t.status);
    this.assertAllRead(t.acknowledgements);
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.applicantTraining.update({
        where: { id: t.id },
        data: {
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: t.termsAcceptedAt ?? now,
          status: 'PASSED',
          passedAt: now,
        },
        select: { termsVersion: true, termsAcceptedAt: true, status: true, passedAt: true },
      }),
      this.prisma.teacherApplication.update({
        where: { id: t.applicationId },
        data: { safeguardingTrainingAt: now, platformTrainingAt: now },
      }),
    ]);
    await this.stampProfile(t.applicationId, now);
    await this.tellHiringTeam(t.applicationId, t.application.applicantName);
    return updated;
  }

  /**
   * A teacher provisioned by the office already has a profile, so the pass is stamped
   * there too. The TRAINING step itself is not passed yet at this point, so readiness stays
   * false and the consistency trigger agrees; it becomes true when the step is recorded.
   */
  private async stampProfile(applicationId: string, at: Date) {
    const app = await this.prisma.teacherApplication.findUnique({
      where: { id: applicationId },
      select: { userId: true },
    });
    if (!app?.userId) return;
    await this.prisma.teacherProfile
      .updateMany({ where: { userId: app.userId }, data: { safeguardingTrainingCompletedAt: at } })
      .catch((error: Error) =>
        this.logger.warn(`Profile not stamped for ${applicationId}: ${error.message}`),
      );
  }

  private async tellHiringTeam(applicationId: string, applicantName: string) {
    try {
      const staff = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          roles: { some: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR'] } } },
        },
        select: { id: true },
      });
      if (staff.length === 0) return;
      await this.notifications.enqueue({
        userIds: staff.map((u) => u.id),
        template: TEMPLATE.TEACHER_TRAINING_RESULT,
        data: {
          applicantName,
          result: 'completed the training and accepted the teacher terms',
          url: `/admin/hiring/applications/${applicationId}`,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Hiring team not told about training for ${applicationId}: ${(error as Error).message}`,
      );
    }
  }

  private async byToken(token: string) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200)
      throw AppError.notFound('Training');
    const t = await this.prisma.applicantTraining.findUnique({
      where: { tokenHash: this.crypto.hashToken(token) },
      select: {
        id: true,
        status: true,
        courseVersion: true,
        tokenExpiresAt: true,
        acknowledgements: true,
        termsAcceptedAt: true,
        applicationId: true,
        application: { select: { applicantName: true, status: true } },
      },
    });
    // Unknown, expired and closed all read the same, so a token is not an existence oracle.
    if (
      !t ||
      t.tokenExpiresAt.getTime() < Date.now() ||
      t.application.status === TeacherHiringStatus.REJECTED
    ) {
      throw AppError.notFound('Training');
    }
    return t;
  }

  private assertOpen(status: string) {
    if (status === 'PASSED')
      throw new AppError(ErrorCode.CONFLICT, 'You have already completed this training');
    // From when the course ended in a quiz with limited attempts.
    if (status === 'LOCKED')
      throw new AppError(ErrorCode.CONFLICT, 'The academy will contact you about your training');
  }

  private assertAllRead(acknowledgements: unknown) {
    const acks = (acknowledgements ?? {}) as Record<string, string>;
    const unread = COURSE_MODULES.filter((m) => !acks[m.id]);
    if (unread.length > 0) {
      throw new AppError(ErrorCode.CONFLICT, 'Read and confirm every module first', {
        unread: unread.map((m) => m.id),
      });
    }
  }
}
