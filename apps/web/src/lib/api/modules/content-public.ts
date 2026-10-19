import { ApiClientError, http } from '../http';

/**
 * Public CMS, FAQ and course detail:
 *   GET  /content, /content/:slug, /faq; POST /faq  (admissions.controller.ts, cms.service.ts)
 *   GET  /courses, /courses/:codeOrId               (courses.controller.ts, courses.service.ts)
 */

export type ContentType = 'BLOG' | 'PRINTABLE' | 'LANDING';

/** `GET /content` row (CmsService.listPublic select). */
export interface ContentPost {
  id: string;
  type: ContentType;
  slug: string;
  locale: string;
  title: string;
  body: string;
  countryCode: string | null;
  city: string | null;
  meta: Record<string, unknown> | null;
  publishedAt: string | null;
}

/** `GET /content/:slug` returns the full `cms_post` row. */
export interface ContentPage extends ContentPost {
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContentListQuery {
  type?: ContentType;
  locale?: string;
  country?: string;
  limit?: number;
}

/** `GET /faq` row; `POST /faq` returns the created (unapproved) row. */
export interface FaqItem {
  id: string;
  locale: string;
  question: string;
  answer: string;
  approved: boolean;
  sort: number;
  createdAt?: string;
  updatedAt?: string;
}

/** zod `faqSubmitBody`. */
export interface SubmitFaqInput {
  question: string;
  locale?: string;
}

export const FAQ_QUESTION_MIN = 5;
export const FAQ_QUESTION_MAX = 2000;

export function validateFaqQuestion(question: string): string | null {
  const q = question.trim();
  if (q.length < FAQ_QUESTION_MIN) return `Please write at least ${FAQ_QUESTION_MIN} characters.`;
  if (q.length > FAQ_QUESTION_MAX) return `Questions cannot exceed ${FAQ_QUESTION_MAX} characters.`;
  return null;
}

/** `GET /courses/:id` (CoursesService.findCourse). */
export interface CourseLessonTemplate {
  id: string;
  title: string;
  position: number;
  objectives: unknown;
  materials: Record<string, unknown> | null;
  teacherNotes: string | null;
}

export interface CourseLevelDetail {
  id: string;
  name: string;
  position: number;
  passMark: number | null;
  rubric: Record<string, unknown> | null;
  lessonTemplates: CourseLessonTemplate[];
}

export interface CourseDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
  active: boolean;
  levels: CourseLevelDetail[];
}

/** `GET /courses` row (CoursesService.catalogue) — only what we need to resolve a code. */
export interface CatalogueCourse {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
  levels: Array<{ id: string; name: string; position: number; lessonCount: number }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lesson objectives are stored as JSON; render only string entries. */
export function objectivesList(objectives: unknown): string[] {
  if (Array.isArray(objectives)) return objectives.filter((o): o is string => typeof o === 'string' && o.trim() !== '');
  if (typeof objectives === 'string' && objectives.trim()) return [objectives];
  return [];
}

/** `{ workbook: 'Noorani Qaida page 1' }` → `['Workbook: Noorani Qaida page 1']`. */
export function materialsList(materials: Record<string, unknown> | null | undefined): string[] {
  if (!materials || typeof materials !== 'object') return [];
  return Object.entries(materials)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1).replace(/_/g, ' ')}: ${String(v)}`);
}

// ── Safe text rendering for CMS bodies ───────────────────────────────────────

export type ContentBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * Parses the plain-text / light-markdown bodies the CMS stores into blocks the page
 * renders as React elements (never as HTML, so a post can't inject markup).
 */
export function parseContentBlocks(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const chunks = body.replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const raw of chunks) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const lines = chunk.split('\n');

    const heading = /^(#{1,4})\s+(.+)$/.exec(chunk);
    if (heading && lines.length === 1) {
      const level = Math.min(Math.max(heading[1].length + 1, 2), 4) as 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, text: heading[2].trim() });
      continue;
    }

    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      blocks.push({ kind: 'list', items: lines.map((l) => l.replace(/^\s*[-*]\s+/, '').trim()) });
      continue;
    }

    if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|'))) {
      const rows = lines.filter((l) => !/^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(l)).map(splitRow);
      const [header, ...rest] = rows;
      blocks.push({ kind: 'table', header: header ?? [], rows: rest });
      continue;
    }

    blocks.push({ kind: 'paragraph', text: lines.join('\n') });
  }
  return blocks;
}

/** Plain-text excerpt for cards. */
export function excerpt(body: string, max = 180): string {
  const text = body
    .replace(/^#+\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[-*]\s+/g, '')
    .replace(/_{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const enc = encodeURIComponent;

export const contentApi = {
  list: (q: ContentListQuery = {}) => http.get<ContentPost[]>('/content', { query: { ...q } }),
  bySlug: (slug: string, locale = 'en') => http.get<ContentPage>(`/content/${enc(slug)}`, { query: { locale } }),
  faqs: (locale = 'en') => http.get<FaqItem[]>('/faq', { query: { locale } }),
  submitFaq: (input: SubmitFaqInput) =>
    http.post<FaqItem>('/faq', { question: input.question.trim(), locale: input.locale ?? 'en' }),
  catalogue: (locale = 'en') => http.get<CatalogueCourse[]>('/courses', { query: { locale } }),
  courseById: (id: string) => http.get<CourseDetail>(`/courses/${enc(id)}`),
  /**
   * `GET /courses/:codeOrId` currently 500s for a code (Prisma rejects the non-UUID in the
   * `id` branch of its OR), so a code is resolved to an id via the catalogue first.
   */
  courseDetail: async (codeOrId: string): Promise<CourseDetail> => {
    if (UUID_RE.test(codeOrId)) return contentApi.courseById(codeOrId);
    const catalogue = await contentApi.catalogue();
    const match = catalogue.find((c) => c.code.toLowerCase() === codeOrId.toLowerCase());
    if (!match) throw new ApiClientError('We could not find that course.', 404, 'NOT_FOUND');
    return contentApi.courseById(match.id);
  },
};
