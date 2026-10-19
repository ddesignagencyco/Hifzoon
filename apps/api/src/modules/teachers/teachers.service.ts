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
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
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
    private readonly notifications: NotificationsService,
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

    await this.assertUploadKeys(input.recitationAudioKey, input.documentKeys);

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

    // The admin cannot read a private object by its key, so hand back short-lived signed
    // links alongside the raw keys (B31).
    const [recitationAudioDownloadUrl, documents] = await Promise.all([
      this.downloadUrlFor(application.recitationAudioUrl),
      Promise.all(
        application.documents.map(async (doc) => ({
          ...doc,
          downloadUrl: await this.downloadUrlFor(doc.fileUrl),
        })),
      ),
    ]);
    const profile = application.userId
      ? await this.prisma.teacherProfile.findUnique({
          where: { userId: application.userId },
          select: { id: true, pendingProfileChanges: true, pendingProfileChangesAt: true },
        })
      : null;

    return {
      ...application,
      recitationAudioDownloadUrl,
      documents,
      profileId: profile?.id ?? null,
      pendingProfileChanges: profile?.pendingProfileChanges ?? null,
      pendingProfileChangesAt: profile?.pendingProfileChangesAt ?? null,
    };
  }

  /** A signed GET for a stored key, or null for legacy values that are not storage keys. */
  private async downloadUrlFor(value: string | null): Promise<string | null> {
    if (!value || !UPLOAD_KEY_PATTERN.test(value)) return null;
    try {
      return await this.storage.signedDownloadUrl(value);
    } catch (error) {
      this.logger.warn(`Could not sign a download link for ${value}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * An upload key comes from the client, so it is checked before it is stored (B32): the
   * format and prefix must match the kind it was presigned for, and the object must
   * exist, otherwise any string (including an old base64 data URL) would be kept.
   */
  private async assertUploadKeys(
    recitationAudioKey?: string,
    documentKeys?: Record<string, unknown>,
  ): Promise<void> {
    const checks: Array<{ field: string; key: unknown; prefix: string }> = [];
    if (recitationAudioKey !== undefined) {
      checks.push({ field: 'recitationAudioKey', key: recitationAudioKey, prefix: 'recitations/' });
    }
    for (const [type, key] of Object.entries(documentKeys ?? {})) {
      if (key) checks.push({ field: `documents.${type}`, key, prefix: 'documents/' });
    }

    for (const { field, key, prefix } of checks) {
      if (
        typeof key !== 'string' ||
        key.length > 512 ||
        !UPLOAD_KEY_PATTERN.test(key) ||
        !key.startsWith(prefix)
      ) {
        throw AppError.badRequest(`"${field}" is not a valid upload key`, { field });
      }
      if (!(await this.storage.objectExists(key))) {
        throw AppError.badRequest(`"${field}" refers to a file that was not uploaded`, { field });
      }
    }
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

    // B8 — steps run in order, and the Swagger description has always said so. Recording
    // ID_CHECK before the demo has happened used to be accepted, which let an application
    // reach APPROVED with the earlier checks never done.
    assertStepOrder(application.status as TeacherHiringStatus, input.step, input.status);

    // B8 — the step, the derived application status and the approval all move together,
    // or not at all. They used to be three separate writes, so `completeApproval` could
    // refuse (409) *after* the step had been recorded and the application had already been
    // flipped to APPROVED: a refused approval that read as approved.
    const result = await this.prisma.$transaction(async (tx) => {
      const recordedStep = await tx.hiringStep.update({
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
        await tx.teacherApplication.update({
          where: { id: application.id },
          data: { status: nextStatus },
        });
      }

      if (nextStatus === TeacherHiringStatus.APPROVED) {
        // Runs inside the transaction: if it refuses, the step and the status flip roll
        // back with it and the application stays where it honestly is.
        await this.completeApproval(application.id, tx);
      }

      return { step: recordedStep, applicationStatus: nextStatus ?? application.status };
    });

    // Readiness depends on every step, so it is recomputed after each one rather than
    // only at the end — that way a teacher cleared step-by-step becomes matchable on
    // the last step, and revoking any step takes them straight back out of matching.
    await this.recomputeReadiness(application.userId);

    return result;
  }

  /**
   * FR-TCH-02 / CR-09 — approval creates the teacher account and, only if every step
   * passed and safeguarding training is done, marks the profile `ready_to_match`.
   *
   * The DB trigger would reject `ready_to_match: true` otherwise; checking here first
   * turns that into an actionable message for the reviewer.
   */
  private async completeApproval(
    applicationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const application = await db.teacherApplication.findUnique({
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
    const completedTraining = await db.trainingAssignment.findFirst({
      where: {
        course: { code: { in: [...TEACHER_MATCHABILITY.REQUIRED_TRAINING_CODES] } },
        status: 'COMPLETED',
        teacher: application.userId ? { userId: application.userId } : undefined,
      },
      select: { id: true },
    });

    const profileHasStamp = await db.teacherProfile.findFirst({
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
      await db.$executeRaw`SELECT recompute_teacher_readiness(${application.userId}::uuid)`;

      await db.teacherProfile.updateMany({
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
        // 7.4 - the recitation sample was selectable but never returned, so the
        // play button on a teacher page had nothing to play.
        recitationSampleUrl: true,
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

  /**
   * M1 — the caller's own profile, at any point in the hiring pipeline.
   *
   * Deliberately not `publicProfile`: that route only resolves a fully cleared teacher, so a
   * newly hired one could not find their profile id anywhere and could not build a timetable
   * or set availability. This answers from the user id in the token, so it cannot be pointed
   * at someone else, and includes the review state a teacher needs to see.
   */
  async ownProfile(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        hiringStatus: true,
        readyToMatch: true,
        safeguardingTrainingCompletedAt: true,
        bio: true,
        photoUrl: true,
        introVideoUrl: true,
        recitationSampleUrl: true,
        qualifications: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        gender: true,
        ratingAvg: true,
        ratingCount: true,
        pendingProfileChanges: true,
        pendingProfileChangesAt: true,
        profileChangeOutcome: true,
        profileChangeReason: true,
        profileChangeReviewedAt: true,
        user: { select: { id: true, name: true, email: true, timeZone: true } },
        availability: {
          select: { weekday: true, startTime: true, endTime: true, timeZone: true },
          orderBy: { weekday: 'asc' },
        },
      },
    });
    if (!profile) throw AppError.notFound('Teacher profile');
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
        userId: true,
        bio: true,
        photoUrl: true,
        // 7.4 - the directory's play button needs both media fields on the list as well
        // as the detail page; without them a live teacher's audition is invisible.
        introVideoUrl: true,
        recitationSampleUrl: true,
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
   * FR-TCH-05 — stages a teacher's own edits for review; they are applied by an
   * admin, never written straight to the public profile.
   */
  async requestProfileChange(input: { userId: string; changes: Record<string, unknown> }) {
    assertProfileChanges(input.changes);
    await this.assertProfileReferences(input.changes);

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true, pendingProfileChanges: true },
    });
    if (!profile) throw AppError.notFound('Teacher profile');

    const existing = (profile.pendingProfileChanges ?? {}) as Record<string, unknown>;
    const updated = await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        pendingProfileChanges: { ...existing, ...input.changes } as never,
        pendingProfileChangesAt: new Date(),
        // A new submission starts a new review; the last outcome no longer applies.
        profileChangeOutcome: null,
        profileChangeReason: null,
        profileChangeReviewedAt: null,
      },
      select: { id: true, pendingProfileChanges: true, user: { select: { name: true } } },
    });

    await this.notifyAdminsOfProfileChange(updated.user.name, Object.keys(input.changes));
    const { user: _user, ...result } = updated;
    return result;
  }

  /** Tells the admins a change is waiting (M57). A failed send never blocks the teacher. */
  private async notifyAdminsOfProfileChange(teacherName: string, fields: string[]): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          roles: { some: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
        },
        select: { id: true },
      });
      if (admins.length === 0) return;
      await this.notifications.enqueue({
        userIds: admins.map((a) => a.id),
        template: TEMPLATE.PROFILE_CHANGE_SUBMITTED,
        data: { teacherName, fields: fields.join(', ') },
      });
    } catch (error) {
      this.logger.warn(`Could not notify admins of a profile change: ${(error as Error).message}`);
    }
  }

  /** `subjects` must be real course codes and `languages` ISO 639-1 codes (B33). */
  private async assertProfileReferences(changes: Record<string, unknown>): Promise<void> {
    const languages = changes.languages as string[] | undefined;
    if (languages) {
      const bad = languages.filter((code) => !/^[a-z]{2}$/.test(code));
      if (bad.length > 0) {
        throw AppError.badRequest('languages must be ISO 639-1 codes such as "ar" or "en"', {
          field: 'languages',
          invalid: bad,
        });
      }
    }

    const subjects = changes.subjects as string[] | undefined;
    if (subjects && subjects.length > 0) {
      const known = await this.prisma.course.findMany({
        where: { code: { in: subjects } },
        select: { code: true },
      });
      const knownCodes = new Set(known.map((c) => c.code));
      const bad = subjects.filter((code) => !knownCodes.has(code));
      if (bad.length > 0) {
        throw AppError.badRequest('subjects must be existing course codes', {
          field: 'subjects',
          invalid: bad,
        });
      }
    }
  }

  /**
   * Teachers with a staged profile change waiting for approval (M54).
   *
   * An admin could approve or reject a change but could not see that one existed, or what
   * it said. Each row carries the staged values next to the live ones so the reviewer
   * sees a before and after.
   */
  async listPendingProfileChanges() {
    const profiles = await this.prisma.teacherProfile.findMany({
      where: { NOT: { pendingProfileChanges: { equals: Prisma.DbNull } } },
      select: {
        id: true,
        pendingProfileChanges: true,
        pendingProfileChangesAt: true,
        bio: true,
        photoUrl: true,
        introVideoUrl: true,
        recitationSampleUrl: true,
        qualifications: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        user: { select: { name: true } },
      },
      orderBy: { pendingProfileChangesAt: 'asc' },
      take: 200,
    });

    return profiles.map((profile) => {
      const changes = (profile.pendingProfileChanges ?? {}) as Record<string, unknown>;
      const current: Record<string, unknown> = {};
      for (const key of Object.keys(changes)) {
        current[key] = (profile as unknown as Record<string, unknown>)[key] ?? null;
      }
      return {
        profileId: profile.id,
        teacherName: profile.user.name,
        submittedAt: profile.pendingProfileChangesAt,
        changes,
        current,
      };
    });
  }

  async reviewProfileChange(input: {
    profileId: string;
    approve: boolean;
    reviewerUserId: string;
    reason?: string;
  }) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: input.profileId },
      select: { id: true, userId: true, pendingProfileChanges: true },
    });
    if (!profile) throw AppError.notFound('Teacher profile');
    if (!profile.pendingProfileChanges)
      throw AppError.badRequest('There is no pending change to review');

    const changes = profile.pendingProfileChanges as Record<string, unknown>;

    if (!input.approve) {
      const rejected = await this.prisma.teacherProfile.update({
        where: { id: profile.id },
        data: {
          pendingProfileChanges: Prisma.DbNull,
          pendingProfileChangesAt: null,
          profileChangeOutcome: 'REJECTED',
          profileChangeReason: input.reason ?? null,
          profileChangeReviewedAt: new Date(),
        },
        select: { id: true, pendingProfileChanges: true },
      });
      await this.notifyTeacherOfReview(profile.userId, 'rejected', input.reason);
      return rejected;
    }

    // The allow-list is the same one validated on the way in, so approval cannot write a
    // field the change request would have been refused for.
    const sanitised = Object.fromEntries(
      Object.entries(changes).filter(([key]) =>
        PROFILE_CHANGE_KEYS.includes(key as ProfileChangeKey),
      ),
    );

    const approved = await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        ...(sanitised as Prisma.TeacherProfileUpdateInput),
        pendingProfileChanges: Prisma.DbNull,
        pendingProfileChangesAt: null,
        profileChangeOutcome: 'APPROVED',
        profileChangeReason: null,
        profileChangeReviewedAt: new Date(),
      },
      select: {
        id: true,
        bio: true,
        photoUrl: true,
        introVideoUrl: true,
        recitationSampleUrl: true,
        qualifications: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        pendingProfileChanges: true,
      },
    });
    await this.notifyTeacherOfReview(profile.userId, 'approved');
    return approved;
  }

  /** Tells the teacher how their change ended (M57). A failed send never blocks the review. */
  private async notifyTeacherOfReview(
    userId: string,
    outcome: 'approved' | 'rejected',
    reason?: string,
  ): Promise<void> {
    try {
      await this.notifications.enqueue({
        userIds: [userId],
        template: TEMPLATE.PROFILE_CHANGE_REVIEWED,
        data: { outcome, reason: reason ?? null },
      });
    } catch (error) {
      this.logger.warn(
        `Could not notify a teacher of a profile review: ${(error as Error).message}`,
      );
    }
  }

  /**
   * The teacher withdraws their own staged change (M57). Only the owner can: the profile is
   * found from the caller's user id, never from a path parameter.
   */
  async withdrawProfileChange(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true, pendingProfileChanges: true },
    });
    if (!profile) throw AppError.notFound('Teacher profile');
    if (!profile.pendingProfileChanges) {
      throw AppError.badRequest('There is no pending change to withdraw');
    }

    return this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        pendingProfileChanges: Prisma.DbNull,
        pendingProfileChangesAt: null,
        profileChangeOutcome: 'WITHDRAWN',
        profileChangeReason: null,
        profileChangeReviewedAt: new Date(),
      },
      select: { id: true, pendingProfileChanges: true, profileChangeOutcome: true },
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
      // M21 — the status was selected and never returned, so a teacher could not tell a
      // cancelled class from a scheduled one in their own brief.
      status: session.status,
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
/**
 * B8 — a hiring step may only be recorded when it is the one the application is waiting for.
 *
 * The pipeline is a sequence: a demo class cannot be recorded as ID_CHECK, because that is
 * not a decision the academy can make until it has heard the recitation. Re-recording a
 * step the application has already moved past is allowed, because a reviewer revising a
 * decision has to be able to; what is refused is jumping forwards.
 */
function assertStepOrder(
  applicationStatus: TeacherHiringStatus,
  step: TeacherHiringStatus,
  status: 'PASSED' | 'FAILED' | 'PENDING',
): void {
  if (status !== 'PASSED') return;

  const current = HIRING_PIPELINE.indexOf(applicationStatus);
  const requested = HIRING_PIPELINE.indexOf(step);
  if (current === -1 || requested === -1) return;
  if (requested === current || requested < current) return;

  throw new AppError(
    ErrorCode.CONFLICT,
    `Cannot record ${step}: this application is at ${applicationStatus}`,
    { expectedStep: applicationStatus, requestedStep: step, pipeline: [...HIRING_PIPELINE] },
  );
}

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

/**
 * The fields a teacher may change on their own profile, and how each is validated.
 *
 * B2 — the previous allow-list covered five fields, so `languages`, `subjects` and
 * `ageGroups` could be staged and then silently dropped on approval, and any other key
 * was accepted with no complaint. A teacher who edits their subjects and sees no change is
 * a support ticket; worse, a key that looks like it was applied invites the academy to
 * believe it was.
 *
 * So the shape is checked on the way *in*, with an unknown key refused by name, and the
 * same list drives what approval writes.
 */
const PROFILE_CHANGE_SCHEMA = {
  bio: { kind: 'text', max: 2000 },
  photoUrl: { kind: 'url' },
  introVideoUrl: { kind: 'url' },
  recitationSampleUrl: { kind: 'url' },
  qualifications: { kind: 'json' },
  languages: { kind: 'stringArray', max: 10, maxLength: 16 },
  // Course codes, exactly as seeded and matched against (see `assertBookableSlot`).
  subjects: { kind: 'stringArray', max: 20, maxLength: 32 },
  ageGroups: { kind: 'stringArray', max: 10, maxLength: 32 },
} as const;

type ProfileChangeKey = keyof typeof PROFILE_CHANGE_SCHEMA;

const PROFILE_CHANGE_KEYS = Object.keys(PROFILE_CHANGE_SCHEMA) as ProfileChangeKey[];

/** https only in production; http is allowed elsewhere so local media works (S21). */
function isAllowedPublicUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'https:' || (protocol === 'http:' && process.env.NODE_ENV !== 'production');
}

/** Object keys the presign endpoint hands out: `<kind>/<year>/<uuid>.<ext>`. */
const UPLOAD_KEY_PATTERN = /^(recitations|documents)\/\d{4}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

function assertProfileChanges(changes: Record<string, unknown>): void {
  const unknown = Object.keys(changes).filter(
    (key) => !PROFILE_CHANGE_KEYS.includes(key as ProfileChangeKey),
  );
  if (unknown.length > 0) {
    throw AppError.badRequest('These profile fields cannot be changed here', {
      unknownFields: unknown,
      allowedFields: PROFILE_CHANGE_KEYS,
    });
  }

  for (const [key, value] of Object.entries(changes)) {
    const rule = PROFILE_CHANGE_SCHEMA[key as ProfileChangeKey];

    if (value === null) {
      // Clearing a scalar is allowed; a list field is non-null in the database, so clearing
      // it means sending [] (a staged null would fail on approval, B33).
      if (rule.kind === 'stringArray') {
        throw AppError.badRequest(`"${key}" cannot be null; send an empty list to clear it`, {
          field: key,
        });
      }
      continue;
    }

    if (rule.kind === 'text') {
      if (typeof value !== 'string' || value.length > rule.max) {
        throw AppError.badRequest(`"${key}" must be a string of at most ${rule.max} characters`, {
          field: key,
        });
      }
      continue;
    }

    if (rule.kind === 'url') {
      if (typeof value !== 'string' || !isAllowedPublicUrl(value)) {
        // Approved URLs are served on the public teacher profile, so only web links qualify:
        // javascript:, data: and similar schemes are refused (S21).
        throw AppError.badRequest(`"${key}" must be an https URL`, { field: key });
      }
      continue;
    }

    if (rule.kind === 'json') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw AppError.badRequest(`"${key}" must be an object`, { field: key });
      }
      continue;
    }

    // stringArray — the list-valued fields the approval step had no support for.
    if (
      !Array.isArray(value) ||
      value.length > rule.max ||
      value.some((entry) => typeof entry !== 'string' || entry.length > rule.maxLength)
    ) {
      throw AppError.badRequest(
        `"${key}" must be an array of at most ${rule.max} strings of ${rule.maxLength} characters or fewer`,
        { field: key },
      );
    }
  }
}
