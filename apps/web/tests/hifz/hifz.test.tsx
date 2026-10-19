// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, findSuccessToast } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import {
  countByState,
  duePages,
  hifzApi,
  juzOfPage,
  juzRange,
  JUZ_START_PAGES,
  MUSHAF_PAGE_COUNT,
  PageStateRow,
} from '@/lib/api/modules/hifz';
import { HifzPageMap } from '@/components/hifz/HifzPageMap';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = (pageNumber: number, extra: Partial<PageStateRow> = {}): PageStateRow => ({
  id: `p${pageNumber}`,
  studentId: 's1',
  pageNumber,
  state: 'NOT_STARTED',
  mistakeCountRecent: 0,
  lastRevisedAt: null,
  nextDueAt: null,
  intervalDays: 0,
  updatedAt: '2026-10-18T00:00:00.000Z',
  createdAt: '2026-10-18T00:00:00.000Z',
  ...extra,
});
const allPages = (patch: Record<number, Partial<PageStateRow>> = {}) =>
  Array.from({ length: MUSHAF_PAGE_COUNT }, (_, i) => row(i + 1, patch[i + 1]));

describe('hifz helpers', () => {
  it('maps pages to the 30 juz of the Madani Mushaf', () => {
    expect(JUZ_START_PAGES).toHaveLength(30);
    expect(juzOfPage(1)).toBe(1);
    expect(juzOfPage(21)).toBe(1);
    expect(juzOfPage(22)).toBe(2);
    expect(juzOfPage(604)).toBe(30);
    expect(juzRange(1)).toEqual([1, 21]);
    expect(juzRange(30)).toEqual([582, 604]);
    const total = JUZ_START_PAGES.reduce((n, _, i) => n + juzRange(i + 1)[1] - juzRange(i + 1)[0] + 1, 0);
    expect(total).toBe(604);
  });

  it('counts states and finds pages due on or before today', () => {
    const rows = [row(1, { state: 'SOLID' }), row(2, { state: 'FRAGILE', nextDueAt: '2026-10-18T00:00:00.000Z' }), row(3, { nextDueAt: '2026-10-25T00:00:00.000Z' })];
    expect(countByState(rows)).toEqual({ NOT_STARTED: 1, IN_PROGRESS: 0, FRAGILE: 1, SOLID: 1 });
    expect(duePages(rows, '2026-10-19').map((r) => r.pageNumber)).toEqual([2]);
  });
});

describe('hifz API module', () => {
  it('lists pages with filters, reads one page and initialises', async () => {
    const api = mockApi({
      'GET /hifz/students/s1/pages': { body: envelope([row(1)]) },
      'GET /hifz/students/s1/pages/7': { body: envelope(row(7)) },
      'POST /hifz/students/s1/pages/initialize': { body: envelope({ created: 604, total: 604 }) },
    });
    await hifzApi.pages('s1', { state: 'FRAGILE', fromPage: 1, toPage: 20 });
    const q = new URL(api.calls[0].url).searchParams;
    expect([q.get('state'), q.get('fromPage'), q.get('toPage')]).toEqual(['FRAGILE', '1', '20']);
    expect((await hifzApi.page('s1', 7)).pageNumber).toBe(7);
    expect(await hifzApi.initialize('s1')).toEqual({ created: 604, total: 604 });
    expect(api.calls[2].method).toBe('POST');
  });
});

describe('<HifzPageMap />', () => {
  it('lets a teacher set up an empty tracker', async () => {
    let initialised = false;
    const api = mockApi({
      'GET /hifz/students/s1/pages': () => ({ body: envelope(initialised ? allPages() : []) }),
      'POST /hifz/students/s1/pages/initialize': () => {
        initialised = true;
        return { body: envelope({ created: 604, total: 604 }) };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<HifzPageMap studentId="s1" canInitialize />);

    await user.click(await screen.findByRole('button', { name: 'Set up Hifz tracker' }));
    await findSuccessToast(/604 pages/);
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/initialize'))).toBe(true);
    expect(await screen.findByText(/Every page is still/)).toBeTruthy();
  });

  it('does not offer set-up to a family', async () => {
    mockApi({ 'GET /hifz/students/s1/pages': { body: envelope([]) } });
    renderWithProviders(<HifzPageMap studentId="s1" />);
    expect(await screen.findByText('Hifz tracker not set up yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up Hifz tracker' })).toBeNull();
  });

  it('renders all 604 pages, counts states and due pages, and opens a page', async () => {
    const pages = allPages({
      1: { state: 'SOLID' },
      2: { state: 'SOLID' },
      50: { state: 'FRAGILE', nextDueAt: '2020-01-01T00:00:00.000Z', mistakeCountRecent: 3, intervalDays: 2 },
      100: { state: 'IN_PROGRESS' },
    });
    mockApi({
      'GET /hifz/students/s1/pages': { body: envelope(pages) },
      'GET /hifz/students/s1/pages/50': { body: envelope(pages[49]) },
    });
    const user = userEvent.setup();
    renderWithProviders(<HifzPageMap studentId="s1" />);

    // Only juz with progress are listed by default; "All 30 juz" shows every page.
    await screen.findByRole('button', { name: 'In progress' });
    await user.click(screen.getByRole('button', { name: 'All 30 juz' }));
    expect(screen.getAllByRole('button', { name: /^Page \d+:/ })).toHaveLength(604);
    const tile = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) }).textContent;
    expect(tile('Memorised')).toContain('2');
    expect(tile('Needs revision')).toContain('1');
    expect(tile('Memorising')).toContain('1');
    expect(screen.queryByText(/Every page is still/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Page 50: Needs revision, due for revision' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Juz 3')).toBeTruthy();
    expect(within(dialog).getByText('Due for revision')).toBeTruthy();
    expect(within(dialog).getByText('Needs revision')).toBeTruthy();
    expect(within(dialog).getByText('2 days')).toBeTruthy();
    expect(within(dialog).getByText('3')).toBeTruthy();
  }, 20_000);

  it('offers to add missing pages when the tracker is incomplete', async () => {
    mockApi({ 'GET /hifz/students/s1/pages': { body: envelope(allPages().slice(0, 600)) } });
    renderWithProviders(<HifzPageMap studentId="s1" canInitialize />);
    expect(await screen.findByText('4 pages missing from this tracker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add missing pages' })).toBeTruthy();
  });
});
