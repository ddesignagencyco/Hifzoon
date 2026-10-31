import { type PageState, type Prisma, type PrismaClient } from '@prisma/client';

/**
 * M46 — moves a student's Hifz page states from a submitted lesson card (FR-HFZ-02).
 *
 * Each portion that names its Mushaf pages (`fromPage`–`toPage`) updates those pages:
 * the grade maps to a state through the academy's rule config (`hifz_rule_config`), the
 * next revision is spaced by that state's interval ladder, and the card's mistakes count
 * against the pages it covered. Portions without pages are left alone — pages are never
 * guessed from surah/ayah numbers.
 *
 * A plain function (not a service) so the lessons module can call it without importing
 * the Hifz module. Pages outside 1–604 are ignored.
 */
type Db = PrismaClient | Prisma.TransactionClient;

interface HifzRules {
  gradeToState: Record<string, PageState>;
  fragileThreshold: { mistakes: number; gradeIn: string[] };
  intervalsDays: { SOLID: number[]; FRAGILE: number[] };
}

const DEFAULT_RULES: HifzRules = {
  gradeToState: {
    EXCELLENT: 'SOLID',
    GOOD: 'IN_PROGRESS',
    NEEDS_WORK: 'FRAGILE',
    REPEAT: 'FRAGILE',
  },
  fragileThreshold: { mistakes: 1, gradeIn: ['NEEDS_WORK', 'REPEAT'] },
  intervalsDays: { SOLID: [1, 3, 7, 14, 30, 60], FRAGILE: [1, 2] },
};

/** At most this many pages per portion, so a typo like 1–604 cannot rewrite the whole Mushaf. */
const MAX_PAGES_PER_PORTION = 20;
const DAY = 86_400_000;

async function loadRules(db: Db): Promise<HifzRules> {
  const row = await db.hifzRuleConfig.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { rules: true },
  });
  const rules = (row?.rules ?? {}) as Partial<HifzRules>;
  return {
    gradeToState: { ...DEFAULT_RULES.gradeToState, ...(rules.gradeToState ?? {}) },
    fragileThreshold: { ...DEFAULT_RULES.fragileThreshold, ...(rules.fragileThreshold ?? {}) },
    intervalsDays: { ...DEFAULT_RULES.intervalsDays, ...(rules.intervalsDays ?? {}) },
  };
}

/** The next step on the interval ladder after `current` days (the first step when not on it). */
function nextInterval(ladder: number[], current: number): number {
  const i = ladder.indexOf(current);
  return i < 0 ? ladder[0] : ladder[Math.min(i + 1, ladder.length - 1)];
}

export async function applyLessonCardToPages(
  db: Db,
  lessonCardId: string,
): Promise<{ pages: number }> {
  const card = await db.lessonCard.findUnique({
    where: { id: lessonCardId },
    select: {
      studentId: true,
      submittedAt: true,
      portions: { select: { kind: true, grade: true, fromPage: true, toPage: true } },
    },
  });
  if (!card?.submittedAt) return { pages: 0 };

  const portions = card.portions.filter((p) => p.fromPage && p.fromPage >= 1 && p.fromPage <= 604);
  if (portions.length === 0) return { pages: 0 };

  const rules = await loadRules(db);
  const mistakes = await db.mistake.count({ where: { lessonCardId, dismissedAt: null } });
  const at = card.submittedAt;
  let touched = 0;

  for (const portion of portions) {
    const from = portion.fromPage as number;
    const to = Math.min(
      Math.max(portion.toPage ?? from, from),
      604,
      from + MAX_PAGES_PER_PORTION - 1,
    );
    const pages = to - from + 1;
    // The card's mistakes are shared across the pages it covered (a mistake is not tied to a page).
    const perPage = Math.ceil(mistakes / Math.max(1, pages));

    for (let page = from; page <= to; page += 1) {
      const existing = await db.studentPageState.findUnique({
        where: { studentId_pageNumber: { studentId: card.studentId, pageNumber: page } },
        select: { state: true, intervalDays: true, mistakeCountRecent: true },
      });

      let state: PageState =
        (portion.grade && rules.gradeToState[portion.grade]) ||
        (portion.kind === 'SABAQ' ? 'IN_PROGRESS' : (existing?.state ?? 'IN_PROGRESS'));
      // New mistakes on a page graded as needing work keep it fragile, whatever the map says.
      if (
        perPage >= rules.fragileThreshold.mistakes &&
        portion.grade &&
        rules.fragileThreshold.gradeIn.includes(portion.grade)
      ) {
        state = 'FRAGILE';
      }
      if (state === 'NOT_STARTED') state = 'IN_PROGRESS';

      const intervalDays =
        state === 'SOLID'
          ? nextInterval(
              rules.intervalsDays.SOLID,
              existing?.state === 'SOLID' ? existing.intervalDays : 0,
            )
          : state === 'FRAGILE'
            ? nextInterval(
                rules.intervalsDays.FRAGILE,
                existing?.state === 'FRAGILE' ? existing.intervalDays : 0,
              )
            : 1;

      const data = {
        state,
        intervalDays,
        lastRevisedAt: at,
        nextDueAt: new Date(at.getTime() + intervalDays * DAY),
        mistakeCountRecent: state === 'SOLID' ? 0 : (existing?.mistakeCountRecent ?? 0) + perPage,
      };
      await db.studentPageState.upsert({
        where: { studentId_pageNumber: { studentId: card.studentId, pageNumber: page } },
        update: data,
        create: { studentId: card.studentId, pageNumber: page, ...data },
      });
      touched += 1;
    }
  }
  return { pages: touched };
}
