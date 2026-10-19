import { Injectable } from '@nestjs/common';
import {
  MUSHAF_MAX_PAGE,
  MUSHAF_MIN_PAGE,
  MUSHAF_PAGE_COUNT,
  type PageState,
} from '@hifzoon/shared';
import type { StudentPageState } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { write } from '../../common/prisma-enum-bridge';
import { type PolicySubject, PolicyService } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';

/** 1..604 — the Madani mushaf has exactly this many pages (FR-HFZ-01). */
const ALL_PAGES: readonly number[] = Array.from(
  { length: MUSHAF_PAGE_COUNT },
  (_, index) => MUSHAF_MIN_PAGE + index,
);

export interface PageStateFilter {
  state?: PageState;
  fromPage?: number;
  toPage?: number;
}

/**
 * Page-state model (FR-HFZ-01).
 *
 * Every Hifz student owns one `page_state` row per Mushaf page so the heat map and the
 * rules engine read progress with a single indexed query instead of deriving it from
 * lesson history on each request.
 */
@Injectable()
export class HifzService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  /**
   * Materialises the 604 rows for a student (FR-HFZ-01). Safe to call twice: the
   * `(student_id, page_number)` unique constraint plus `skipDuplicates` turns a second
   * call into a no-op instead of a constraint violation.
   */
  async initializePageStates(
    subject: PolicySubject,
    studentId: string,
  ): Promise<{ created: number; total: number }> {
    await this.policy.assertStudentAccess(subject, studentId);

    const student = await this.prisma.student.count({ where: { id: studentId }, take: 1 });
    if (student === 0) throw AppError.notFound('Student');

    const { count } = await this.prisma.studentPageState.createMany({
      data: ALL_PAGES.map((pageNumber) => ({ studentId, pageNumber })),
      skipDuplicates: true,
    });
    return { created: count, total: MUSHAF_PAGE_COUNT };
  }

  async listPageStates(
    subject: PolicySubject,
    studentId: string,
    filter: PageStateFilter = {},
  ): Promise<StudentPageState[]> {
    await this.assertReadable(subject, studentId);

    return this.prisma.studentPageState.findMany({
      where: {
        studentId,
        ...(filter.state ? { state: write.pageState(filter.state) } : {}),
        ...(filter.fromPage !== undefined || filter.toPage !== undefined
          ? {
              pageNumber: {
                ...(filter.fromPage !== undefined ? { gte: filter.fromPage } : {}),
                ...(filter.toPage !== undefined ? { lte: filter.toPage } : {}),
              },
            }
          : {}),
      },
      orderBy: { pageNumber: 'asc' },
    });
  }

  async getPageState(
    subject: PolicySubject,
    studentId: string,
    pageNumber: number,
  ): Promise<StudentPageState> {
    assertPageNumber(pageNumber);
    await this.assertReadable(subject, studentId);

    const page = await this.prisma.studentPageState.findUnique({
      where: { studentId_pageNumber: { studentId, pageNumber } },
    });
    if (!page) throw AppError.notFound(`Page ${pageNumber}`);
    return page;
  }

  /**
   * Read access spans staff, the student's guardians, the student's teachers and the
   * student themself — `canAccessStudent` already encodes all four axes, so the service
   * does not have to guess which one the caller meant.
   */
  private async assertReadable(subject: PolicySubject, studentId: string): Promise<void> {
    if (await this.policy.canAccessStudent(subject, studentId)) return;
    throw new AppError('NOT_RESOURCE_OWNER', 'You do not have access to this record');
  }
}

function assertPageNumber(pageNumber: number): void {
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < MUSHAF_MIN_PAGE ||
    pageNumber > MUSHAF_MAX_PAGE
  ) {
    throw AppError.badRequest(
      `pageNumber must be an integer between ${MUSHAF_MIN_PAGE} and ${MUSHAF_MAX_PAGE}`,
    );
  }
}
