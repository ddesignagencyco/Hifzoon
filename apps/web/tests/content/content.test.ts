import { describe, it, expect } from 'vitest';
import {
  contentApi,
  parseContentBlocks,
  validateFaqQuestion,
  excerpt,
  objectivesList,
  materialsList,
} from '@/lib/api/modules/content-public';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const HIFZ_ID = '01a13f96-725f-7ba3-babc-66dc3d2f2bff';

describe('public content API module', () => {
  it('lists content with type/locale/limit', async () => {
    const api = mockApi({ 'GET /content': { body: envelope([{ id: 'p1', slug: 'a', title: 'A', body: 'x', type: 'BLOG' }]) } });
    const posts = await contentApi.list({ type: 'BLOG', locale: 'en', limit: 5 });
    expect(api.calls[0].url).toContain('/content?type=BLOG&locale=en&limit=5');
    expect(posts[0].slug).toBe('a');
  });

  it('reads a page by slug and surfaces 404', async () => {
    const api = mockApi({ 'GET /content/how-long': { body: envelope({ id: 'p1', slug: 'how-long', title: 'T', body: 'B' }) } });
    expect((await contentApi.bySlug('how-long')).title).toBe('T');
    expect(api.calls[0].url).toContain('/content/how-long?locale=en');
    mockApi({ 'GET /content/missing': apiError(404, 'NOT_FOUND', 'Page not found') });
    await expect(contentApi.bySlug('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('lists FAQs and submits a trimmed question', async () => {
    const api = mockApi({
      'GET /faq': { body: envelope([{ id: 'f1', question: 'Q?', answer: 'A', approved: true, sort: 0, locale: 'en' }]) },
      'POST /faq': (call) => ({ status: 201, body: envelope({ id: 'f2', approved: false, answer: '', sort: 0, ...(call.body as object) }) }),
    });
    expect(await contentApi.faqs()).toHaveLength(1);
    const created = await contentApi.submitFaq({ question: '  Can siblings share a class?  ' });
    expect(api.calls[1].body).toEqual({ question: 'Can siblings share a class?', locale: 'en' });
    expect(created.approved).toBe(false);
  });

  it('resolves a course code via the catalogue, then reads by id', async () => {
    const api = mockApi({
      'GET /courses': { body: envelope([{ id: HIFZ_ID, code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: '', levels: [] }]) },
      [`GET /courses/${HIFZ_ID}`]: { body: envelope({ id: HIFZ_ID, code: 'HIFZ', name: 'Hifz', levels: [], active: true }) },
    });
    const course = await contentApi.courseDetail('hifz');
    expect(course.id).toBe(HIFZ_ID);
    expect(api.calls.map((c) => c.url.replace(/^.*\/api\/v1/, ''))).toEqual(['/courses?locale=en', `/courses/${HIFZ_ID}`]);
  });

  it('reads a course id directly and 404s an unknown code', async () => {
    const api = mockApi({
      [`GET /courses/${HIFZ_ID}`]: { body: envelope({ id: HIFZ_ID, levels: [] }) },
      'GET /courses': { body: envelope([]) },
    });
    await contentApi.courseDetail(HIFZ_ID);
    expect(api.calls).toHaveLength(1);
    await expect(contentApi.courseDetail('NOPE')).rejects.toMatchObject({ status: 404 });
  });
});

describe('content helpers', () => {
  it('parses headings, lists, tables and paragraphs without HTML', () => {
    const blocks = parseContentBlocks(
      '## Revision\n\nKeep revising.\n\n- one\n- two\n\n| Day | Portion |\n|-----|---------|\n| Mon | p1 |\n\n<script>alert(1)</script>',
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'table', 'paragraph']);
    expect(blocks[3]).toEqual({ kind: 'table', header: ['Day', 'Portion'], rows: [['Mon', 'p1']] });
    expect(blocks[4]).toEqual({ kind: 'paragraph', text: '<script>alert(1)</script>' });
  });

  it('validates FAQ questions like the zod body', () => {
    expect(validateFaqQuestion('Hi')).toBeTruthy();
    expect(validateFaqQuestion('x'.repeat(2001))).toBeTruthy();
    expect(validateFaqQuestion('Do you teach adults?')).toBeNull();
  });

  it('builds excerpts and lesson lists from JSON', () => {
    expect(excerpt('## Title\n\nSome text here', 12)).toBe('Title Some…');
    expect(objectivesList(['a', 2, ''])).toEqual(['a']);
    expect(materialsList({ workbook: 'Qaida p1', extra: { x: 1 } })).toEqual(['Workbook: Qaida p1']);
  });
});
