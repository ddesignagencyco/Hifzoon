// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, renderWithProviders } from '../helpers/render';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import {
  groupByAyah,
  practiceFromMistakes,
  practiceRangeFromMistakes,
  splitOpenMistakes,
  type MistakeLike,
} from '@/lib/mistakes-practice';
import { MistakesToPractise, NO_OPEN_MISTAKES } from '@/components/practice/MistakesToPractise';
import { PracticeOverview } from '@/components/practice/PracticeOverview';
import { MistakesModal, MISTAKES_PAGE_SIZE, type MistakesTab } from '@/components/classroom/MistakesModal';

// ── Reader: capture the markers handed to the Mushaf ────────────────────────
const viewerProps = vi.fn();
vi.mock('@/components/mushaf/MushafViewer', () => ({
  MushafViewer: (props: unknown) => {
    viewerProps(props);
    return <div data-testid="mushaf" />;
  },
}));
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/parent/quran',
}));

const SID = 'student-1';
const CID = 'class-now';

function mistake(over: Partial<MistakeLike> & { id: string }): MistakeLike & Record<string, unknown> {
  return {
    surah: 67,
    ayah: 1,
    wordIndex: 0,
    itemRef: null,
    note: null,
    type: 'VOWEL_HARAKAH',
    tajweedRule: null,
    source: 'CLASS',
    confirmed: true,
    dismissedAt: null,
    resolvedAt: null,
    occurredAt: '2026-11-01T10:00:00Z',
    lessonCardId: null,
    classId: 'class-old',
    ...over,
  };
}

const ROWS = [
  mistake({ id: 'a', surah: 67, ayah: 2, wordIndex: 3, occurredAt: '2026-11-03T10:00:00Z' }),
  mistake({ id: 'b', surah: 67, ayah: 2, wordIndex: 5, type: 'TAJWEED_RULE', occurredAt: '2026-11-02T10:00:00Z' }),
  mistake({ id: 'c', surah: 67, ayah: 9, wordIndex: 1, occurredAt: '2026-11-04T10:00:00Z' }),
  mistake({ id: 'resolved', ayah: 4, resolvedAt: '2026-11-05T10:00:00Z' }),
  mistake({ id: 'dismissed', ayah: 5, dismissedAt: '2026-11-05T10:00:00Z' }),
  mistake({ id: 'ai', ayah: 6, confirmed: false }),
  mistake({ id: 'q', surah: null, ayah: null, wordIndex: null, itemRef: 'Qaida 3.2', note: 'Joins ba-ta', type: 'LETTER_JOINING' }),
];

beforeEach(() => {
  viewerProps.mockClear();
  search = new URLSearchParams();
});

