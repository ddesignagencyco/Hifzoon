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
      findFirst: jest.fn(async () => null),
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

interface TrialClassRow {
  id: string;
  startsAt: Date;
  status: string;
}

/** Harness for `bookTrial` — a separate shape from the outcome harness above. */
function buildBookingHarness(
  options: {
    existingTrial?: { id: string; teacherId: string | null; classes: TrialClassRow[] } | null;
    /** A live (ACTIVE/PAUSED) enrolment the student already has in the course. */
    enrolled?: { id: string } | null;
  } = {},
) {
  const state = {
    enrolmentCreates: [] as unknown[],
    classSessionCreates: [] as unknown[],
  };

  const student = {
    id: 'student-1',
    displayName: 'Student One',
    language: 'en',
    gender: 'MALE',
    familyId: 'family-1',
  };
  const course = { id: 'course-1', code: 'QURAN', active: true };

  const prisma = {
    student: { findUnique: jest.fn(async () => student) },
    course: { findUnique: jest.fn(async () => course) },
    enrolment: {
      findFirst: jest.fn(async (args: { where?: { status?: unknown } }) =>
        // The "already enrolled" check asks for ACTIVE/PAUSED; only the TRIAL lookup finds the package.
        args?.where?.status === 'TRIAL'
          ? (options.existingTrial ?? null)
          : (options.enrolled ?? null),
      ),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        state.enrolmentCreates.push(args.data);
        return { id: 'enrolment-new', teacherId: args.data.teacherId };
      }),
    },
    classSession: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        state.classSessionCreates.push(args.data);
        return { id: `class-${state.classSessionCreates.length}`, ...args.data };
      }),
    },
    classStudent: { create: jest.fn(async () => ({})) },
    teacherProfile: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  } as unknown as PrismaService;

  const settings = {
    getBoolean: jest.fn(async () => true),
    getNumber: jest.fn(async () => 30),
  } as unknown as SettingsService;

  const service = new AdmissionsService(
    prisma,
    {} as unknown as PolicyService,
    { record: jest.fn(async () => undefined) } as unknown as AuditService,
    settings,
  );

  return { service, state, prisma };
}

/**
 * The Monday of *next* ISO week at 9am local time — always in the future (so it never
 * trips `bookTrial`'s "cannot start in the past" guard), and a fixed anchor so every
 * date derived from it via `dayPlus` below stays inside that one calendar week, which
 * is all the weekly-cap tests actually need.
 */
function thisWeekMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diffToNextMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToNextMonday);
  monday.setHours(9, 0, 0, 0);
  return monday;
}

describe('AdmissionsService.bookTrial (FR-ADM-03 — 3x30min/week)', () => {
  const BASE = {
    studentId: 'student-1',
    courseId: 'course-1',
    actorId: 'staff-1',
    teacherId: 'teacher-1',
  };

  it('books the 1st trial session of the week by creating a new TRIAL enrolment', async () => {
    const { service, state } = buildBookingHarness();

    await service.bookTrial({ ...BASE, startsAt: thisWeekMonday() });

    expect(state.enrolmentCreates).toHaveLength(1);
    expect(state.enrolmentCreates[0]).toMatchObject({ status: 'TRIAL' });
  });

  it('refuses a trial for a child already enrolled in the course, so no second enrolment is made', async () => {
    const { service, state } = buildBookingHarness({ enrolled: { id: 'enrolment-live' } });

    await expect(service.bookTrial({ ...BASE, startsAt: thisWeekMonday() })).rejects.toMatchObject({
      message: expect.stringMatching(/already enrolled/),
    });
    expect(state.enrolmentCreates).toHaveLength(0);
    expect(state.classSessionCreates).toHaveLength(0);
  });

  it('books a 2nd and 3rd session in the same week onto the existing enrolment, not a new one', async () => {
    const monday = thisWeekMonday();
    const existingTrial = {
      id: 'enrolment-1',
      teacherId: 'teacher-1',
      classes: [{ class: { id: 'class-1', startsAt: monday, status: 'COMPLETED' } }],
    } as unknown as { id: string; teacherId: string | null; classes: TrialClassRow[] };
    const { service, state } = buildBookingHarness({ existingTrial });

    const secondDay = new Date(monday.getTime() + 24 * 60 * 60 * 1000);
    await service.bookTrial({ ...BASE, startsAt: secondDay });

    expect(state.enrolmentCreates).toHaveLength(0);
  });

  it('rejects a 4th trial booking in the same week', async () => {
    const monday = thisWeekMonday();
    const dayPlus = (n: number) => new Date(monday.getTime() + n * 24 * 60 * 60 * 1000);
    const existingTrial = {
      id: 'enrolment-1',
      teacherId: 'teacher-1',
      classes: [
        { class: { id: 'class-1', startsAt: dayPlus(0), status: 'COMPLETED' } },
        { class: { id: 'class-2', startsAt: dayPlus(1), status: 'COMPLETED' } },
        { class: { id: 'class-3', startsAt: dayPlus(2), status: 'SCHEDULED' } },
      ],
    } as unknown as { id: string; teacherId: string | null; classes: TrialClassRow[] };
    const { service, state } = buildBookingHarness({ existingTrial });

    await expect(service.bookTrial({ ...BASE, startsAt: dayPlus(3) })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(state.classSessionCreates).toHaveLength(0);
  });

  it('does not count a cancelled session in the same week against the cap', async () => {
    const monday = thisWeekMonday();
    const dayPlus = (n: number) => new Date(monday.getTime() + n * 24 * 60 * 60 * 1000);
    const existingTrial = {
      id: 'enrolment-1',
      teacherId: 'teacher-1',
      classes: [
        { class: { id: 'class-1', startsAt: dayPlus(0), status: 'COMPLETED' } },
        { class: { id: 'class-2', startsAt: dayPlus(1), status: 'CANCELLED_FAMILY' } },
        { class: { id: 'class-3', startsAt: dayPlus(2), status: 'SCHEDULED' } },
      ],
    } as unknown as { id: string; teacherId: string | null; classes: TrialClassRow[] };
    const { service, state } = buildBookingHarness({ existingTrial });

    await service.bookTrial({ ...BASE, startsAt: dayPlus(3) });

    expect(state.classSessionCreates).toHaveLength(1);
  });
});

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
