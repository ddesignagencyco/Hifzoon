import { filesOf } from './course-materials.service';
import { Injectable } from '@nestjs/common';
import { EnrolmentStatus, ErrorCode } from '@hifzoon/shared';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { validateMaterials, validateObjectives } from './courses.service';

/** Enrolments that still use their lesson pointer: a lesson they point at cannot be deleted. */
const LIVE_ENROLMENTS: EnrolmentStatus[] = [
  EnrolmentStatus.TRIAL,
  EnrolmentStatus.ACTIVE,
  EnrolmentStatus.PAUSED,
];

/**
 * Parks a row while two rows swap positions. `@@unique([levelId, position])` and
 * `@@unique([courseId, position])` are checked per statement, so a direct swap would collide.
 */
const PARKED_POSITION = -1;

export type MoveDirection = 'up' | 'down';

/**
 * Editing the curriculum after it exists (FR-CRS-01): rename, reorder and delete lessons,
 * rename and reorder levels. Creating them stays in CoursesService.
 *
 * An enrolment points at a lesson by `(currentLevelId, currentLessonPosition)`, not by id,
 * so every change that moves positions moves those pointers with it in the same transaction:
 * the student keeps the lesson they were on, not whatever lesson lands in its old slot.
 */
@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The course as the admin builder edits it: lessons with teacher notes (the public
   * `GET /courses/:id` leaves those out) and how many live enrolments sit on each lesson.
   */
  async adminCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
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
                files: true,
                teacherNotes: true,
              },
            },
          },
        },
      },
    });
    if (!course) throw AppError.notFound('Course');

    const pointers = await this.prisma.enrolment.groupBy({
      by: ['currentLevelId', 'currentLessonPosition'],
      where: { courseId, status: { in: LIVE_ENROLMENTS }, currentLevelId: { not: null } },
      _count: { _all: true },
    });
    const countAt = (levelId: string, position: number) =>
      pointers.find((p) => p.currentLevelId === levelId && p.currentLessonPosition === position)
        ?._count._all ?? 0;

    return {
      ...course,
      levels: course.levels.map((level) => ({
        ...level,
        enrolmentCount: pointers
          .filter((p) => p.currentLevelId === level.id)
          .reduce((sum, p) => sum + p._count._all, 0),
        lessonTemplates: level.lessonTemplates.map((lesson) => ({
          ...lesson,
          // File names and sizes only; the storage key never leaves the server.
          files: filesOf(lesson.files).map(({ key: _key, ...file }) => file),
          enrolmentCount: countAt(level.id, lesson.position),
        })),
      })),
    };
  }

  // ── Levels ─────────────────────────────────────────────────────────────────

  async updateLevel(input: {
    levelId: string;
    name?: string;
    passMark?: number;
    actorUserId: string;
  }) {
    const before = await this.prisma.courseLevel.findUnique({
      where: { id: input.levelId },
      select: { id: true, name: true, passMark: true },
    });
    if (!before) throw AppError.notFound('Level');
    const name = input.name?.trim();
    if (input.name !== undefined && (!name || name.length < 2 || name.length > 160)) {
      throw AppError.badRequest('A level name has 2 to 160 characters');
    }

    const after = await this.prisma.courseLevel.update({
      where: { id: input.levelId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.passMark !== undefined ? { passMark: input.passMark } : {}),
      },
      select: { id: true, name: true, position: true, passMark: true },
    });
    const diff = AuditService.diff(before, {
      id: after.id,
      name: after.name,
      passMark: after.passMark,
    });
    await this.audit.record({
      actorId: input.actorUserId,
      action: 'crs.level.update',
      targetType: 'course_level',
      targetId: after.id,
      ...diff,
    });
    return after;
  }

  async moveLevel(input: { levelId: string; direction: MoveDirection; actorUserId: string }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const level = await tx.courseLevel.findUnique({
        where: { id: input.levelId },
        select: { id: true, courseId: true, position: true },
      });
      if (!level) throw AppError.notFound('Level');
      const up = input.direction === 'up';
      const neighbour = await tx.courseLevel.findFirst({
        where: {
          courseId: level.courseId,
          position: up ? { lt: level.position } : { gt: level.position },
        },
        orderBy: { position: up ? 'desc' : 'asc' },
        select: { id: true, position: true },
      });
      if (!neighbour) {
        throw AppError.badRequest(
          up ? 'This is already the first level' : 'This is already the last level',
        );
      }
      await tx.courseLevel.update({ where: { id: level.id }, data: { position: PARKED_POSITION } });
      await tx.courseLevel.update({
        where: { id: neighbour.id },
        data: { position: level.position },
      });
      await tx.courseLevel.update({
        where: { id: level.id },
        data: { position: neighbour.position },
      });
      // Enrolments hold the level by id, so they stay on their level wherever it moves.
      return {
        id: level.id,
        from: level.position,
        position: neighbour.position,
        swappedWith: neighbour.id,
      };
    });

    await this.audit.record({
      actorId: input.actorUserId,
      action: 'crs.level.move',
      targetType: 'course_level',
      targetId: result.id,
      before: { position: result.from },
      after: { position: result.position, swappedWith: result.swappedWith },
    });
    return { id: result.id, position: result.position };
  }

  // ── Lessons ────────────────────────────────────────────────────────────────

  async updateLesson(input: {
    lessonId: string;
    title?: string;
    objectives?: unknown;
    materials?: unknown;
    teacherNotes?: string | null;
    actorUserId: string;
  }) {
    const before = await this.prisma.lessonTemplate.findUnique({
      where: { id: input.lessonId },
      select: { id: true, title: true, objectives: true, materials: true, teacherNotes: true },
    });
    if (!before) throw AppError.notFound('Lesson');

    const title = input.title?.trim();
    if (input.title !== undefined && (!title || title.length < 2 || title.length > 200)) {
      throw AppError.badRequest('A lesson title has 2 to 200 characters');
    }
    // An empty list or empty object clears the field rather than storing `[]` / `{}`.
    const objectives =
      input.objectives === undefined ? undefined : validateObjectives(input.objectives);
    const materials =
      input.materials === undefined ? undefined : validateMaterials(input.materials);
    const teacherNotes =
      input.teacherNotes === undefined ? undefined : input.teacherNotes?.trim() || null;
    if (teacherNotes && teacherNotes.length > 5000) {
      throw AppError.badRequest('Teacher notes are at most 5000 characters');
    }

    const after = await this.prisma.lessonTemplate.update({
      where: { id: input.lessonId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(objectives !== undefined
          ? { objectives: objectives.length ? objectives : Prisma.DbNull }
          : {}),
        ...(materials !== undefined
          ? { materials: Object.keys(materials).length ? materials : Prisma.DbNull }
          : {}),
        ...(teacherNotes !== undefined ? { teacherNotes } : {}),
      },
      select: {
        id: true,
        levelId: true,
        title: true,
        position: true,
        objectives: true,
        materials: true,
        teacherNotes: true,
      },
    });
    const diff = AuditService.diff(before, {
      id: after.id,
      title: after.title,
      objectives: after.objectives,
      materials: after.materials,
      teacherNotes: after.teacherNotes,
    });
    await this.audit.record({
      actorId: input.actorUserId,
      action: 'crs.lesson.update',
      targetType: 'lesson_template',
      targetId: after.id,
      ...diff,
    });
    return after;
  }

  async moveLesson(input: { lessonId: string; direction: MoveDirection; actorUserId: string }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const lesson = await tx.lessonTemplate.findUnique({
        where: { id: input.lessonId },
        select: { id: true, levelId: true, position: true },
      });
      if (!lesson) throw AppError.notFound('Lesson');
      const up = input.direction === 'up';
      const neighbour = await tx.lessonTemplate.findFirst({
        where: {
          levelId: lesson.levelId,
          position: up ? { lt: lesson.position } : { gt: lesson.position },
        },
        orderBy: { position: up ? 'desc' : 'asc' },
        select: { id: true, position: true },
      });
      if (!neighbour) {
        throw AppError.badRequest(
          up ? 'This is already the first lesson' : 'This is already the last lesson',
        );
      }
      const [p, q] = [lesson.position, neighbour.position];
      await tx.lessonTemplate.update({
        where: { id: lesson.id },
        data: { position: PARKED_POSITION },
      });
      await tx.lessonTemplate.update({ where: { id: neighbour.id }, data: { position: p } });
      await tx.lessonTemplate.update({ where: { id: lesson.id }, data: { position: q } });

      // The pointers follow their lessons: whoever was on this lesson is still on it.
      const onLesson = await tx.enrolment.findMany({
        where: { currentLevelId: lesson.levelId, currentLessonPosition: p },
        select: { id: true },
      });
      await tx.enrolment.updateMany({
        where: { currentLevelId: lesson.levelId, currentLessonPosition: q },
        data: { currentLessonPosition: p },
      });
      if (onLesson.length) {
        await tx.enrolment.updateMany({
          where: { id: { in: onLesson.map((e) => e.id) } },
          data: { currentLessonPosition: q },
        });
      }
      return { id: lesson.id, from: p, position: q, swappedWith: neighbour.id };
    });

    await this.audit.record({
      actorId: input.actorUserId,
      action: 'crs.lesson.move',
      targetType: 'lesson_template',
      targetId: result.id,
      before: { position: result.from },
      after: { position: result.position, swappedWith: result.swappedWith },
    });
    return { id: result.id, position: result.position };
  }

  /**
   * Deletes a lesson and closes the gap, so positions stay 1..n (the lesson pointer is capped
   * at the lesson count). Refused while a live enrolment is on the lesson: deleting it would
   * silently move that student on to a lesson nobody chose.
   */
  async deleteLesson(input: { lessonId: string; actorUserId: string }) {
    const lesson = await this.prisma.lessonTemplate.findUnique({
      where: { id: input.lessonId },
      select: { id: true, levelId: true, position: true, title: true },
    });
    if (!lesson) throw AppError.notFound('Lesson');

    const onLesson = await this.prisma.enrolment.count({
      where: {
        currentLevelId: lesson.levelId,
        currentLessonPosition: lesson.position,
        status: { in: LIVE_ENROLMENTS },
      },
    });
    if (onLesson > 0) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        `${onLesson} enrolment${onLesson === 1 ? ' is' : 's are'} on this lesson. Move ${
          onLesson === 1 ? 'it' : 'them'
        } to another lesson first.`,
        { enrolments: onLesson },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonTemplate.delete({ where: { id: lesson.id } });
      // Ascending order: each slot is free by the time the next lesson moves into it.
      const after = await tx.lessonTemplate.findMany({
        where: { levelId: lesson.levelId, position: { gt: lesson.position } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      for (const row of after) {
        await tx.lessonTemplate.update({
          where: { id: row.id },
          data: { position: row.position - 1 },
        });
      }
      await tx.enrolment.updateMany({
        where: { currentLevelId: lesson.levelId, currentLessonPosition: { gt: lesson.position } },
        data: { currentLessonPosition: { decrement: 1 } },
      });
    });

    await this.audit.record({
      actorId: input.actorUserId,
      action: 'crs.lesson.delete',
      targetType: 'lesson_template',
      targetId: lesson.id,
      before: { levelId: lesson.levelId, position: lesson.position, title: lesson.title },
    });
    return { id: lesson.id, deleted: true };
  }
}
