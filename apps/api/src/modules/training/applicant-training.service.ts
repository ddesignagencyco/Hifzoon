import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, TeacherHiringStatus } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import {
  COURSE_CODE,
  COURSE_MODULES,
  COURSE_VERSION,
  QUESTION_BANK,
  QUIZ_RULES,
  TERMS_VERSION,
} from './applicant-course';

const HOUR = 3_600_000;

/** What was served for one question: its id and the option order the applicant saw. */
interface ServedQuestion {
  id: string;
  options: string[];
}

/**
 * The TRAINING hiring step, done properly (CR-09): the applicant reads every module of
 * the guided course, confirms each one, accepts the teacher terms, and passes a quiz that
 * is drawn, shuffled and graded on the server. Only a pass is evidence for the step; the
 * admin then records the step as they do every other one.
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
   * Sends (or re-sends) the course link. A re-send issues a new token, so an old link
   * stops working; progress and attempts are kept. Returns the link once, for handing
   * over in person if the email bounces.
   */
  async send(applicationId: string): Promise<{ trainingUrl: string; status: string }> {
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
        'Every attempt is used. Decide the training step (fail it, or reset it to pending) instead of re-sending',
      );
    }

    const token = this.crypto.issueOpaqueToken(32);
    const fresh = {
      tokenHash: this.crypto.hashToken(token),
      tokenExpiresAt: new Date(Date.now() + QUIZ_RULES.LINK_DAYS * 24 * HOUR),
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
      data: { name: app.applicantName, trainingUrl, days: QUIZ_RULES.LINK_DAYS },
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
        bestScore: true,
        passedAt: true,
        attempts: {
          select: { score: true, total: true, passed: true, startedAt: true, submittedAt: true },
          orderBy: { startedAt: 'asc' },
        },
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
      bestScore: t.bestScore,
      passMark: QUIZ_RULES.PASS_PERCENT,
      passedAt: t.passedAt,
      attempts: t.attempts
        .filter((a) => a.submittedAt)
        .map((a) => ({
          ...a,
          percent: a.score === null ? null : Math.round((a.score / a.total) * 100),
        })),
      maxAttempts: QUIZ_RULES.MAX_ATTEMPTS,
    };
  }

  /** True when the applicant passed: the TRAINING step's only evidence. */
  async hasPassed(applicationId: string): Promise<boolean> {
    const t = await this.prisma.applicantTraining.findUnique({
      where: { applicationId },
      select: { status: true },
    });
    return t?.status === 'PASSED';
  }

  // ── The applicant, by link ────────────────────────────────────────────────

  /** Everything the course page needs. Never includes an answer key. */
  async session(token: string) {
    const t = await this.byToken(token);
    const acks = (t.acknowledgements ?? {}) as Record<string, string>;
    const submitted = t.attempts.filter((a) => a.submittedAt);
    const open = t.attempts.find((a) => !a.submittedAt);
    return {
      applicantName: t.application.applicantName,
      status: t.status,
      courseVersion: t.courseVersion,
      modules: COURSE_MODULES.map((m) => ({ ...m, acknowledgedAt: acks[m.id] ?? null })),
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: t.termsAcceptedAt,
      rules: {
        questionsPerAttempt: QUIZ_RULES.QUESTIONS_PER_ATTEMPT,
        passPercent: QUIZ_RULES.PASS_PERCENT,
        maxAttempts: QUIZ_RULES.MAX_ATTEMPTS,
        cooldownHours: QUIZ_RULES.COOLDOWN_HOURS,
        attemptMinutes: QUIZ_RULES.ATTEMPT_MINUTES,
      },
      attemptsUsed: submitted.length,
      lastResult: submitted.length
        ? (() => {
            const last = submitted[submitted.length - 1];
            return {
              score: last.score,
              total: last.total,
              passed: last.passed,
              submittedAt: last.submittedAt,
            };
          })()
        : null,
      nextAttemptAt: this.nextAttemptAt(submitted),
      openAttempt: open ? this.serve(open) : null,
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

  async acceptTerms(token: string) {
    const t = await this.byToken(token);
    this.assertOpen(t.status);
    this.assertAllRead(t.acknowledgements);
    const updated = await this.prisma.applicantTraining.update({
      where: { id: t.id },
      data: { termsVersion: TERMS_VERSION, termsAcceptedAt: t.termsAcceptedAt ?? new Date() },
      select: { termsVersion: true, termsAcceptedAt: true },
    });
    return updated;
  }

  /** Draws a fresh attempt (or returns the one still open). */
  async startQuiz(token: string) {
    const t = await this.byToken(token);
    this.assertOpen(t.status);
    this.assertAllRead(t.acknowledgements);
    if (!t.termsAcceptedAt)
      throw new AppError(ErrorCode.CONFLICT, 'Accept the teacher terms before the quiz');

    const open = t.attempts.find((a) => !a.submittedAt);
    if (open && Date.now() - open.startedAt.getTime() < QUIZ_RULES.ATTEMPT_MINUTES * 60_000) {
      return this.serve(open);
    }
    if (open) await this.grade(t.id, open.id, (open.answers ?? {}) as Record<string, string>);

    const submitted = (await this.prisma.applicantTrainingAttempt.findMany({
      where: { trainingId: t.id, submittedAt: { not: null } },
      select: { passed: true, submittedAt: true },
      orderBy: { startedAt: 'asc' },
    })) as Array<{ passed: boolean | null; submittedAt: Date | null }>;
    if (submitted.length >= QUIZ_RULES.MAX_ATTEMPTS) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Every attempt has been used; the academy will contact you',
      );
    }
    const next = this.nextAttemptAt(submitted);
    if (next && next.getTime() > Date.now()) {
      throw new AppError(ErrorCode.CONFLICT, 'You can try again after the waiting period', {
        nextAttemptAt: next.toISOString(),
      });
    }

    const questions: ServedQuestion[] = shuffle(QUESTION_BANK)
      .slice(0, QUIZ_RULES.QUESTIONS_PER_ATTEMPT)
      .map((q) => ({ id: q.id, options: shuffle(q.options.map((o) => o.id)) }));
    const attempt = await this.prisma.applicantTrainingAttempt.create({
      data: { trainingId: t.id, questions: questions as never, total: questions.length },
    });
    return this.serve(attempt);
  }

  /** Grades on the server. The response says how many were right, never which answer was. */
  async submitQuiz(token: string, attemptId: string, answers: Record<string, string>) {
    const t = await this.byToken(token);
    this.assertOpen(t.status);
    const attempt = t.attempts.find((a) => a.id === attemptId);
    if (!attempt) throw AppError.notFound('Attempt');
    if (attempt.submittedAt)
      throw new AppError(ErrorCode.CONFLICT, 'This attempt was already submitted');
    return this.grade(t.id, attempt.id, answers);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async grade(trainingId: string, attemptId: string, answers: Record<string, string>) {
    const attempt = await this.prisma.applicantTrainingAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { questions: true, total: true },
    });
    const served = attempt.questions as unknown as ServedQuestion[];
    const score = served.filter(
      (q) => QUESTION_BANK.find((b) => b.id === q.id)?.correct === answers[q.id],
    ).length;
    const percent = Math.round((score / attempt.total) * 100);
    const passed = percent >= QUIZ_RULES.PASS_PERCENT;
    const now = new Date();
    // Only answers to questions actually served are kept.
    const kept = Object.fromEntries(
      served.filter((q) => typeof answers[q.id] === 'string').map((q) => [q.id, answers[q.id]]),
    );

    await this.prisma.applicantTrainingAttempt.update({
      where: { id: attemptId },
      data: { answers: kept, score, passed, submittedAt: now },
    });

    const training = await this.prisma.applicantTraining.findUniqueOrThrow({
      where: { id: trainingId },
      select: {
        applicationId: true,
        bestScore: true,
        application: { select: { applicantName: true } },
        attempts: { where: { submittedAt: { not: null } }, select: { id: true } },
      },
    });
    const used = training.attempts.length;
    const locked = !passed && used >= QUIZ_RULES.MAX_ATTEMPTS;

    await this.prisma.$transaction([
      this.prisma.applicantTraining.update({
        where: { id: trainingId },
        data: {
          bestScore: Math.max(training.bestScore ?? 0, percent),
          ...(passed ? { status: 'PASSED', passedAt: now } : locked ? { status: 'LOCKED' } : {}),
        },
      }),
      // A pass is what fills the training dates the approval and readiness rules read.
      ...(passed
        ? [
            this.prisma.teacherApplication.update({
              where: { id: training.applicationId },
              data: { safeguardingTrainingAt: now, platformTrainingAt: now },
            }),
          ]
        : []),
    ]);

    if (passed) await this.stampProfile(training.applicationId, now);
    if (passed || locked)
      await this.tellHiringTeam(
        training.applicationId,
        training.application.applicantName,
        passed,
        percent,
      );

    return {
      score,
      total: attempt.total,
      percent,
      passed,
      attemptsLeft: passed ? 0 : Math.max(0, QUIZ_RULES.MAX_ATTEMPTS - used),
      nextAttemptAt:
        passed || locked ? null : new Date(now.getTime() + QUIZ_RULES.COOLDOWN_HOURS * HOUR),
    };
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

  private async tellHiringTeam(
    applicationId: string,
    applicantName: string,
    passed: boolean,
    percent: number,
  ) {
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
          result: passed
            ? `passed the training (${percent}%)`
            : `used every training attempt without passing (best ${percent}%)`,
          url: `/admin/teachers/applications/${applicationId}`,
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
        application: { select: { applicantName: true, status: true } },
        attempts: {
          select: {
            id: true,
            questions: true,
            answers: true,
            total: true,
            score: true,
            passed: true,
            startedAt: true,
            submittedAt: true,
          },
          orderBy: { startedAt: 'asc' },
        },
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
      throw new AppError(ErrorCode.CONFLICT, 'You have already passed this training');
    if (status === 'LOCKED')
      throw new AppError(
        ErrorCode.CONFLICT,
        'Every attempt has been used; the academy will contact you',
      );
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

  private nextAttemptAt(
    submitted: Array<{ passed: boolean | null; submittedAt: Date | null }>,
  ): Date | null {
    const last = submitted[submitted.length - 1];
    if (!last || last.passed || !last.submittedAt) return null;
    return new Date(last.submittedAt.getTime() + QUIZ_RULES.COOLDOWN_HOURS * HOUR);
  }

  /** An attempt as the applicant sees it: prompts and options in the served order, no key. */
  private serve(attempt: { id: string; questions: unknown; startedAt: Date }) {
    const served = attempt.questions as ServedQuestion[];
    return {
      attemptId: attempt.id,
      expiresAt: new Date(attempt.startedAt.getTime() + QUIZ_RULES.ATTEMPT_MINUTES * 60_000),
      questions: served.map((s) => {
        const q = QUESTION_BANK.find((b) => b.id === s.id)!;
        return {
          id: q.id,
          prompt: q.prompt,
          options: s.options.map((id) => ({ id, text: q.options.find((o) => o.id === id)!.text })),
        };
      }),
    };
  }
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
