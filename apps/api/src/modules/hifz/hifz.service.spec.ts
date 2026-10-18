import { MUSHAF_PAGE_COUNT, PageState } from '@hifzoon/shared';

import { HifzService } from './hifz.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PolicyService } from '../../common/services/policy.service';

const SUBJECT = { userId: 'user-1', roles: ['TEACHER'] as string[] };

function buildHarness(
  options: {
    studentExists?: boolean;
    access?: boolean;
    created?: number;
    pages?: Array<Record<string, unknown>>;
    page?: Record<string, unknown> | null;
  } = {},
) {
  const state = {
    lastCreateMany: null as Record<string, unknown> | null,
    lastFindMany: null as Record<string, unknown> | null,
  };

  const prisma = {
    student: { count: jest.fn(async () => (options.studentExists === false ? 0 : 1)) },
    studentPageState: {
      createMany: jest.fn(async (args: Record<string, unknown>) => {
        state.lastCreateMany = args;
        return { count: options.created ?? MUSHAF_PAGE_COUNT };
      }),
      findMany: jest.fn(async (args: Record<string, unknown>) => {
        state.lastFindMany = args;
        return options.pages ?? [];
      }),
      findUnique: jest.fn(async () => options.page ?? null),
    },
  } as unknown as PrismaService;

  const policy = {
    assertStudentAccess: jest.fn(async () => undefined),
    canAccessStudent: jest.fn(async () => options.access ?? true),
  } as unknown as PolicyService;

  return { service: new HifzService(prisma, policy), state, prisma, policy };
}

describe('HifzService page state (FR-HFZ-01)', () => {
  describe('initializePageStates', () => {
    it('materialises one row per Mushaf page and reports the total', async () => {
      const { service, state } = buildHarness();

      const result = await service.initializePageStates(SUBJECT, 'student-1');

      expect(result).toEqual({ created: MUSHAF_PAGE_COUNT, total: MUSHAF_PAGE_COUNT });
      const data = (state.lastCreateMany?.data as Array<{ pageNumber: number }>) ?? [];
      expect(data).toHaveLength(MUSHAF_PAGE_COUNT);
      expect(data[0].pageNumber).toBe(1);
      expect(data[MUSHAF_PAGE_COUNT - 1].pageNumber).toBe(MUSHAF_PAGE_COUNT);
    });

    it('is idempotent: a second run relies on skipDuplicates and creates nothing', async () => {
      const { service, state } = buildHarness({ created: 0 });

      const result = await service.initializePageStates(SUBJECT, 'student-1');

      expect(state.lastCreateMany?.skipDuplicates).toBe(true);
      expect(result.created).toBe(0);
    });

    it('refuses a student the caller cannot access', async () => {
      const { service, policy } = buildHarness();
      (policy.assertStudentAccess as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('nope'), { code: 'NOT_RESOURCE_OWNER' }),
      );

      await expect(service.initializePageStates(SUBJECT, 'student-1')).rejects.toMatchObject({
        code: 'NOT_RESOURCE_OWNER',
      });
    });

    it('404s when the student does not exist', async () => {
      const { service } = buildHarness({ studentExists: false });

      await expect(service.initializePageStates(SUBJECT, 'student-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('listPageStates', () => {
    it('orders by page number and forwards the state filter to Prisma', async () => {
      const { service, state } = buildHarness({ pages: [{ pageNumber: 1 }] });

      await service.listPageStates(SUBJECT, 'student-1', { state: PageState.SOLID });

      expect(state.lastFindMany?.orderBy).toEqual({ pageNumber: 'asc' });
      expect(state.lastFindMany?.where).toMatchObject({
        studentId: 'student-1',
        state: PageState.SOLID,
      });
    });

    it('applies a page range when asked', async () => {
      const { service, state } = buildHarness();

      await service.listPageStates(SUBJECT, 'student-1', { fromPage: 10, toPage: 20 });

      expect(state.lastFindMany?.where).toMatchObject({
        pageNumber: { gte: 10, lte: 20 },
      });
    });

    it('rejects a caller without access', async () => {
      const { service } = buildHarness({ access: false });

      await expect(service.listPageStates(SUBJECT, 'student-1')).rejects.toMatchObject({
        code: 'NOT_RESOURCE_OWNER',
      });
    });
  });

  describe('getPageState', () => {
    it('rejects a page outside 1..604', async () => {
      const { service } = buildHarness();

      await expect(service.getPageState(SUBJECT, 'student-1', 0)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(service.getPageState(SUBJECT, 'student-1', 605)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(service.getPageState(SUBJECT, 'student-1', 12.5)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('404s a page with no state row yet', async () => {
      const { service } = buildHarness({ page: null });

      await expect(service.getPageState(SUBJECT, 'student-1', 7)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('returns the row for an owned, initialised page', async () => {
      const row = { pageNumber: 7, state: PageState.FRAGILE };
      const { service } = buildHarness({ page: row });

      await expect(service.getPageState(SUBJECT, 'student-1', 7)).resolves.toBe(row);
    });
  });
});
