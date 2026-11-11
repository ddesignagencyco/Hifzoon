import { QaService } from './qa.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

function buildService(classTeacherUserId: string) {
  const prisma = {
    classSession: {
      findUnique: jest.fn(async () => ({
        id: 'class-1',
        teacherId: 'tp-1',
        teacher: { userId: classTeacherUserId },
      })),
    },
    qaRubric: { findUnique: jest.fn(async () => ({ criteria: { items: [] } })) },
    qaReview: { create: jest.fn(async () => ({ id: 'review-1' })) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new QaService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    {} as never,
  );
  return { service, prisma };
}

describe('QaService.submitReview', () => {
  it('refuses a reviewer grading a class they taught', async () => {
    const { service, prisma } = buildService('user-both');
    await expect(
      service.submitReview({
        classId: 'class-1',
        supervisorId: 'user-both',
        rubricId: 'r',
        scores: {},
      }),
    ).rejects.toThrow(/cannot review a class you taught/);
    expect(prisma.qaReview.create).not.toHaveBeenCalled();
  });

  it('lets a different supervisor review it', async () => {
    const { service, prisma } = buildService('user-teacher');
    await service.submitReview({
      classId: 'class-1',
      supervisorId: 'user-supervisor',
      rubricId: 'r',
      scores: {},
    });
    expect(prisma.qaReview.create).toHaveBeenCalled();
  });
});
