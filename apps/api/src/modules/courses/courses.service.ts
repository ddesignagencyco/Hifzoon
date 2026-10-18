import { Injectable, Logger } from '@nestjs/common';
import { CourseType, EnrolmentStatus, ErrorCode } from '@hifzoon/shared';

import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { hasAnyRole, PolicyService } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

const LIVE_ENROLMENTS: EnrolmentStatus[] = [
  EnrolmentStatus.TRIAL,
  EnrolmentStatus.ACTIVE,
  EnrolmentStatus.PAUSED,
];

/** Non-teaching staff roles that may read every enrolment (NFR-SEC-02). */
const STAFF_SCOPE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD'];

/** What a guardian may set on their own child's enrolment (FR-PAR-05). */
const GUARDIAN_SETTABLE_STATUSES: EnrolmentStatus[] = [
  EnrolmentStatus.ACTIVE,
  EnrolmentStatus.PAUSED,
  EnrolmentStatus.CANCELLED,
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Courses, levels, lessons and enrolments (CRS-BE-01, CRS-BE-02, FR-CRS-01, FR-CRS-02).
 *
 * The catalogue is data, not code: every course type in the SRS exists as rows so a
 * new course or level is a content change an academic lead can make, not a deploy.
 * Enrolment is the join that everything else hangs off — scheduling, attendance,
 * lesson cards and billing all reference it.
 */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Public catalogue (FR-ADM-01, FR-CRS-01) ────────────────────────────────

  /** Active courses with their levels, for the public site. No auth required. */
  async catalogue(locale = 'en') {
    const courses = await this.prisma.course.findMany({
      where: { active: true, locale },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        description: true,
        levels: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            position: true,
            lessonTemplates: {
              orderBy: { position: 'asc' },
              select: { id: true, title: true, position: true, objectives: true },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return courses.map((course) => ({
      ...course,
      levels: course.levels.map((level) => ({
        id: level.id,
        name: level.name,
        position: level.position,
        lessonCount: level.lessonTemplates.length,
        lessons: level.lessonTemplates,
      })),
    }));
  }

  async findCourse(codeOrId: string) {
    // `Course.id` is a UUID column: putting a course *code* into the id filter makes
    // Prisma fail with P2023 (HTTP 500) before the query ever runs, so the id side of
    // the OR is only added when the path segment can actually be one.
    const isUuid = UUID_PATTERN.test(codeOrId);
    const course = await this.prisma.course.findFirst({
      where: isUuid ? { OR: [{ code: codeOrId }, { id: codeOrId }] } : { code: codeOrId },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        description: true,
        active: true,
        levels: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            position: true,
            passMark: true,
            rubric: true,
            lessonTemplates: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                position: true,
                objectives: true,
                materials: true,
                // `teacherNotes` is teacher-only content: this endpoint is @Public().
              },
            },
          },
        },
      },
    });
    if (!course) throw AppError.notFound('Course');
    return course;
  }

  // ── Enrolments (FR-CRS-02) ─────────────────────────────────────────────────

  async createEnrolment(input: {
    studentId: string;
    courseId: string;
    teacherId?: string;
    status?: EnrolmentStatus;
    actorUserId: string;
    /**
     * The caller's real roles, never a hard-coded GUARDIAN. PolicyService decides
     * access from the subject's roles, so passing a literal here would deny staff
     * callers and grant guardians access they should not have.
     */
    actorRoles: string[];
  }) {
    await this.policies.assertStudentAccess(
      { userId: input.actorUserId, roles: input.actorRoles },
      input.studentId,
    );

    const [student, course] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, displayName: true },
      }),
      this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: {
          id: true,
          name: true,
          levels: { orderBy: { position: 'asc' }, take: 1, select: { id: true } },
        },
      }),
    ]);
    if (!student) throw AppError.notFound('Student');
    if (!course) throw AppError.notFound('Course');

    if (input.teacherId) {
      await this.policies.assertTeacherMatchable(input.teacherId);
    }

    // One live enrolment per student per course: a second one would let a family be
    // billed twice and would split the lesson-card history in two.
    const existing = await this.prisma.enrolment.findFirst({
      where: {
        studentId: input.studentId,
        courseId: input.courseId,
        status: { in: LIVE_ENROLMENTS },
      },
      select: { id: true, status: true, teacherId: true, currentLevelId: true },
    });
    if (existing && existing.status !== 'TRIAL') {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This student already has a live enrolment in that course',
        { enrolmentId: existing.id },
      );
    }

    // A trial *is* the enrolment (B28), so signing up properly after one continues that
    // relationship rather than opening a parallel row: the teacher's history, the
    // lesson cards and the billing all stay on one record. The trial's teacher is
    // carried over when the family does not name one, so the Ustadh the child already
    // met does not silently become teacherless.
    if (existing) {
      const upgraded = await this.prisma.enrolment.update({
        where: { id: existing.id },
        data: {
          status: input.status ?? EnrolmentStatus.ACTIVE,
          startedAt: new Date(),
          teacherId: input.teacherId ?? existing.teacherId,
          currentLevelId: existing.currentLevelId ?? course.levels[0]?.id ?? null,
        },
        select: {
          id: true,
          status: true,
          course: { select: { id: true, code: true, name: true } },
        },
      });
      this.logger.log(
        `Enrolment ${upgraded.id}: trial upgraded to ${upgraded.status} for ${student.displayName} -> ${course.name}`,
      );
      return upgraded;
    }

    const enrolment = await this.prisma.enrolment.create({
      data: {
        studentId: input.studentId,
        courseId: input.courseId,
        teacherId: input.teacherId ?? null,
        currentLevelId: course.levels[0]?.id ?? null,
        status: input.status ?? EnrolmentStatus.TRIAL,
        startedAt: new Date(),
      },
      select: { id: true, status: true, course: { select: { id: true, code: true, name: true } } },
    });

    this.logger.log(`Enrolment ${enrolment.id}: ${student.displayName} -> ${course.name}`);
    return enrolment;
  }

  async listEnrolments(filter: {
    studentId?: string;
    teacherUserId?: string;
    status?: EnrolmentStatus;
    actorUserId: string;
    actorRoles: string[];
  }) {
    const subject = { userId: filter.actorUserId, roles: filter.actorRoles };

    // NFR-SEC-02 — the row set is derived from the caller, never from query params:
    // staff see every enrolment, a teacher only their own, everyone else only their
    // family's (the query params narrow that scope further, they never widen it).
    let scope: Prisma.EnrolmentWhereInput = {};
    if (hasAnyRole(subject, STAFF_SCOPE_ROLES)) {
      scope = {};
    } else if (subject.roles.includes('TEACHER')) {
      scope = { teacher: { userId: subject.userId } };
    } else if (subject.roles.includes('STUDENT') || subject.roles.includes('CHILD_STUDENT')) {
      // M7 — a student signing in with their own account fell into the family branch and
      // was shown an empty list, because `student.family.members` holds the *guardians*,
      // not the child. Their own record is the row they are.
      scope = { student: { userId: subject.userId } };
    } else {
      scope = { student: { family: { members: { some: { userId: subject.userId } } } } };
    }

    const enrolments = await this.prisma.enrolment.findMany({
      where: {
        AND: [
          scope,
          ...(filter.studentId ? [{ studentId: filter.studentId }] : []),
          ...(filter.teacherUserId ? [{ teacher: { userId: filter.teacherUserId } }] : []),
          ...(filter.status ? [{ status: filter.status }] : []),
        ],
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        pausedUntil: true,
        currentLessonPosition: true,
        student: { select: { id: true, displayName: true, birthYear: true } },
        course: { select: { id: true, code: true, name: true } },
        currentLevel: { select: { id: true, name: true, position: true } },
        teacher: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return enrolments;
  }

  async updateEnrolmentStatus(input: {
    enrolmentId: string;
    status: EnrolmentStatus;
    pausedUntil?: Date;
    actorUserId: string;
    reason?: string;
    actorRoles: string[];
  }) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        status: true,
        student: {
          select: {
            id: true,
            displayName: true,
            family: {
              select: {
                id: true,
                members: { where: { isPrimary: true }, select: { userId: true } },
              },
            },
          },
        },
        course: { select: { name: true } },
        teacher: { select: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');

    const isGuardianOfStudent = enrolment.student.family.members.some(
      (m) => m.userId === input.actorUserId,
    );
    if (!isGuardianOfStudent) {
      await this.policies.assertStudentAccess(
        { userId: input.actorUserId, roles: input.actorRoles },
        enrolment.student.id,
      );
    }

    // FR-PAR-05 — a guardian may pause, resume or cancel their own child's plan; only
    // staff may complete an enrolment (it is an assessment outcome, not a customer
    // decision) or set a fresh TRIAL.
    const isStaff = hasAnyRole({ userId: input.actorUserId, roles: input.actorRoles }, STAFF_SCOPE_ROLES);
    if (!isStaff) {
      if (input.status === EnrolmentStatus.COMPLETED) {
        throw AppError.forbidden('Only staff can complete an enrolment');
      }
      if (!GUARDIAN_SETTABLE_STATUSES.includes(input.status)) {
        throw AppError.forbidden('A guardian may only pause, resume or cancel an enrolment');
      }
    }

    const updated = await this.prisma.enrolment.update({
      where: { id: input.enrolmentId },
      data: {
        status: input.status,
        ...(input.pausedUntil !== undefined ? { pausedUntil: input.pausedUntil } : {}),
      },
      select: { id: true, status: true, pausedUntil: true },
    });

    // Pausing or cancelling stops future sessions appearing on the family calendar.
    if ([EnrolmentStatus.PAUSED, EnrolmentStatus.CANCELLED].includes(input.status)) {
      await this.prisma.classSession.updateMany({
        where: {
          students: { some: { enrolmentId: input.enrolmentId } },
          status: 'SCHEDULED',
          startsAt: { gt: new Date() },
        },
        data: {
          status: 'CANCELLED_FAMILY',
          cancelReason: input.reason ?? `Enrolment ${input.status}`,
        },
      });
    }

    if (
      enrolment.teacher?.user &&
      [EnrolmentStatus.PAUSED, EnrolmentStatus.CANCELLED].includes(input.status)
    ) {
      await this.notifications.enqueue({
        userIds: [enrolment.teacher.user.id],
        template: TEMPLATE.CLASS_CANCELLED,
        data: {
          studentName: enrolment.student.displayName,
          localDate: new Date().toISOString().slice(0, 10),
          cancelledBy: 'the academy',
        },
      });
    }

    return updated;
  }

  /**
   * FR-CRS-02 — "next lesson for any teacher including a substitute".
   *
   * The query is deliberately enrolment-scoped rather than teacher-scoped: a substitute
   * may hold no enrolment at all, and the lesson plan has to follow the student, not
   * the teacher.
   */
  async nextLesson(input: { enrolmentId: string }) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        currentLessonPosition: true,
        currentLevelId: true,
        student: { select: { id: true, displayName: true } },
        course: { select: { id: true, name: true, code: true } },
      },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');

    const lesson = enrolment.currentLevelId
      ? await this.prisma.lessonTemplate.findUnique({
          where: {
            levelId_position: {
              levelId: enrolment.currentLevelId,
              position: enrolment.currentLessonPosition,
            },
          },
          select: {
            id: true,
            title: true,
            position: true,
            objectives: true,
            materials: true,
            teacherNotes: true,
          },
        })
      : null;

    const level = enrolment.currentLevelId
      ? await this.prisma.courseLevel.findUnique({
          where: { id: enrolment.currentLevelId },
          select: { id: true, name: true, position: true },
        })
      : null;

    return {
      enrolmentId: enrolment.id,
      student: enrolment.student,
      course: enrolment.course,
      level,
      lesson,
      // What the teacher should do after this lesson, so the UI can offer "next".
      suggestedAdvance: lesson ? enrolment.currentLessonPosition + 1 : null,
      courseType: (
        await this.prisma.course.findUnique({
          where: { id: enrolment.course.id },
          select: { type: true },
        })
      )?.type as CourseType | undefined,
    };
  }

  async advanceLesson(input: {
    enrolmentId: string;
    position: number;
    actorUserId: string;
    actorRoles: string[];
  }) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        currentLevelId: true,
        teacher: { select: { userId: true } },
      },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');

    // FR-TCH-05 — only the enrolment's own teacher (or staff) may move the pointer;
    // otherwise any teacher could rewrite any child's plan.
    const isStaff = hasAnyRole(
      { userId: input.actorUserId, roles: input.actorRoles },
      STAFF_SCOPE_ROLES,
    );
    if (!isStaff && enrolment.teacher?.userId !== input.actorUserId) {
      throw AppError.forbidden('Only the teacher assigned to this enrolment can move its plan');
    }

    // The cap is the number of lessons in the *current level*, not the highest level
    // number in the course — capping at the level number truncated real progress.
    const lessonCount = enrolment.currentLevelId
      ? await this.prisma.lessonTemplate.count({ where: { levelId: enrolment.currentLevelId } })
      : 0;
    const target = Math.min(Math.max(1, input.position), Math.max(1, lessonCount));

    return this.prisma.enrolment.update({
      where: { id: input.enrolmentId },
      data: { currentLessonPosition: target },
      select: { id: true, currentLessonPosition: true },
    });
  }

  // ── Admin CRUD (FR-CRS-01) ─────────────────────────────────────────────────

  async createCourse(input: {
    code: string;
    name: string;
    type: CourseType;
    description: string;
    locale?: string;
  }) {
    const exists = await this.prisma.course.findUnique({
      where: { code: input.code },
      select: { id: true },
    });
    if (exists)
      throw new AppError(ErrorCode.CONFLICT, `Course code "${input.code}" is already in use`);

    return this.prisma.course.create({
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        description: input.description,
        locale: input.locale ?? 'en',
      },
      select: { id: true, code: true, name: true, type: true },
    });
  }

  async createLevel(input: {
    courseId: string;
    name: string;
    passMark?: number;
    rubric?: unknown;
  }) {
    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
      select: {
        id: true,
        levels: { orderBy: { position: 'desc' }, take: 1, select: { position: true } },
      },
    });
    if (!course) throw AppError.notFound('Course');

    return this.prisma.courseLevel.create({
      data: {
        courseId: input.courseId,
        name: input.name,
        position: (course.levels[0]?.position ?? 0) + 1,
        passMark: input.passMark ?? 70,
        rubric: (input.rubric as never) ?? undefined,
      },
      select: { id: true, name: true, position: true },
    });
  }

  async createLesson(input: {
    levelId: string;
    title: string;
    objectives?: unknown;
    materials?: unknown;
    teacherNotes?: string;
  }) {
    const level = await this.prisma.courseLevel.findUnique({
      where: { id: input.levelId },
      select: {
        id: true,
        lessonTemplates: { orderBy: { position: 'desc' }, take: 1, select: { position: true } },
      },
    });
    if (!level) throw AppError.notFound('Level');

    return this.prisma.lessonTemplate.create({
      data: {
        levelId: input.levelId,
        position: (level.lessonTemplates[0]?.position ?? 0) + 1,
        title: input.title,
        objectives: (input.objectives as never) ?? undefined,
        materials: (input.materials as never) ?? undefined,
        teacherNotes: input.teacherNotes ?? null,
      },
      select: { id: true, title: true, position: true },
    });
  }
}
