import { CoursesService } from './courses.service';

function build(lessonCount: number) {
  const prisma = {
    enrolment: {
      findUnique: jest.fn(async () => ({
        id: 'enr-1',
        currentLevelId: 'level-1',
        teacher: { userId: 'teacher-1' },
      })),
      update: jest.fn(async ({ data }: { data: { currentLessonPosition: number } }) => ({
        id: 'enr-1',
        currentLessonPosition: data.currentLessonPosition,
      })),
    },
    lessonTemplate: { count: jest.fn(async () => lessonCount) },
  };
  return { service: new CoursesService(prisma as never, {} as never, {} as never), prisma };
}

const ACTOR = { enrolmentId: 'enr-1', actorUserId: 'teacher-1', actorRoles: ['TEACHER'] };

describe('CoursesService.advanceLesson level end', () => {
  it('suggests an assessment on the last lesson of the level and stays on the level', async () => {
    const { service, prisma } = build(10);

    const result = await service.advanceLesson({ ...ACTOR, position: 14 });

    expect(result).toMatchObject({ currentLessonPosition: 10, suggestAssessment: true });
    expect(prisma.enrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentLessonPosition: 10 } }),
    );
  });

  it('does not suggest one mid-level', async () => {
    const { service } = build(10);

    await expect(service.advanceLesson({ ...ACTOR, position: 4 })).resolves.toMatchObject({
      currentLessonPosition: 4,
      suggestAssessment: false,
    });
  });
});

describe('CoursesService.advanceLesson level override', () => {
  const LEVEL_2 = '0190a000-0000-7000-8000-000000000002';
  function withLevels(courseId: string) {
    const built = build(5);
    (built.prisma.enrolment.findUnique as jest.Mock).mockResolvedValue({
      id: 'enr-1',
      courseId: 'course-1',
      currentLevelId: 'level-1',
      teacher: { userId: 'teacher-1' },
    });
    Object.assign(built.prisma, {
      courseLevel: { findUnique: jest.fn(async () => ({ id: LEVEL_2, courseId })) },
    });
    return built;
  }

  it('lets staff move the student to another level of the same course', async () => {
    const { service, prisma } = withLevels('course-1');
    await service.advanceLesson({
      enrolmentId: 'enr-1',
      position: 2,
      levelId: LEVEL_2,
      actorUserId: 'admin-1',
      actorRoles: ['ADMIN'],
    });
    expect(prisma.enrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentLessonPosition: 2, currentLevelId: LEVEL_2 } }),
    );
  });

  it('refuses a level from another course, and refuses teachers', async () => {
    await expect(
      withLevels('other-course').service.advanceLesson({
        enrolmentId: 'enr-1',
        position: 1,
        levelId: LEVEL_2,
        actorUserId: 'admin-1',
        actorRoles: ['ADMIN'],
      }),
    ).rejects.toThrow('not part of this course');
    await expect(
      withLevels('course-1').service.advanceLesson({ ...ACTOR, position: 1, levelId: LEVEL_2 }),
    ).rejects.toThrow('Only staff');
  });
});
