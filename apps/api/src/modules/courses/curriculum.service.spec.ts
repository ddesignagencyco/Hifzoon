import { Role } from '@hifzoon/shared';

import { ROLES_KEY } from '../../common/decorators';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';

type Lesson = { id: string; levelId: string; position: number; title: string };

/** A tiny in-memory lesson table that enforces @@unique([levelId, position]) like Postgres. */
function build(
  lessons: Lesson[],
  enrolments: Array<{
    id: string;
    currentLevelId: string;
    currentLessonPosition: number;
    status?: string;
  }>,
) {
  const rows = lessons.map((l) => ({ ...l }));
  const enr = enrolments.map((e) => ({ status: 'ACTIVE', ...e }));
  const assertUnique = () => {
    const keys = rows.map((r) => `${r.levelId}:${r.position}`);
    if (new Set(keys).size !== keys.length) throw new Error('unique violation');
  };
  const matchPos = (pos: unknown, p: number) => {
    if (typeof pos === 'number') return p === pos;
    const op = pos as { lt?: number; gt?: number } | undefined;
    if (!op) return true;
    if (op.lt !== undefined) return p < op.lt;
    if (op.gt !== undefined) return p > op.gt;
    return true;
  };
  const lessonTemplate = {
    findUnique: jest.fn(
      async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
    ),
    findFirst: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { levelId: string; position: unknown };
        orderBy: { position: 'asc' | 'desc' };
      }) => {
        const found = rows
          .filter((r) => r.levelId === where.levelId && matchPos(where.position, r.position))
          .sort((a, b) =>
            orderBy.position === 'asc' ? a.position - b.position : b.position - a.position,
          );
        return found[0] ?? null;
      },
    ),
    findMany: jest.fn(async ({ where }: { where: { levelId: string; position: unknown } }) =>
      rows
        .filter((r) => r.levelId === where.levelId && matchPos(where.position, r.position))
        .sort((a, b) => a.position - b.position),
    ),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: { position: number } }) => {
        const row = rows.find((r) => r.id === where.id)!;
        row.position = data.position;
        assertUnique();
        return row;
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      rows.splice(
        rows.findIndex((r) => r.id === where.id),
        1,
      );
    }),
  };
  const enrolment = {
    count: jest.fn(
      async ({ where }: { where: { currentLevelId: string; currentLessonPosition: number } }) =>
        enr.filter(
          (e) =>
            e.currentLevelId === where.currentLevelId &&
            e.currentLessonPosition === where.currentLessonPosition &&
            ['TRIAL', 'ACTIVE', 'PAUSED'].includes(e.status),
        ).length,
    ),
    findMany: jest.fn(
      async ({ where }: { where: { currentLevelId: string; currentLessonPosition: number } }) =>
        enr.filter(
          (e) =>
            e.currentLevelId === where.currentLevelId &&
            e.currentLessonPosition === where.currentLessonPosition,
        ),
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: { in: string[] }; currentLevelId?: string; currentLessonPosition?: unknown };
        data: { currentLessonPosition: number | { decrement: number } };
      }) => {
        const hit = enr.filter((e) =>
          where.id
            ? where.id.in.includes(e.id)
            : e.currentLevelId === where.currentLevelId &&
              matchPos(where.currentLessonPosition, e.currentLessonPosition),
        );
        for (const e of hit) {
          e.currentLessonPosition =
            typeof data.currentLessonPosition === 'number'
              ? data.currentLessonPosition
              : e.currentLessonPosition - data.currentLessonPosition.decrement;
        }
        return { count: hit.length };
      },
    ),
  };
  const prisma = {
    lessonTemplate,
    enrolment,
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ lessonTemplate, enrolment }),
    ),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new CurriculumService(prisma as never, audit as never);
  return { service, rows, enr, audit };
}

const LESSONS: Lesson[] = [
  { id: 'a', levelId: 'L', position: 1, title: 'A' },
  { id: 'b', levelId: 'L', position: 2, title: 'B' },
  { id: 'c', levelId: 'L', position: 3, title: 'C' },
];
const order = (rows: Lesson[]) =>
  [...rows].sort((x, y) => x.position - y.position).map((r) => r.id);

describe('CurriculumService.moveLesson', () => {
  it('swaps with the neighbour without breaking the unique position, and the student keeps their lesson', async () => {
    const { service, rows, enr, audit } = build(LESSONS, [
      { id: 'e1', currentLevelId: 'L', currentLessonPosition: 2 },
    ]);

    await service.moveLesson({ lessonId: 'b', direction: 'up', actorUserId: 'admin' });

    expect(order(rows)).toEqual(['b', 'a', 'c']);
    // e1 was on B (position 2); B is now position 1.
    expect(enr[0].currentLessonPosition).toBe(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crs.lesson.move', targetId: 'b' }),
    );
  });

  it('refuses to move the first lesson up', async () => {
    const { service } = build(LESSONS, []);
    await expect(
      service.moveLesson({ lessonId: 'a', direction: 'up', actorUserId: 'admin' }),
    ).rejects.toThrow('already the first lesson');
  });
});

describe('CurriculumService.deleteLesson', () => {
  it('refuses while a live enrolment is on the lesson', async () => {
    const { service, rows } = build(LESSONS, [
      { id: 'e1', currentLevelId: 'L', currentLessonPosition: 2 },
    ]);
    await expect(service.deleteLesson({ lessonId: 'b', actorUserId: 'admin' })).rejects.toThrow(
      'on this lesson',
    );
    expect(rows).toHaveLength(3);
  });

  it('closes the gap and moves later pointers with their lessons', async () => {
    const { service, rows, enr, audit } = build(LESSONS, [
      { id: 'e1', currentLevelId: 'L', currentLessonPosition: 3 },
      { id: 'old', currentLevelId: 'L', currentLessonPosition: 2, status: 'CANCELLED' },
    ]);

    await service.deleteLesson({ lessonId: 'b', actorUserId: 'admin' });

    expect(rows.map((r) => [r.id, r.position])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
    expect(enr.find((e) => e.id === 'e1')!.currentLessonPosition).toBe(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crs.lesson.delete', targetId: 'b' }),
    );
  });
});

describe('CurriculumController roles', () => {
  it.each([
    'adminCourse',
    'updateLevel',
    'moveLevel',
    'updateLesson',
    'moveLesson',
    'deleteLesson',
  ] as const)('%s is for ADMIN and SUPER_ADMIN only', (method) => {
    const roles = Reflect.getMetadata(ROLES_KEY, CurriculumController.prototype[method]) as Role[];
    expect([...roles].sort()).toEqual([Role.ADMIN, Role.SUPER_ADMIN].sort());
  });
});