describe('open-mistake helpers', () => {
  it('keeps only confirmed, live mistakes and groups Mushaf ones by ayah, newest first', () => {
    const { mushaf, items } = splitOpenMistakes(ROWS);
    expect(mushaf.map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(items.map((m) => m.id)).toEqual(['q']);
    const groups = groupByAyah(mushaf);
    expect(groups.map((g) => `${g.surah}:${g.ayah}`)).toEqual(['67:9', '67:2']);
    expect(groups[1].mistakes.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('practice range: the surah with most mistakes, its densest 10-ayah stretch', () => {
    const rows = [
      mistake({ id: '1', surah: 2, ayah: 10 }),
      mistake({ id: '2', surah: 2, ayah: 14 }),
      mistake({ id: '3', surah: 2, ayah: 18 }),
      mistake({ id: '4', surah: 2, ayah: 80, occurredAt: '2026-11-05T00:00:00Z' }),
      mistake({ id: '5', surah: 67, ayah: 1, occurredAt: '2026-11-06T00:00:00Z' }),
      mistake({ id: 'x', surah: 3, ayah: 1, resolvedAt: '2026-11-06T00:00:00Z' }),
    ];
    expect(practiceRangeFromMistakes(rows)).toEqual({ fromSurah: 2, fromAyah: 10, toSurah: 2, toAyah: 18 });
    expect(practiceRangeFromMistakes([mistake({ id: 'q', surah: null, ayah: null })])).toBeNull();
  });

  it('practice body: reading, 15 minutes, due in three days', () => {
    const body = practiceFromMistakes(SID, ROWS, new Date(2026, 10, 6, 12));
    expect(body).toEqual({
      studentId: SID,
      fromSurah: 67,
      fromAyah: 2,
      toSurah: 67,
      toAyah: 9,
      mode: 'READING',
      targetMinutes: 15,
      dueOn: '2026-11-09',
    });
  });
});

describe('MistakesToPractise', () => {
  it('lists one row per open mistake, newest first, with Listen and Read for Mushaf ones', async () => {
    const api = mockApi({
      [`GET /students/${SID}/mistakes`]: { body: envelope(ROWS) },
      'GET /mushaf/ayah-audio': { body: envelope({ surah: 67, ayah: 9, url: 'https://audio.test/67-9.mp3' }) },
    });
    renderWithProviders(<MistakesToPractise studentId={SID} readerBase="/parent/quran" />);

    const table = await screen.findByRole('table');
    expect(within(table).getAllByText(/^Surah 67:/).map((r) => r.textContent)).toEqual([
      'Surah 67:9 · word 2',
      'Surah 67:2 · word 4',
      'Surah 67:2 · word 6',
    ]);
    // A single child: no Child column.
    expect(within(table).queryByText('Child')).toBeNull();
    const read = screen.getByRole('link', { name: 'Read Surah 67:2 · word 4 in the Mushaf' });
    expect(read.getAttribute('href')).toBe(`/parent/quran?surah=67&ayah=2&marks=1&student=${SID}`);
    expect(screen.getByText('Qaida 3.2')).toBeTruthy();
    expect(screen.getByText(/Joins ba-ta/)).toBeTruthy();
    // Lesson-item mistakes have nothing to listen to or read in the Mushaf.
    expect(screen.getAllByRole('link', { name: /in the Mushaf$/ })).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'Listen to Surah 67:9 · word 2' }));
    const audio = await screen.findByLabelText('Recitation of Surah 67:9');
    expect(audio.getAttribute('src')).toBe('https://audio.test/67-9.mp3');
    expect(api.calls.some((c) => c.url.includes('/mushaf/ayah-audio?surah=67&ayah=9'))).toBe(true);
  });

  it('student reader links carry no student id', async () => {
    mockApi({ [`GET /students/${SID}/mistakes`]: { body: envelope(ROWS) } });
    renderWithProviders(<MistakesToPractise studentId={SID} readerBase="/student/quran" />);
    const read = await screen.findByRole('link', { name: 'Read Surah 67:9 · word 2 in the Mushaf' });
    expect(read.getAttribute('href')).toBe('/student/quran?surah=67&ayah=9&marks=1');
  });

  it('says when recitation audio is not licensed', async () => {
    mockApi({
      [`GET /students/${SID}/mistakes`]: { body: envelope(ROWS) },
      'GET /mushaf/ayah-audio': apiError(501, 'NOT_IMPLEMENTED', 'Ayah audio needs the licensed Quran provider'),
    });
    renderWithProviders(<MistakesToPractise studentId={SID} readerBase="/parent/quran" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Listen to Surah 67:2 · word 4' }));
    expect(await screen.findByText(/not available on this deployment/)).toBeTruthy();
  });

  it('shows the empty state when nothing is open', async () => {
    mockApi({ [`GET /students/${SID}/mistakes`]: { body: envelope([ROWS[3], ROWS[4]]) } });
    renderWithProviders(<MistakesToPractise studentId={SID} readerBase="/parent/quran" />);
    expect(await screen.findByText(NO_OPEN_MISTAKES)).toBeTruthy();
  });
});

describe('PracticeOverview (/parent/practice and /parent/mistakes, and the student pages)', () => {
  const OTHER = 'student-2';
  const KIDS = [
    { id: SID, displayName: 'Ayaan' },
    { id: OTHER, displayName: 'Maryam' },
  ];
  const ASSIGNMENT = {
    id: 'pa-1',
    studentId: SID,
    fromSurah: 112,
    fromAyah: 1,
    toSurah: 112,
    toAyah: 4,
    mode: 'READING',
    targetMinutes: 30,
    dueOn: null,
    status: 'IN_PROGRESS',
    createdAt: '2026-11-01T00:00:00Z',
    student: { id: SID, displayName: 'Ayaan' },
    teacher: { id: 't-1', user: { name: 'QA Teacher' } },
    minutesDone: 5,
    sessionCount: 1,
    lastPractisedAt: null,
    overdue: false,
    awaitingReview: 0,
    lastReview: null,
  };

  function routes(otherRows: unknown[] = []) {
    return {
      'GET /practice-assignments': { body: envelope([ASSIGNMENT]) },
      [`GET /students/${SID}/mistakes`]: { body: envelope(ROWS) },
      [`GET /students/${OTHER}/mistakes`]: { body: envelope(otherRows) },
    };
  }

  it('Practice: the assignments with Status and Due filters, no tabs', async () => {
    mockApi(routes());
    renderWithProviders(
      <PracticeOverview view="assigned" students={KIDS} readerBase="/parent/quran" showStudent practiceHref={(a) => `/p/${a.id}`} />,
    );
    expect(screen.getAllByRole('group', { name: 'Filters' })).toHaveLength(1);
    expect(screen.queryByRole('tab')).toBeNull();
    // The assignments table: a prepare-only assignment reads Practised.
    expect(await screen.findByText('Practised')).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
  });

  it('Mistakes: one table, filtered by Child and a mistake Status (All by default); no Due', async () => {
    mockApi(routes([mistake({ id: 'm2', surah: 1, ayah: 3, wordIndex: 0, occurredAt: '2026-11-05T10:00:00Z' })]));
    renderWithProviders(<PracticeOverview view="mistakes" students={KIDS} readerBase="/parent/quran" showStudent />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.queryByLabelText('Due')).toBeNull();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Maryam')).toBeTruthy();
    // All includes the one fixed in the fixtures; "To practise" leaves only the open ones.
    expect(within(table).getAllByText('Ayaan')).toHaveLength(5);
    await chooseOption(screen.getByLabelText('Status'), 'To practise');
    expect(within(screen.getByRole('table')).getAllByText('Ayaan')).toHaveLength(4);

    await chooseOption(screen.getByLabelText('Child'), 'Maryam');
    expect(within(screen.getByRole('table')).queryByText('Ayaan')).toBeNull();
  });

  it('one empty state when no child has an open mistake', async () => {
    mockApi({ ...routes(), [`GET /students/${SID}/mistakes`]: { body: envelope([]) } });
    renderWithProviders(<PracticeOverview view="mistakes" students={KIDS} readerBase="/parent/quran" showStudent />);
    expect(await screen.findAllByText(NO_OPEN_MISTAKES)).toHaveLength(1);
  });

  it('a student sees no Child filter', async () => {
    mockApi(routes());
    renderWithProviders(<PracticeOverview view="mistakes" students={[KIDS[0]]} readerBase="/student/quran" />);
    await screen.findByRole('table');
    expect(screen.queryByLabelText('Child')).toBeNull();
  });
});

describe('QuranReader with marks', () => {
  it('passes the student’s open Mushaf mistakes to the viewer as markers, with a legend', async () => {
    search = new URLSearchParams({ surah: '67', ayah: '2', marks: '1', student: SID });
    mockApi({
      'GET /mushaf/layouts': { body: envelope([{ layout: 'MADANI_15', maxPage: 604, available: true }]) },
      'GET /mushaf/page-of': { body: envelope({ surah: 67, ayah: 2, page: 562 }) },
      [`GET /students/${SID}/mistakes`]: { body: envelope(ROWS) },
    });
    const { QuranReader } = await import('@/components/quran/QuranReader');
    renderWithProviders(<QuranReader eyebrow="Family portal" />);
    expect(await screen.findByText('Red underline: words your teacher marked to practise.')).toBeTruthy();
    await waitFor(() => {
      const last = viewerProps.mock.calls.at(-1)?.[0] as { markers?: unknown[]; page: number };
      expect(last.page).toBe(562);
      expect(last.markers).toEqual([
        { surah: 67, ayah: 9, wordIndex: 1 },
        { surah: 67, ayah: 2, wordIndex: 3 },
        { surah: 67, ayah: 2, wordIndex: 5 },
      ]);
    });
  });

  it('passes no markers without marks=1', async () => {
    search = new URLSearchParams({ page: '3' });
    mockApi({ 'GET /mushaf/layouts': { body: envelope([{ layout: 'MADANI_15', maxPage: 604, available: true }]) } });
    const { QuranReader } = await import('@/components/quran/QuranReader');
    renderWithProviders(<QuranReader eyebrow="Family portal" />);
    await screen.findByTestId('mushaf');
    expect((viewerProps.mock.calls.at(-1)?.[0] as { markers?: unknown }).markers).toBeUndefined();
    expect(screen.queryByText(/Red underline/)).toBeNull();
  });
});

describe('Mistakes window — Earlier classes', () => {
  const students = [{ studentId: SID, displayName: 'Ayaan' }];
  const history = [
    mistake({ id: 'old', surah: 67, ayah: 2, wordIndex: 3, type: 'TAJWEED_RULE' }),
    mistake({ id: 'now', surah: 67, ayah: 3, classId: CID }),
    mistake({ id: 'item', surah: null, ayah: null, wordIndex: null, itemRef: 'Qaida 3.2', type: 'LETTER_JOINING' }),
  ];

  function Window({
    viewer = 'teacher',
    mushaf = true,
    onGoTo,
    onClose = vi.fn(),
  }: {
    viewer?: 'teacher' | 'family';
    mushaf?: boolean;
    onGoTo?: (t: unknown) => void;
    onClose?: () => void;
  }) {
    const [tab, setTab] = React.useState<MistakesTab>('earlier');
    return (
      <MistakesModal
        open
        onClose={onClose}
        classId={CID}
        viewer={viewer}
        students={students}
        mushaf={mushaf}
        board={null}
        tab={tab}
        onTabChange={setTab}
        onGoTo={onGoTo}
      />
    );
  }
  const classRoute = { [`GET /classes/${CID}/mistakes`]: { body: envelope([]) } };

  it('lists earlier open Mushaf mistakes only; Fixed resolves; Still wrong logs the same place again', async () => {
    const api = mockApi({
      ...classRoute,
      [`GET /students/${SID}/mistakes`]: { body: envelope(history) },
      'POST /mistakes/old/resolve': { body: envelope({ id: 'old', resolvedAt: '2026-11-06T10:00:00Z' }) },
      [`POST /classes/${CID}/mistakes`]: (c) => ({
        status: 201,
        body: envelope({ id: 'new', classId: CID, confirmed: true, occurredAt: '2026-11-06T10:00:00Z', ...(c.body as object) }),
      }),
    });
    renderWithProviders(<Window onGoTo={vi.fn()} />);
    const list = await screen.findByRole('list', { name: 'Open mistakes from earlier classes' });
    expect(within(list).getByText('67:2 word 4')).toBeTruthy();
    expect(screen.queryByText(/67:3/)).toBeNull();
    expect(screen.queryByText('Qaida 3.2')).toBeNull();
    expect(screen.getByRole('tab', { name: /Earlier classes/ }).textContent).toContain('1');

    await userEvent.click(screen.getByRole('button', { name: 'Still wrong: 67:2 word 4' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith(`/classes/${CID}/mistakes`))).toBe(true));
    const posted = api.calls.find((c) => c.method === 'POST' && c.url.endsWith(`/classes/${CID}/mistakes`))!;
    expect(posted.body).toEqual({ studentId: SID, surah: 67, ayah: 2, wordIndex: 3, type: 'TAJWEED_RULE' });

    await userEvent.click(screen.getByRole('button', { name: 'Fixed: 67:2 word 4' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/mistakes/old/resolve'))).toBe(true));
  });

  it('Go to looks up the Madani page, highlights the word and closes the window', async () => {
    const onGoTo = vi.fn();
    const onClose = vi.fn();
    const api = mockApi({
      ...classRoute,
      [`GET /students/${SID}/mistakes`]: { body: envelope(history) },
      'GET /mushaf/page-of': { body: envelope({ surah: 67, ayah: 2, page: 562 }) },
    });
    renderWithProviders(<Window onGoTo={onGoTo} onClose={onClose} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Go to 67:2 word 4' }));
    await waitFor(() => expect(onGoTo).toHaveBeenCalledWith({ page: 562, position: { surah: 67, ayah: 2, wordIndex: 3 } }));
    expect(onClose).toHaveBeenCalled();
    expect(api.calls.some((c) => c.url.includes('/mushaf/page-of?surah=67&ayah=2'))).toBe(true);
  });

  it('non-Mushaf courses list item mistakes with Fixed and Still wrong but no Go to', async () => {
    mockApi({ ...classRoute, [`GET /students/${SID}/mistakes`]: { body: envelope(history) } });
    renderWithProviders(<Window mushaf={false} onGoTo={vi.fn()} />);
    await screen.findByText('Qaida 3.2');
    expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fixed: Qaida 3.2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Still wrong: Qaida 3.2' })).toBeTruthy();
  });

  it('the family reads the same list, read-only, with a Read link that opens a new tab', async () => {
    mockApi({ ...classRoute, [`GET /students/${SID}/mistakes`]: { body: envelope(history) } });
    renderWithProviders(<Window viewer="family" />);
    expect(screen.getByRole('tab', { name: /Earlier classes — practise these/ })).toBeTruthy();
    const list = await screen.findByRole('list', { name: 'Open mistakes from earlier classes' });
    expect(within(list).queryByRole('button')).toBeNull();
    const read = within(list).getByRole('link', { name: 'Read 67:2 word 4' });
    expect(read.getAttribute('target')).toBe('_blank');
    expect(read.getAttribute('href')).toBe(`/parent/quran?surah=67&ayah=2&marks=1&student=${SID}`);
  });

  it(`pages the list ${MISTAKES_PAGE_SIZE} at a time, newest first`, async () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      mistake({ id: `m${i}`, surah: 2, ayah: i + 1, wordIndex: 0, occurredAt: `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00Z` }),
    );
    mockApi({ ...classRoute, [`GET /students/${SID}/mistakes`]: { body: envelope(many) } });
    renderWithProviders(<Window viewer="family" />);
    const list = await screen.findByRole('list', { name: 'Open mistakes from earlier classes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(MISTAKES_PAGE_SIZE);
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('2:11');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(within(screen.getByRole('list', { name: 'Open mistakes from earlier classes' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('Make practice from mistakes posts the computed passage', async () => {
    const api = mockApi({
      ...classRoute,
      [`GET /students/${SID}/mistakes`]: { body: envelope(history) },
      'POST /practice-assignments': (c) => ({ status: 201, body: envelope({ id: 'p1', ...(c.body as object) }) }),
    });
    renderWithProviders(<Window />);
    const button = await screen.findByRole('button', { name: /Make practice from mistakes/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/practice-assignments'))).toBe(true));
    const body = api.calls.find((c) => c.url.endsWith('/practice-assignments'))!.body as Record<string, unknown>;
    expect(body).toMatchObject({ studentId: SID, fromSurah: 67, fromAyah: 2, toSurah: 67, toAyah: 3, mode: 'READING', targetMinutes: 15 });
    expect(await screen.findByRole('link', { name: /Practice set: Surah 67:2–3/ })).toBeTruthy();
  });
});
