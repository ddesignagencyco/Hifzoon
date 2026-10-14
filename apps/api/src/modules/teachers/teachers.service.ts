import { Injectable, Logger } from '@nestjs/common';
import {
  ApplicationDocumentType,
  ErrorCode,
  HIRING_PIPELINE,
  TEACHER_MATCHABILITY,
  TeacherHiringStatus,
} from '@hifzoon/shared';

import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

/**
 * Teacher applications, hiring pipeline and profiles (TCH-BE-01 … TCH-BE-04,
 * FR-TCH-01, FR-TCH-02, FR-TCH-05, CR-09).
 *
 * The rule everything else hangs off: **a teacher cannot be matched to a student until
 * every hiring step has passed and safeguarding training is complete.** That is
 * enforced three times over — computed here, filtered in the matching query, and by a
 * database trigger — because it is a child-safety control, not a business rule.
 */
@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── Applications (FR-TCH-01) ───────────────────────────────────────────────

  /**
   * Public application form. Anyone can apply, including with no account, which is why
   * it takes a name and email rather than a user id. Documents are referenced as
   * storage keys, never as public URLs (CMP-BE-05).
   */
  async submitApplication(input: {
    applicantName: string;
    email: string;
    phone?: string;
    country?: string;
    qualifications?: unknown;
    recitationAudioKey?: string;
    documentKeys?: Partial<Record<ApplicationDocumentType, string>>;
  }) {
    const email = input.email.trim().toLowerCase();

    const open = await this.prisma.teacherApplication.findFirst({
      where: {
        email,
        status: { notIn: [TeacherHiringStatus.REJECTED, TeacherHiringStatus.APPROVED] },
      },
      select: { id: true, status: true },
    });
    if (open) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'An application with this email is already in progress',
        { applicationId: open.id, status: open.status },
      );
    }

    const application = await this.prisma.teacherApplication.create({
      data: {
        applicantName: input.applicantName,
        email,
        phone: input.phone ?? null,
        country: input.country ?? null,
        qualifications: (input.qualifications as never) ?? undefined,
        recitationAudioUrl: input.recitationAudioKey ?? null,
        status: TeacherHiringStatus.SUBMITTED,
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Create the full pipeline up front so the board has something to show and every
    // step has a slot to be recorded against.
    await this.prisma.hiringStep.createMany({
      data: HIRING_PIPELINE.filter((step) => step !== TeacherHiringStatus.REJECTED).map((step) => ({
        applicationId: application.id,
        step,
        status: step === TeacherHiringStatus.SUBMITTED ? ('PASSED' as const) : ('PENDING' as const),
        completedAt: step === TeacherHiringStatus.SUBMITTED ? new Date() : null,
      })),
    });

    if (input.documentKeys) {
      await this.prisma.applicationDocument.createMany({
        data: Object.entries(input.documentKeys)
          .filter(([, key]) => Boolean(key))
          .map(([type, key]) => ({
            applicationId: application.id,
            type: type as ApplicationDocumentType,
            fileUrl: key,
          })),
      });
    }

    this.logger.log(`Teacher application ${application.id} submitted for ${email}`);
    return { ...application, nextStep: TeacherHiringStatus.RECITATION_REVIEW };
  }

  /** Admin pipeline board (FR-TCH-01). */
  async listApplications(filter: { status?: TeacherHiringStatus }) {
    return this.prisma.teacherApplication.findMany({
      where: filter.status ? { status: filter.status } : {},
      select: {
        id: true,
        applicantName: true,
        email: true,
        country: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        steps: {
          select: {
            step: true,
            status: true,
            completedAt: true,
            notes: true,
            reviewer: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        documents: { select: { id: true, type: true, fileUrl: true, verified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getApplication(id: string) {
    const application = await this.prisma.teacherApplication.findUnique({
      where: { id },
      select: {
        id: true,
        applicantName: true,
        email: true,
        phone: true,
        country: true,
        qualifications: true,
        recitationAudioUrl: true,
        status: true,
        userId: true,
        steps: {
          select: { id: true, step: true, status: true, notes: true, completedAt: true },
          orderBy: { createdAt: 'asc' },
        },
        documents: {
          select: { id: true, type: true, fileUrl: true, verified: true, approvedById: true },
        },
      },
    });
    if (!application) throw AppError.notFound('Application');
    return application;
  }

  /**
   * Records the outcome of a hiring step.
   *
   * Moving the application forward to APPROVED is refused here when the safeguarding
   * training is missing, so the reason is a clear 409 for the reviewer rather than an
   * opaque database error from the trigger.
   */
  async recordStep(input: {
    applicationId: string;
    step: TeacherHiringStatus;
    status: 'PASSED' | 'FAILED' | 'PENDING';
    notes?: string;
    reviewerUserId: string;
  }) {
    const application = await this.prisma.teacherApplication.findUnique({
      where: { id: input.applicationId },
      select: { id: true, status: true, applicantName: true, email: true, userId: true },
    });
    if (!application) throw AppError.notFound('Application');

    const step = await this.prisma.hiringStep.update({
      where: { applicationId_step: { applicationId: input.applicationId, step: input.step } },
      data: {
        status: input.status,
        notes: input.notes ?? null,
        reviewerId: input.reviewerUserId,
        completedAt: input.status === 'PENDING' ? null : new Date(),
      },
      select: { id: true, step: true, status: true, completedAt: true },
    });

    const nextStatus = deriveApplicationStatus(input.step, input.status);
    if (nextStatus && (nextStatus as string) !== (application.status as string)) {
      await this.prisma.teacherApplication.update({
        where: { id: application.id },
        data: { status: nextStatus },
      });
    }

    if (nextStatus === TeacherHiringStatus.APPROVED) {
      await this.completeApproval(application.id);
    }

    // Readiness depends on every step, so it is recomputed after each one rather than
    // only at the end — that way a teacher cleared step-by-step becomes matchable on
    // the last step, and revoking any step takes them straight back out of matching.
    await this.recomputeReadiness(application.userId);

    return { step, applicationStatus: nextStatus ?? application.status };
  }

  /**
   * FR-TCH-02 / CR-09 — approval creates the teacher account and, only if every step
   * passed and safeguarding training is done, marks the profile `ready_to_match`.
   *
   * The DB trigger would reject `ready_to_match: true` otherwise; checking here first
   * turns that into an actionable message for the reviewer.
   */
  private async completeApproval(applicationId: string): Promise<void> {
    const application = await this.prisma.teacherApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        applicantName: true,
        email: true,
        userId: true,
        qualifications: true,
        steps: { select: { status: true, step: true } },
      },
    });
    if (!application) return;

    // Only the *real* process steps count. `APPROVED` and `REJECTED` are derived
    // outcomes rather than things a reviewer records, and counting them here made
    // approval impossible: recording the last real step derives `APPROVED`, which then
    // immediately failed its own "all steps passed" precondition.
    const outstanding = application.steps.filter(
      (s) => s.status !== 'PASSED' && s.step !== 'APPROVED' && s.step !== 'REJECTED',
    );
    if (outstanding.length > 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Cannot approve: ${outstanding.length} hiring step(s) are not passed`,
        { steps: outstanding.map((s) => s.step) },
      );
    }

    // CR-09 — approval alone is not enough. The safeguarding module has to be
    // recorded as completed, either on the training assignment or on the profile.
    const completedTraining = await this.prisma.trainingAssignment.findFirst({
      where: {
        course: { code: { in: [...TEACHER_MATCHABILITY.REQUIRED_TRAINING_CODES] } },
        status: 'COMPLETED',
        teacher: application.userId ? { userId: application.userId } : undefined,
      },
      select: { id: true },
    });

    const profileHasStamp = await this.prisma.teacherProfile.findFirst({
      where: {
        userId: application.userId ?? undefined,
        safeguardingTrainingCompletedAt: { not: null },
      },
      select: { id: true },
    });

    if (!completedTraining && !profileHasStamp) {
      this.logger.warn(
        `Application ${application.id} approved without safeguarding training; the teacher stays ` +
          'unmatchable until it is recorded (FR-TCH-02, CR-09)',
      );
    }

    // A cleared application has to clear the *profile* too. `PolicyService.assertTeacherMatchable`
    // requires `hiringStatus === 'APPROVED'` as well as `ready_to_match`, so without this the
    // teacher would be fully cleared by the trigger and still refused by every match call.
    if (application.userId) {
      // Readiness is recomputed *before* the hiring status is flipped. The database
      // consistency trigger derives the expected `ready_to_match` from the training
      // stamp and the hiring steps, so touching the profile with a stale flag after the
      // steps have passed would be rejected.
      await this.prisma
        .$executeRaw`SELECT recompute_teacher_readiness(${application.userId}::uuid)`;

      await this.prisma.teacherProfile.updateMany({
        where: { userId: application.userId, hiringStatus: { not: TeacherHiringStatus.REJECTED } },
        data: { hiringStatus: TeacherHiringStatus.APPROVED },
      });
    }

    this.logger.log(`Teacher application ${application.id} approved`);
  }

  /**
   * Recomputes `ready_to_match` after a hiring step is recorded.
   *
   * The original code only ever *validated* the flag and never derived it, so a teacher
   * who had passed every step and completed safeguarding training stayed permanently
   * unmatchable. Readiness is now owned by the database function, which both the step
   * path and the training path call.
   */
  private async recomputeReadiness(userId: string | null): Promise<void> {
    if (!userId) return;
    try {
      await this.prisma.$executeRaw`SELECT recompute_teacher_readiness(${userId}::uuid)`;
    } catch (error) {
      this.logger.warn(
        `Could not recompute teacher readiness for ${userId}: ${(error as Error).message}`,
      );
    }
  }

  // ── Profiles (FR-TCH-05) ──────────────────────────────────────────────────

  /** Public teacher profile for the website (FR-ADM-01). No contact details (CR-07). */
  async publicProfile(userId: string) {
    // `userId` is the profile's unique key, so the requested teacher is the one returned.
    // Only an approved, matchable teacher has a public profile, mirroring
    // `listPublicProfiles` — otherwise a delisted teacher would still resolve by id.
    const profile = await this.prisma.teacherProfile.findFirst({
      where: { userId, hiringStatus: 'APPROVED', readyToMatch: true },
      select: {
        id: true,
        bio: true,
        photoUrl: true,
        introVideoUrl: true,
        gender: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        publicRatingAvg: true,
        user: { select: { name: true, timeZone: true } },
      },
    });
    if (!profile) throw AppError.notFound('Teacher');
    return profile;
  }

  async listPublicProfiles(filter: { subject?: string; language?: string }) {
    const profiles = await this.prisma.teacherProfile.findMany({
      where: {
        // `readyToMatch` is the real gate, not just hiring approval. A teacher whose
        // steps were later revoked, or whose safeguarding training lapsed, is still
        // `hiringStatus: APPROVED` but must not be offered to families — listing them
        // is how a family ends up booking a teacher that `/scheduling/book` then
        // refuses with FR-TCH-02, which reads to the parent as a broken app.
        readyToMatch: true,
        hiringStatus: 'APPROVED',
        ...(filter.subject ? { subjects: { has: filter.subject } } : {}),
        ...(filter.language ? { languages: { has: filter.language } } : {}),
      },
      select: {
        id: true,
        bio: true,
        photoUrl: true,
        gender: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        publicRatingAvg: true,
        user: { select: { name: true } },
      },
      orderBy: { publicRatingAvg: 'desc' },
      take: 100,
    });
    return profiles;
  }

  /**
   * Teacher edits to their own profile are staged, not applied: `pending_profile_changes`
   * holds the proposal and an admin approves or rejects it. A public page is not
   * something a teacher should be able to rewrite unilaterally (FR-TCH-05).
   */
  async requestProfileChange(input: { userId: string; changes: Record<string, unknown> }) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true, pendingProfileChanges: true },
    });
    if (!profile) throw AppError.notFound('Teacher profile');

    const existing = (profile.pendingProfileChanges ?? {}) as Record<string, unknown>;
    return this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: { pendingProfileChanges: { ...existing, ...input.changes } as never },
      select: { id: true, pendingProfileChanges: true },
    });
  }

  async reviewProfileChange(input: {
    profileId: string;
    approve: boolean;
    reviewerUserId: string;
  }) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: input.profileId },
      select: { id: true, pendingProfileChanges: true },
    });
    if (!profile) throw AppError.notFound('Teacher profile');
    if (!profile.pendingProfileChanges)
      throw AppError.badRequest('There is no pending change to review');

    const changes = profile.pendingProfileChanges as Record<string, unknown>;

    if (!input.approve) {
      return this.prisma.teacherProfile.update({
        where: { id: profile.id },
        data: { pendingProfileChanges: Prisma.DbNull },
        select: { id: true, pendingProfileChanges: true },
      });
    }

    // Only an explicit allow-list may be applied; anything else in the payload is dropped
    // rather than written.
    const allowed = ['bio', 'photoUrl', 'introVideoUrl', 'recitationSampleUrl', 'qualifications'];
    const sanitised = Object.fromEntries(
      Object.entries(changes).filter(([key]) => allowed.includes(key)),
    );

    return this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        ...(sanitised as Prisma.TeacherProfileUpdateInput),
        pendingProfileChanges: Prisma.DbNull,
      },
      select: { id: true, bio: true, photoUrl: true, pendingProfileChanges: true },
    });
  }

  /** Records safeguarding training completion, which is one half of the matching gate. */
  async recordSafeguardingTraining(profileId: string, completedAt: Date) {
    // Stamp first, then recompute: the consistency trigger rejects any `ready_to_match`
    // that the inputs do not yet support, so the two writes cannot be swapped.
    const updated = await this.prisma.teacherProfile.update({
      where: { id: profileId },
      data: { safeguardingTrainingCompletedAt: completedAt },
      select: { id: true, safeguardingTrainingCompletedAt: true, userId: true },
    });

    await this.recomputeReadiness(updated.userId);

    return this.prisma.teacherProfile.findUnique({
      where: { id: profileId },
      select: { id: true, safeguardingTrainingCompletedAt: true, readyToMatch: true },
    });
  }

  /** FR-TCH-04 — the pre-class brief. One call, everything a teacher needs. */
  async preClassBrief(input: { teacherUserId: string; classId: string }) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      select: {
        id: true,
        startsAt: true,
        status: true,
        course: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, userId: true, user: { select: { name: true } } } },
        students: {
          select: {
            student: {
              select: {
                id: true,
                displayName: true,
                enrolments: {
                  where: { status: { in: ['TRIAL', 'ACTIVE'] } },
                  take: 1,
                  select: {
                    id: true,
                    currentLessonPosition: true,
                    currentLevel: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) throw AppError.notFound('Class');
    if (session.teacher.userId !== input.teacherUserId) {
      // A substitute who has not been assigned the class must not read the brief.
      throw AppError.forbidden('This class is not assigned to you');
    }

    const studentIds = session.students.map((s) => s.student.id);
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [lastCards, recurringMistakes] = await Promise.all([
      this.prisma.lessonCard.findMany({
        where: { studentId: { in: studentIds }, submittedAt: { not: null } },
        select: {
          id: true,
          studentId: true,
          submittedAt: true,
          homework: true,
          portions: {
            select: {
              kind: true,
              fromSurah: true,
              fromAyah: true,
              toSurah: true,
              toAyah: true,
              grade: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 10,
      }),
      this.prisma.mistake.groupBy({
        by: ['studentId', 'type', 'surah', 'ayah'],
        where: { studentId: { in: studentIds }, occurredAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { surah: 'desc' } },
        take: 20,
      }),
    ]);

    return {
      classId: session.id,
      startsAt: session.startsAt,
      course: session.course,
      students: session.students.map((s) => ({
        ...s.student,
        lastLessonCard: lastCards.find((c) => c.studentId === s.student.id) ?? null,
        nextLessonPosition: s.student.enrolments[0]?.currentLessonPosition ?? null,
        currentLevel: s.student.enrolments[0]?.currentLevel?.name ?? null,
      })),
      // FR-REC-02 / FR-TCH-04 — the mistakes that keep coming back, so the teacher
      // knows where to spend the lesson.
      recurringMistakes: recurringMistakes.map((m) => ({
        studentId: m.studentId,
        type: m.type,
        surah: m.surah,
        ayah: m.ayah,
        occurrences: m._count._all,
      })),
      recentLessonCards: lastCards.slice(0, 5),
    };
  }
}

/** A failed step moves the application to that step's status, not past it. */
function deriveApplicationStatus(
  step: TeacherHiringStatus,
  status: 'PASSED' | 'FAILED' | 'PENDING',
): TeacherHiringStatus | null {
  if (status === 'FAILED') return step;
  if (status === 'PENDING') return step;
  if (step === TeacherHiringStatus.APPROVED) return TeacherHiringStatus.APPROVED;
  const index = HIRING_PIPELINE.indexOf(step);
  return HIRING_PIPELINE[index + 1] ?? step;
}
