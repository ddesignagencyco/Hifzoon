import { ErrorCode } from '@hifzoon/shared';

import { AdmissionsService } from './admissions.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PolicyService } from '../../common/services/policy.service';
import type { AuditService } from '../audit/audit.service';
import type { SettingsService } from '../settings/settings.service';

interface SessionOptions {
  type?: string;
  status?: string;
  startsAt?: Date;
  students?: Array<{ studentId: string; enrolmentId: string | null }>;
  courseId?: string;
}

function buildHarness(session: SessionOptions = {}) {
  const row = {
    id: 'class-1',
    type: session.type ?? 'TRIAL',
    status: session.status ?? 'SCHEDULED',
    courseId: session.courseId ?? 'course-1',
    startsAt: session.startsAt ?? new Date(Date.now() - 3_600_000),
    students: session.students ?? [{ studentId: 'student-1', enrolmentId: 'enrolment-1' }],
  };

  const state = { enrolmentUpdates: [] as unknown[] };

  const prisma = {
    classSession: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
    },
    trialOutcome: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'outcome-1',
        ...data,
      })),
    },
    enrolment: {
      updateMany: jest.fn(async ({ where, data }: { where: unknown; data: unknown }) => {
        state.enrolmentUpdates.push({ where, data });
        return { count: 1 };
      }),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  } as unknown as PrismaService;

  const service = new AdmissionsService(
    prisma,
    {} as unknown as PolicyService,
    { record: jest.fn(async () => undefined) } as unknown as AuditService,
    {} as unknown as SettingsService,
  );

  return { service, state, prisma };
}

const OUTCOME = { classId: 'class-1', won: true, actorId: 'staff-1' };

describe('AdmissionsService.completeTrialOutcome (B24)', () => {
  it('records an outcome for a trial that has already happened', async () => {
    const { service } = buildHarness();

    await expect(service.completeTrialOutcome(OUTCOME)).resolves.toMatchObject({
      alreadyRecorded: false,
    });
  });

  it('refuses an outcome for a trial that has not started yet', async () => {
    const { service, prisma } = buildHarness({ startsAt: new Date(Date.now() + 86_400_000) });

    await expect(service.completeTrialOutcome(OUTCOME)).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
    expect(prisma.trialOutcome.create).not.toHaveBeenCalled();
  });

  it('refuses an outcome for a cancelled trial', async () => {
    const { service, prisma } = buildHarness({ status: 'CANCELLED_FAMILY' });

    await expect(service.completeTrialOutcome(OUTCOME)).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
    expect(prisma.trialOutcome.create).not.toHaveBeenCalled();
  });

  it('touches only the enrolments linked to this class, not the student’s other trials', async () => {
    const { service, state } = buildHarness();

    await service.completeTrialOutcome(OUTCOME);

    expect(state.enrolmentUpdates).toHaveLength(1);
    expect(state.enrolmentUpdates[0]).toMatchObject({
      where: { id: { in: ['enrolment-1'] }, status: 'TRIAL' },
      data: { status: 'ACTIVE' },
    });
  });

  it('falls back to the class’s course when the session predates linked enrolments', async () => {
    const { service, state } = buildHarness({
      students: [{ studentId: 'student-1', enrolmentId: null }],
    });

    await service.completeTrialOutcome({ ...OUTCOME, won: false });

    expect(state.enrolmentUpdates[0]).toMatchObject({
      where: {
        studentId: { in: ['student-1'] },
        courseId: 'course-1',
        status: 'TRIAL',
      },
      data: { status: 'CANCELLED' },
    });
  });
});
