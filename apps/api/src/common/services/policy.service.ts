import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../errors/app-error';

/** Non-teaching staff who see everything inside their remit (NFR-SEC-02). */
export const STAFF_SCOPE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD'];

export type PolicyAction =
  | 'student:read'
  | 'student:write'
  | 'family:read'
  | 'family:write'
  | 'class:read'
  | 'class:control'
  | 'lesson-card:write'
  | 'lesson-card:edit-locked'
  | 'billing:read'
  | 'case:read'
  | 'teacher:match'
  | 'audit:read';

export interface PolicySubject {
  userId: string;
  roles: string[];
}

/**
 * Ownership policies (NFR-SEC-02, CR-10).
 *
 * `RolesGuard` answers "may this role do this kind of thing"; this answers "may this
 * *person* touch this *record*". Keeping the two separate means a new endpoint cannot
 * accidentally expose a teacher's other students just by being behind a role guard.
 *
 * Rules:
 *   - staff roles see everything inside their remit (admin/super_admin/safeguarding)
 *   - a guardian sees only their own family's students
 *   - a teacher sees only students in enrolments assigned to them
 *   - a student sees only themselves
 */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertGuardianOwnsStudent(userId: string, studentId: string): Promise<void> {
    const owns = await this.prisma.student.count({
      where: { id: studentId, family: { members: { some: { userId } } } },
      take: 1,
    });
    if (owns === 0) throw AppErrorNotOwner();
  }

  /** CR-10 — a guardian may only act on a family they belong to. */
  async assertGuardianInFamily(userId: string, familyId: string): Promise<void> {
    const member = await this.prisma.familyMember.count({
      where: { userId, familyId },
      take: 1,
    });
    if (member === 0) throw AppErrorNotOwner();
  }

  async assertTeacherOwnsStudent(userId: string, studentId: string): Promise<void> {
    const owns = await this.prisma.enrolment.count({
      where: {
        studentId,
        teacher: { userId },
        status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
      },
      take: 1,
    });
    if (owns === 0) throw AppErrorNotOwner();
  }

  async canAccessStudent(subject: PolicySubject, studentId: string): Promise<boolean> {
    if (hasAnyRole(subject, STAFF_SCOPE_ROLES)) {
      return true;
    }
    if (subject.roles.includes('GUARDIAN')) {
      return this.guardianOwnsStudent(subject.userId, studentId);
    }
    if (subject.roles.includes('TEACHER')) {
      return this.teacherOwnsStudent(subject.userId, studentId);
    }
    if (subject.roles.includes('STUDENT') || subject.roles.includes('CHILD_STUDENT')) {
      return this.studentSelf(subject.userId, studentId);
    }
    return false;
  }

  /**
   * Throws unless the subject may act on the student. Accepts a single policy so the
   * intent is visible at the call site: guardian paths, teacher paths and read paths
   * have different failure modes worth naming separately.
   */
  async assertStudentAccess(
    subject: PolicySubject,
    studentId: string,
    via: 'guardian' | 'teacher' | 'self' = 'guardian',
  ): Promise<void> {
    if (hasAnyRole(subject, STAFF_SCOPE_ROLES)) return;
    if (!studentId) throw AppErrorNotOwner();

    if (
      subject.roles.includes('GUARDIAN') &&
      (await this.guardianOwnsStudent(subject.userId, studentId))
    ) {
      return;
    }
    if (
      subject.roles.includes('TEACHER') &&
      via !== 'self' &&
      (await this.teacherOwnsStudent(subject.userId, studentId))
    ) {
      return;
    }
    if (
      (subject.roles.includes('STUDENT') || subject.roles.includes('CHILD_STUDENT')) &&
      via === 'self' &&
      (await this.studentSelf(subject.userId, studentId))
    ) {
      return;
    }
    throw AppErrorNotOwner();
  }

  async guardianOwnsStudent(userId: string, studentId: string): Promise<boolean> {
    return (
      (await this.prisma.student.count({
        where: { id: studentId, family: { members: { some: { userId } } } },
        take: 1,
      })) > 0
    );
  }

  /**
 * Does this user teach this student?
   *
   * Two paths, both real. The enrolment is the durable one: a relationship a family holds
   * with a teacher. The class is the live one: a student who is *on a class this teacher
   * runs* is that teacher's student for the length of that class, even where the enrolment
   * row is missing or was created later on the parent side. Without the second path a
   * trial — the very first contact a family has with a teacher — left the teacher unable to
   * record a single mistake (B21).
   */
  async teacherOwnsStudent(userId: string, studentId: string): Promise<boolean> {
    const byEnrolment = await this.prisma.enrolment.count({
      where: {
        studentId,
        teacher: { userId },
        status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
      },
      take: 1,
    });
    if (byEnrolment > 0) return true;

    const byClass = await this.prisma.classStudent.count({
      where: { studentId, class: { teacher: { userId } } },
      take: 1,
    });
    return byClass > 0;
  }

  async studentSelf(userId: string, studentId: string): Promise<boolean> {
    return (await this.prisma.student.count({ where: { id: studentId, userId }, take: 1 })) > 0;
  }

  /** FR-TCH-02 — only cleared teachers can be matched to a student. */
  async assertTeacherMatchable(teacherId: string): Promise<void> {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { readyToMatch: true, hiringStatus: true },
    });
    if (!profile || !profile.readyToMatch || profile.hiringStatus !== 'APPROVED') {
      throw new AppError(
        'FORBIDDEN',
        'FR-TCH-02: teacher has not completed the hiring pipeline and safeguarding training',
        { teacherId },
      );
    }
  }

  /**
   * NFR-SEC-02, class-scoped edition — a class is another ownership axis besides the
   * student: `ClassSession.teacherId` points at the TeacherProfile who owns the room,
   * so "is a teacher" is not the same question as "may this teacher run *this* class".
   *
   * Control = move the page, change the layout, close attendance, start a recording.
   * Staff only, or the session's own teacher.
   */
  async assertClassControl(subject: PolicySubject, classId: string): Promise<void> {
    if (hasAnyRole(subject, STAFF_SCOPE_ROLES)) return;
    if (!classId) throw AppErrorNotOwner();
    const owned = await this.prisma.classSession.count({
      where: { id: classId, teacher: { userId: subject.userId } },
      take: 1,
    });
    if (owned === 0) throw AppErrorNotOwner();
  }

  /**
   * Read side of the same axis: staff, the class's teacher, a participant who was in
   * the room, or a family/self connection to one of the class's students. Roles alone
   * cannot answer this — a guardian's `GUARDIAN` role covers every class they are
   * attached to, so the check must go through `ClassStudent`.
   */
  async assertClassRead(subject: PolicySubject, classId: string): Promise<void> {
    if (hasAnyRole(subject, STAFF_SCOPE_ROLES)) return;
    if (!classId) throw AppErrorNotOwner();

    const teaching = await this.prisma.classSession.count({
      where: { id: classId, teacher: { userId: subject.userId } },
      take: 1,
    });
    if (teaching > 0) return;

    const present = await this.prisma.classParticipant.count({
      where: { classId, userId: subject.userId },
      take: 1,
    });
    if (present > 0) return;

    const connected = await this.prisma.classStudent.count({
      where: {
        classId,
        student: {
          OR: [
            { userId: subject.userId },
            { family: { members: { some: { userId: subject.userId } } } },
          ],
        },
      },
      take: 1,
    });
    if (connected === 0) throw AppErrorNotOwner();
  }
}

export function hasAnyRole(subject: PolicySubject, roles: string[]): boolean {
  return roles.some((role) => subject.roles.includes(role));
}

function AppErrorNotOwner(): AppError {
  return new AppError('NOT_RESOURCE_OWNER', 'You do not have access to this record');
}
