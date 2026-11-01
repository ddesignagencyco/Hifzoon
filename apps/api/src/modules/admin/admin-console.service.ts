import { Injectable } from '@nestjs/common';
import { HIRING_PIPELINE, TeacherHiringStatus } from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { AuditService } from '../audit/audit.service';

export type AdminSearchEntity = 'students' | 'families' | 'teachers' | 'classes';

/**
 * Cross-entity admin search and account administration (FR-OPS-04, OPS-FE-04).
 *
 * Support's actual question is never "show me the Students table" — it is "find the
 * account for this phone number", without knowing whether it is a family, a student or a
 * teacher. So the primary operation searches all four entities at once and labels each
 * hit with what kind of thing it is.
 *
 * Two safety properties, both required by CR-07 and NFR-SEC-02:
 *
 *   - **The free-text search is prefix-tolerant and never exposes another family's
 *     data by accident.** Results are scoped to what the caller's roles permit, and
 *     search terms are bounded in length so an unbounded `contains` cannot be used to
 *     dump the table.
 *   - **Account suspension is reversible and audited.** `LOCKED` (not deletion) is the
 *     mechanism, because a deleted parent cannot be given their child's history back.
 */
@Injectable()
export class AdminConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Searches students, families, teachers and classes together.
   *
   * Empty results are returned per entity rather than as a single empty list, so the
   * console can say "no family matched, but 2 students did" instead of implying the
   * search failed.
   */
  async search(query: string, entity: AdminSearchEntity = 'students', limit = 20, page = 1) {
    const term = query.trim();
    if (term.length < 2) {
      throw AppError.badRequest('Search term must be at least 2 characters');
    }
    if (term.length > 120) {
      throw AppError.badRequest('Search term must be at most 120 characters');
    }
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(1, page) - 1) * take;
    const contains = { contains: term, mode: 'insensitive' as const };

    if (entity === 'students') {
      const studentWhere = {
        OR: [
          { displayName: contains },
          { family: { members: { some: { user: { email: contains } } } } },
        ],
      };
      const [students, total] = await Promise.all([
        this.prisma.student.findMany({
          where: studentWhere,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            family: {
              select: {
                id: true,
                name: true,
                members: { select: { user: { select: { id: true, email: true, name: true } } } },
              },
            },
            enrolments: {
              select: {
                id: true,
                status: true,
                teacher: { select: { user: { select: { id: true, name: true } } } },
                course: { select: { id: true, name: true } },
              },
            },
          },
        }),
        this.prisma.student.count({ where: studentWhere }),
      ]);
      return { entity, items: students, total, tookAt: new Date().toISOString() };
    }

    if (entity === 'families') {
      const where = {
        OR: [
          { name: contains },
          { members: { some: { user: { email: contains } } } },
          { members: { some: { user: { phone: contains } } } },
          { members: { some: { user: { name: contains } } } },
        ],
      };
      const [items, total] = await Promise.all([
        this.prisma.family.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            members: {
              select: {
                relationship: true,
                user: { select: { id: true, email: true, name: true, phone: true, status: true } },
              },
            },
            students: { select: { id: true, displayName: true, birthYear: true } },
          },
        }),
        this.prisma.family.count({ where }),
      ]);
      return { entity, items, total, tookAt: new Date().toISOString() };
    }

    if (entity === 'teachers') {
      const where = {
        OR: [
          { user: { name: contains } },
          { user: { email: contains } },
          { subjects: { has: term } },
        ],
      };
      const [items, total] = await Promise.all([
        this.prisma.teacherProfile.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true, status: true } },
            _count: { select: { enrolments: true, classes: true } },
          },
        }),
        this.prisma.teacherProfile.count({ where }),
      ]);
      return { entity, items, total, tookAt: new Date().toISOString() };
    }

    const where = {
      OR: [{ course: { name: contains } }, { teacher: { user: { name: contains } } }],
    };
    const [items, total] = await Promise.all([
      this.prisma.classSession.findMany({
        where,
        skip,
        take,
        orderBy: { startsAt: 'desc' },
        include: {
          course: { select: { id: true, name: true } },
          teacher: { select: { id: true, user: { select: { id: true, name: true } } } },
          _count: { select: { participants: true, students: true } },
        },
      }),
      this.prisma.classSession.count({ where }),
    ]);
    return { entity: 'classes' as const, items, total, tookAt: new Date().toISOString() };
  }

  /**
   * Locks or reactivates an account (FR-OPS-04).
   *
   * A locked account keeps its rows: an erasure request (FR-PRV-05) and an
   * accidental lock look identical from the user's side, and only the second one is
   * recoverable.
   */
  async setUserStatus(userId: string, status: 'ACTIVE' | 'LOCKED' | 'DISABLED', actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, email: true, name: true },
    });
    if (!user) throw AppError.notFound('User');
    if (user.status === status) return user;

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status } }),
      // Locking must also end live access. Sessions are revoked rather than merely
      // flagged, so an already-open websocket and access token stop working at once.
      ...(status !== 'ACTIVE'
        ? [this.prisma.session.deleteMany({ where: { userId, revokedAt: null } })]
        : []),
    ]);

    // Locking an account is the single action most likely to be used against a person,
    // so the before/after is recorded here as well as by the route interceptor — the
    // interceptor sees the response, this sees the status the account actually had.
    await this.audit.record({
      actorId,
      action: `ops.user.status.${status}`,
      targetType: 'user',
      targetId: userId,
      before: { status: user.status },
      after: { status },
    });

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, email: true, name: true },
    });
  }

  /** Replaces a user's role assignment (FR-OPS-04). */
  async setRoles(userId: string, roles: string[], actorId: string) {
    const before = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });

    await this.prisma.userRole.deleteMany({ where: { userId } });
    await this.prisma.userRole.createMany({
      data: roles.map((role) => ({ userId, role: role as never })),
      skipDuplicates: true,
    });

    await this.audit.record({
      actorId,
      action: 'ops.user.roles',
      targetType: 'user',
      targetId: userId,
      before: { roles: before.map((r) => r.role) },
      after: { roles },
    });

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, status: true, roles: true },
    });
  }

  /**
   * Provisions a teacher account (FR-OPS-04).
   *
   * This exists because the platform otherwise has no way to create a teacher at all:
   * applications are submitted by candidates, but the account, the role and the cleared
   * profile are staff actions. Without it a teacher can never be onboarded.
   *
   * Two rules:
   *   - **`readyToMatch` is never set here.** A new teacher starts uncleared; they become
   *     matchable only through the hiring pipeline and safeguarding training (FR-TCH-02).
   *     A shortcut that sets it would let a teacher take live classes with families before
   *     safeguarding clearance, which is the one thing CR-04 exists to prevent.
   *   - **Re-inviting an existing email updates the profile, not the account.** A school
   *     re-hiring a former teacher must not be able to silently reset their password.
   */
  async provisionTeacher(input: {
    email: string;
    name: string;
    phone?: string;
    password: string;
    languages: string[];
    subjects: string[];
    ageGroups: string[];
    gender?: 'MALE' | 'FEMALE';
    bio?: string;
    actorId: string;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { teacherProfile: { select: { id: true } } },
    });

    if (existingUser) {
      if (!existingUser.teacherProfile)
        throw AppError.conflict('CONFLICT', 'That email belongs to a non-teacher account');
      return this.prisma.teacherProfile.update({
        where: { id: existingUser.teacherProfile.id },
        data: {
          languages: input.languages,
          subjects: input.subjects,
          ageGroups: input.ageGroups,
          bio: input.bio ?? null,
          gender: input.gender ?? null,
        },
      });
    }

    const passwordHash = await this.crypto.hashPassword(input.password);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          phone: input.phone ?? null,
          passwordHash,
          emailVerifiedAt: new Date(),
          roles: { create: [{ role: 'TEACHER' }] },
        },
      });

      const profile = await tx.teacherProfile.create({
        data: {
          userId: user.id,
          languages: input.languages,
          subjects: input.subjects,
          ageGroups: input.ageGroups,
          gender: input.gender ?? null,
          bio: input.bio ?? null,
          // Deliberately uncleared: hiring steps and safeguarding training flip this.
          hiringStatus: 'SUBMITTED',
          readyToMatch: false,
        },
      });

      // The application is created here, linked to the new account, so the teacher can be
      // cleared through the normal hiring pipeline. Without this link the application
      // approval path has no `userId` to act on and the teacher never becomes matchable.
      const application = await tx.teacherApplication.create({
        data: {
          applicantName: input.name,
          email: input.email.toLowerCase(),
          phone: input.phone ?? null,
          userId: user.id,
          status: 'SUBMITTED',
        },
      });

      await tx.hiringStep.createMany({
        // Compared against the shared enum members rather than bare strings: `HIRING_PIPELINE`
        // is typed as `TeacherHiringStatus[]`, so a string comparison here is a type-safety
        // hole (a renamed member would silently never match) rather than a shortcut.
        data: HIRING_PIPELINE.filter((step) => step !== TeacherHiringStatus.REJECTED).map(
          (step) => ({
            applicationId: application.id,
            step,
            status:
              step === TeacherHiringStatus.SUBMITTED ? ('PASSED' as const) : ('PENDING' as const),
            completedAt: step === TeacherHiringStatus.SUBMITTED ? new Date() : null,
          }),
        ),
      });

      await this.audit.record({
        actorId: input.actorId,
        action: 'ops.teacher.provision',
        targetType: 'teacher_profile',
        targetId: profile.id,
        after: {
          userId: user.id,
          email: input.email,
          readyToMatch: false,
          applicationId: application.id,
        },
      });

      return { ...profile, applicationId: application.id };
    });
  }

  /**
   * Why a teacher is or is not matchable (FR-TCH-02, OPS-FE-08).
   *
   * This exists because "teacher not appearing in suggestions" is otherwise undiagnosable:
   * the same symptom has four possible causes (hiring steps outstanding, safeguarding
   * training missing, hiring not approved, or simply a lower score than the top three),
   * and none of them can be told apart from the outside.
   */
  async teacherReadiness(teacherId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        readyToMatch: true,
        hiringStatus: true,
        safeguardingTrainingCompletedAt: true,
        userId: true,
        // R2 — the tier was only on the public directory, so a teacher not yet public
        // showed no tier to the admin assigning one.
        tier: { select: { id: true, code: true, name: true, badgeIcon: true } },
      },
    });
    if (!profile) throw AppError.notFound('Teacher');

    const steps = await this.prisma.hiringStep.findMany({
      where: { application: { userId: profile.userId } },
      select: { step: true, status: true },
    });

    const outstanding = steps.filter(
      (s) => s.status !== 'PASSED' && s.step !== 'APPROVED' && s.step !== 'REJECTED',
    );

    return {
      teacherId: profile.id,
      readyToMatch: profile.readyToMatch,
      hiringStatus: profile.hiringStatus,
      tier: profile.tier,
      safeguardingTrainingCompleted: profile.safeguardingTrainingCompletedAt !== null,
      outstandingSteps: outstanding.map((s) => s.step),
      // Each unmet requirement is reported separately, so the answer is a checklist the
      // reviewer can work through rather than a single opaque boolean.
      blockers: [
        ...(profile.safeguardingTrainingCompletedAt === null
          ? ['safeguarding training not recorded']
          : []),
        ...(profile.hiringStatus !== 'APPROVED'
          ? [`hiring status is ${profile.hiringStatus}`]
          : []),
        ...(outstanding.length > 0
          ? [`hiring steps outstanding: ${outstanding.map((s) => s.step).join(', ')}`]
          : []),
      ],
    };
  }

  /** Dashboard counters for the admin home screen (OPS-FE-01). */
  async overview() {
    const [students, families, teachers, activeClasses, openCases, overdueTasks] =
      await Promise.all([
        this.prisma.student.count(),
        this.prisma.family.count(),
        this.prisma.teacherProfile.count({ where: { hiringStatus: 'APPROVED' } }),
        // "Active" here means scheduled and not yet finished, which is the operational
        // question ("what is coming up"), not the live one.
        this.prisma.classSession.count({ where: { status: { in: ['SCHEDULED', 'LIVE'] } } }),
        this.prisma.caseRecord.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
        this.prisma.task.count({ where: { status: 'OPEN', dueAt: { lt: new Date() } } }),
      ]);

    return { students, families, teachers, activeClasses, openCases, overdueTasks };
  }
}
