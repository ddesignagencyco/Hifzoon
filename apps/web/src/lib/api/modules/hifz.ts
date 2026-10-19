import { http } from '../http';

/**
 * Hifz page-state model (`apps/api/src/modules/hifz`, FR-HFZ-01 / HFZ-BE-01).
 *
 * One row per Mushaf page (1..604) per student. The API only reads and initialises rows
 * today; the rules engine that moves pages between states (FR-HFZ-02) is not built yet,
 * so a freshly initialised student shows every page as NOT_STARTED.
 */
export const MUSHAF_PAGE_COUNT = 604;

export const PAGE_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'FRAGILE', 'SOLID'] as const;
export type PageState = (typeof PAGE_STATES)[number];

export interface PageStateRow {
  id: string;
  studentId: string;
  pageNumber: number;
  state: PageState;
  mistakeCountRecent: number;
  lastRevisedAt: string | null;
  /** A date (`YYYY-MM-DD` at midnight UTC) — the API stores `@db.Date`. */
  nextDueAt: string | null;
  intervalDays: number;
  updatedAt: string;
  createdAt: string;
}

export interface PageStateFilter {
  state?: PageState;
  fromPage?: number;
  toPage?: number;
}

/** First page of each juz in the 604-page Madani Mushaf. */
export const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502,
  522, 542, 562, 582,
] as const;

export function juzOfPage(page: number): number {
  let juz = 1;
  for (let i = 0; i < JUZ_START_PAGES.length; i++) if (page >= JUZ_START_PAGES[i]) juz = i + 1;
  return juz;
}

/** Pages of a juz as `[first, last]`. */
export function juzRange(juz: number): [number, number] {
  const first = JUZ_START_PAGES[juz - 1];
  const last = juz < JUZ_START_PAGES.length ? JUZ_START_PAGES[juz] - 1 : MUSHAF_PAGE_COUNT;
  return [first, last];
}

export function countByState(rows: PageStateRow[]): Record<PageState, number> {
  const counts: Record<PageState, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, FRAGILE: 0, SOLID: 0 };
  for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
  return counts;
}

/** Pages whose revision is due on or before `today` (a `YYYY-MM-DD` string). */
export function duePages(rows: PageStateRow[], today: string): PageStateRow[] {
  return rows.filter((r) => r.nextDueAt && r.nextDueAt.slice(0, 10) <= today);
}

const base = (studentId: string) => `/hifz/students/${encodeURIComponent(studentId)}/pages`;

export const hifzApi = {
  pages: (studentId: string, filter: PageStateFilter = {}) =>
    http.get<PageStateRow[]>(base(studentId), { query: { ...filter } }),
  page: (studentId: string, pageNumber: number) => http.get<PageStateRow>(`${base(studentId)}/${pageNumber}`),
  /** Idempotent: creates the missing rows of 604 (teacher / supervisor / admin). */
  initialize: (studentId: string) => http.post<{ created: number; total: number }>(`${base(studentId)}/initialize`, {}),
};
