import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Enrolments that still depend on the course being available. */
const LIVE_ENROLMENTS = ['TRIAL', 'ACTIVE', 'PAUSED'] as const;

/**
 * Editing, switching off and archiving a course after it was created (FR-CRS-01).
 *
 * Three levels of "gone", from reversible to least:
 *   - **deactivate**: hidden from the public catalogue and from new enrolments; children
 *     already on it carry on. Switch back on any time.
 *   - **archive**: removed from every list. Refused while any child is on it, because those
 *     children would lose their lessons. Restoring brings it back (switched off).
 *   - nothing here deletes a course: classes, assessments and certificates reference it.
 */
@Injectable()
export class CourseAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every course for the builder, including switched-off and (optionally) archived ones. */
  async list(opts: { includeArchived?: boolean } = {}) {
    const courses = await this.prisma.course.findMany({
      where: opts.includeArchived ? {} : { deletedAt: null },
      orderBy: [
        { deletedAt: { sort: 'asc', nulls: 'first' } },
        { active: 'desc' },
        { code: 'asc' },
      ],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        locale: true,
        active: true,
        deletedAt: true,
        _count: { select: { levels: true, enrolments: true } },
      },
    });
    const live = await this.prisma.enrolment.groupBy({
      by: ['courseId'],
      where: { courseId: { in: courses.map((c) => c.id) }, status: { in: [...LIVE_ENROLMENTS] } },
      _count: { _all: true },
    });
    const liveBy = new Map(live.map((l) => [l.courseId, l._count._all]));
    return courses.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      locale: c.locale,
      active: c.active,
      archived: c.deletedAt !== null,
      levels: c._count.levels,
      enrolments: c._count.enrolments,
      liveEnrolments: liveBy.get(c.id) ?? 0,
    }));
  }

  /** Name, description and language. The code and type are fixed: other records point at them. */
  async update(
    id: string,
    patch: { name?: string; description?: string; locale?: string },
    actorId: string,
  ) {
    const course = await this.load(id);
    if (course.deletedAt)
      throw AppError.conflict('CONFLICT', 'Restore the course before editing it');
    if (patch.name !== undefined && patch.name.trim().length < 2) {
      throw AppError.badRequest('A course needs a name', { field: 'name' });
    }
    if (patch.description !== undefined && patch.description.trim().length < 1) {
      throw AppError.badRequest('A course needs a description', { field: 'description' });
    }
    const data = {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
    };
    const updated = await this.prisma.course.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'crs.course.update',
      targetType: 'course',
      targetId: id,
      before: { name: course.name, locale: course.locale },
      after: {
        name: data.name,
        locale: data.locale,
        descriptionChanged: data.description !== undefined,
      },
    });
    return updated;
  }

  async setActive(id: string, active: boolean, actorId: string) {
    const course = await this.load(id);
    if (course.deletedAt) throw AppError.conflict('CONFLICT', 'Restore the course first');
    if (course.active === active) return course;
    const updated = await this.prisma.course.update({ where: { id }, data: { active } });
    await this.audit.record({
      actorId,
      action: active ? 'crs.course.activate' : 'crs.course.deactivate',
      targetType: 'course',
      targetId: id,
      before: { active: course.active },
      after: { active },
    });
    return updated;
  }

  async archive(id: string, actorId: string) {
    const course = await this.load(id);
    if (course.deletedAt) throw AppError.conflict('CONFLICT', 'This course is already archived');
    const live = await this.prisma.enrolment.count({
      where: { courseId: id, status: { in: [...LIVE_ENROLMENTS] } },
    });
    if (live > 0) {
      throw AppError.conflict(
        'CONFLICT',
        `${live} child(ren) are still enrolled; switch the course off instead, or move them first`,
        { liveEnrolments: live },
      );
    }
    const updated = await this.prisma.course.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.record({
      actorId,
      action: 'crs.course.archive',
      targetType: 'course',
      targetId: id,
      before: { active: course.active },
    });
    return updated;
  }

  /** Brings an archived course back, switched off; turn it on when it is ready. */
  async restore(id: string, actorId: string) {
    const course = await this.load(id);
    if (!course.deletedAt) throw AppError.conflict('CONFLICT', 'This course is not archived');
    const updated = await this.prisma.course.update({
      where: { id },
      data: { deletedAt: null, active: false },
    });
    await this.audit.record({
      actorId,
      action: 'crs.course.restore',
      targetType: 'course',
      targetId: id,
    });
    return updated;
  }

  private async load(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw AppError.notFound('Course');
    return course;
  }
}
