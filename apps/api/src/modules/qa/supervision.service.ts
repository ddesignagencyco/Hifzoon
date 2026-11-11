import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Supervisor caseloads (FR-QA). A supervisor oversees an explicit set of teachers; the
 * role alone no longer grants reach over every teacher. Admins maintain the set.
 */
@Injectable()
export class SupervisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The teachers a supervisor oversees, with enough to render a caseload. */
  async caseload(supervisorId: string) {
    const rows = await this.prisma.supervisorAssignment.findMany({
      where: { supervisorId },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        teacher: { select: { id: true, user: { select: { id: true, name: true } } } },
      },
    });
    return rows.map((r) => ({
      teacherId: r.teacher.id,
      teacherUserId: r.teacher.user.id,
      name: r.teacher.user.name,
      assignedAt: r.createdAt,
    }));
  }

  /** Idempotent: assigning an existing pair is a no-op. */
  async assign(supervisorId: string, teacherId: string, actorId: string) {
    await this.assertSupervisor(supervisorId);
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { id: true, userId: true },
    });
    if (!teacher) throw AppError.notFound('Teacher');
    if (teacher.userId === supervisorId) {
      throw AppError.badRequest('A supervisor cannot oversee themselves');
    }

    const existing = await this.prisma.supervisorAssignment.findUnique({
      where: { supervisorId_teacherId: { supervisorId, teacherId } },
      select: { id: true },
    });
    if (!existing) {
      await this.prisma.supervisorAssignment.create({
        data: { supervisorId, teacherId, createdById: actorId },
      });
      await this.audit.record({
        actorId,
        action: 'supervision.assign',
        targetType: 'supervisor_assignment',
        targetId: `${supervisorId}:${teacherId}`,
        after: { supervisorId, teacherId },
      });
    }
    return this.caseload(supervisorId);
  }

  async unassign(supervisorId: string, teacherId: string, actorId: string) {
    const { count } = await this.prisma.supervisorAssignment.deleteMany({
      where: { supervisorId, teacherId },
    });
    if (count > 0) {
      await this.audit.record({
        actorId,
        action: 'supervision.unassign',
        targetType: 'supervisor_assignment',
        targetId: `${supervisorId}:${teacherId}`,
        before: { supervisorId, teacherId },
      });
    }
    return this.caseload(supervisorId);
  }

  private async assertSupervisor(userId: string): Promise<void> {
    const isSupervisor = await this.prisma.userRole.count({
      where: { userId, role: 'SUPERVISOR' },
      take: 1,
    });
    if (isSupervisor === 0) throw AppError.badRequest('That user is not a supervisor');
  }
}
