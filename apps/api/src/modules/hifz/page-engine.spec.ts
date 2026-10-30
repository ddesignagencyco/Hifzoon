import { applyLessonCardToPages } from './page-engine';

type Row = { state: string; intervalDays: number; mistakeCountRecent: number };

function harness(input: {
  portions: Array<{ kind: string; grade: string | null; fromPage: number | null; toPage: number | null }>;
  mistakes?: number;
  existing?: Record<number, Row>;
}) {
  const pages = new Map<number, Row & Record<string, unknown>>(
    Object.entries(input.existing ?? {}).map(([k, v]) => [Number(k), { ...v }]),
  );
  const db = {
    lessonCard: {
      findUnique: jest.fn(async () => ({ studentId: 's1', submittedAt: new Date('2026-10-30T10:00:00Z'), portions: input.portions })),
    },
    hifzRuleConfig: { findFirst: jest.fn(async () => null) },
    mistake: { count: jest.fn(async () => input.mistakes ?? 0) },
    studentPageState: {
      findUnique: jest.fn(async (args: { where: { studentId_pageNumber: { pageNumber: number } } }) =>
        pages.get(args.where.studentId_pageNumber.pageNumber) ?? null,
      ),
      upsert: jest.fn(async (args: { where: { studentId_pageNumber: { pageNumber: number } }; update: Row }) => {
        pages.set(args.where.studentId_pageNumber.pageNumber, { ...args.update });
        return args.update;
      }),
    },
  };
  return { db, pages };
}

describe('applyLessonCardToPages (M46)', () => {
  it('moves each page of a graded portion, and leaves portions without pages alone', async () => {
    const { db, pages } = harness({
      portions: [
        { kind: 'SABQI', grade: 'EXCELLENT', fromPage: 10, toPage: 11 },
        { kind: 'MANZIL', grade: 'GOOD', fromPage: null, toPage: null },
      ],
    });
    const result = await applyLessonCardToPages(db as never, 'card-1');
    expect(result.pages).toBe(2);
    expect(pages.get(10)).toMatchObject({ state: 'SOLID', intervalDays: 1, mistakeCountRecent: 0 });
    expect(pages.get(11)).toMatchObject({ state: 'SOLID' });
    expect(pages.has(12)).toBe(false);
  });

  it('climbs the SOLID interval ladder on a page that was already solid', async () => {
    const { db, pages } = harness({
      portions: [{ kind: 'MANZIL', grade: 'EXCELLENT', fromPage: 5, toPage: 5 }],
      existing: { 5: { state: 'SOLID', intervalDays: 3, mistakeCountRecent: 0 } },
    });
    await applyLessonCardToPages(db as never, 'card-1');
    expect(pages.get(5)).toMatchObject({ state: 'SOLID', intervalDays: 7 });
  });

  it('marks pages fragile when graded as needing work with mistakes, and counts the mistakes', async () => {
    const { db, pages } = harness({
      portions: [{ kind: 'SABAQ', grade: 'NEEDS_WORK', fromPage: 20, toPage: 21 }],
      mistakes: 4,
    });
    await applyLessonCardToPages(db as never, 'card-1');
    expect(pages.get(20)).toMatchObject({ state: 'FRAGILE', intervalDays: 1, mistakeCountRecent: 2 });
  });

  it('caps a portion at 20 pages so a typo cannot rewrite the whole Mushaf', async () => {
    const { db } = harness({ portions: [{ kind: 'MANZIL', grade: 'GOOD', fromPage: 1, toPage: 604 }] });
    const result = await applyLessonCardToPages(db as never, 'card-1');
    expect(result.pages).toBe(20);
  });
});
