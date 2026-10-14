import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../errors/app-error';

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
    if (hasAnyRole(subject, ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD'])) {
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
    if (hasAnyRole(subject, ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD'])) return;
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

  async teacherOwnsStudent(userId: string, studentId: string): Promise<boolean> {
    return (
      (await this.prisma.enrolment.count({
        where: {
          studentId,
          teacher: { userId },
          status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
        },
        take: 1,
      })) > 0
    );
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
}

export function hasAnyRole(subject: PolicySubject, roles: string[]): boolean {
  return roles.some((role) => subject.roles.includes(role));
}

function AppErrorNotOwner(): AppError {
  return new AppError('NOT_RESOURCE_OWNER', 'You do not have access to this record');
}
