// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { mistakesInPassage, splitOpenMistakes, type MistakeLike } from '@/lib/mistakes-practice';
import { MistakesModal } from '@/components/classroom/MistakesModal';
import { FIXED_NOTE_COPY, OpenMistakesInPassage } from '@/components/practice/OpenMistakesInPassage';
import { PracticeReviewScreen } from '@/components/practice/Practice';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SID = 'student-1';
const CID = 'class-now';

function mistake(over: Partial<MistakeLike> & { id: string }): MistakeLike & Record<string, unknown> {
  return {
    surah: 112,
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

/** A route table whose mistakes follow the resolve / reopen calls, like the API. */
function resolvable(rows: Array<Record<string, unknown>>) {
  const state = rows.map((r) => ({ ...r }));
  const routes: Record<string, (c: { url: string }) => { body: unknown }> = {};
  for (const r of state) {
    routes[`POST /mistakes/${r.id as string}/resolve`] = () => {
      r.resolvedAt = '2026-11-06T10:00:00Z';
      return { body: envelope({ id: r.id, resolvedAt: r.resolvedAt }) };
    };
    routes[`POST /mistakes/${r.id as string}/reopen`] = () => {
      r.resolvedAt = null;
      return { body: envelope({ id: r.id, resolvedAt: null }) };
    };
  }
  return { state, routes };
}

describe('mistakesInPassage', () => {
  const rows = [
    mistake({ id: 'in-1', surah: 112, ayah: 2, occurredAt: '2026-11-03T10:00:00Z' }),
    mistake({ id: 'in-2', surah: 112, ayah: 4, occurredAt: '2026-11-02T10:00:00Z' }),
    mistake({ id: 'out', surah: 113, ayah: 1 }),
    mistake({ id: 'before', surah: 111, ayah: 5 }),
    mistake({ id: 'resolved', surah: 112, ayah: 3, resolvedAt: '2026-11-05T10:00:00Z' }),
    mistake({ id: 'dismissed', surah: 112, ayah: 3, dismissedAt: '2026-11-05T10:00:00Z' }),
    mistake({ id: 'qaida', surah: null, ayah: null, wordIndex: null, itemRef: 'Qaida 3' }),
  ];

  it('keeps open Mushaf mistakes inside the range, oldest first', () => {
    const got = mistakesInPassage(rows, { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 4 });
    expect(got.map((m) => m.id)).toEqual(['in-2', 'in-1']);
  });

  it('crosses surahs by surah:ayah order', () => {
    const got = mistakesInPassage(rows, { fromSurah: 111, fromAyah: 5, toSurah: 113, toAyah: 1 });
    expect(got.map((m) => m.id).sort()).toEqual(['before', 'in-1', 'in-2', 'out']);
  });

  it('without a surah range, lists every open mistake', () => {
    expect(mistakesInPassage(rows, null).map((m) => m.id).sort()).toEqual(['before', 'in-1', 'in-2', 'out', 'qaida']);
  });

  it('a mistake fixed in the same class leaves Mistakes to practise', () => {
    const sameClass = [
      mistake({ id: 'fixed-here', classId: CID, resolvedAt: '2026-11-06T10:00:00Z' }),
      mistake({ id: 'still-open', classId: CID }),
    ];
    expect(splitOpenMistakes(sameClass).mushaf.map((m) => m.id)).toEqual(['still-open']);
  });
});

describe('Mistakes window — This class', () => {
  const students = [{ studentId: SID, displayName: 'Demo' }];
  const render = (viewer: 'teacher' | 'family') =>
    renderWithProviders(
      <MistakesModal
        open
        onClose={vi.fn()}
        classId={CID}
        viewer={viewer}
        students={students}
        mushaf
        board={null}
        tab="class"
        onTabChange={vi.fn()}
      />,
    );

  it('teacher: Mark fixed resolves a mistake, shows Fixed (listed last), and Undo reopens it', async () => {
    const { state, routes } = resolvable([
      { ...mistake({ id: 'm1', surah: 112, ayah: 2, wordIndex: 1, classId: CID, occurredAt: '2026-11-06T10:05:00Z' }), studentId: SID },
      { ...mistake({ id: 'm2', surah: 112, ayah: 3, wordIndex: 0, classId: CID, occurredAt: '2026-11-06T10:01:00Z' }), studentId: SID },
    ]);
    const api = mockApi({
      ...routes,
      [`GET /classes/${CID}/mistakes`]: () => ({ body: envelope(state) }),
      [`GET /students/${SID}/mistakes`]: { body: envelope([]) },
    });
    const { queryClient } = render('teacher');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(await screen.findByRole('button', { name: 'Fixed: 112:2 word 2' }));
    expect(await screen.findByRole('button', { name: 'Undo fixed: 112:2 word 2' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Mistakes logged in this class' });
    expect(within(list).getByText('Fixed')).toBeTruthy();
    // Open ones first: the fixed m1 now sits below m2.
    expect(within(list).getAllByRole('listitem')[1].textContent).toContain('112:2 word 2');
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/mistakes/m1/resolve'))).toBe(true);
    // The family's Mistakes to practise and the class / student lists refresh.
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["mistakes"]', `["parent","mistakes","${SID}"]`]));

    fireEvent.click(screen.getByRole('button', { name: 'Undo fixed: 112:2 word 2' }));
    expect(await screen.findByRole('button', { name: 'Fixed: 112:2 word 2' })).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/mistakes/m1/reopen'))).toBe(true);
    expect(within(list).queryByText('Fixed')).toBeNull();
  });

  it('family: read-only, Fixed badges shown, a Read link per Mushaf mistake', async () => {
    mockApi({
      [`GET /classes/${CID}/mistakes`]: {
        body: envelope([
          { ...mistake({ id: 'm1', surah: 112, ayah: 2, wordIndex: 1, classId: CID, resolvedAt: '2026-11-06T10:09:00Z' }), studentId: SID },
        ]),
      },
      [`GET /students/${SID}/mistakes`]: { body: envelope([]) },
    });
    render('family');
    const list = await screen.findByRole('list', { name: 'Mistakes logged in this class' });
    expect(within(list).getByText('Fixed')).toBeTruthy();
    expect(within(list).queryByRole('button')).toBeNull();
    expect(within(list).getByRole('link', { name: 'Read 112:2 word 2' }).getAttribute('target')).toBe('_blank');
  });
});

describe('OpenMistakesInPassage (practice review)', () => {
  const range = { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 4 };

  it('lists open mistakes in the passage; Fixed ✓ resolves, Still wrong keeps it open', async () => {
    const { state, routes } = resolvable([
      mistake({ id: 'm1', surah: 112, ayah: 2, wordIndex: 1 }),
      mistake({ id: 'm2', surah: 112, ayah: 3, wordIndex: 0 }),
      mistake({ id: 'out', surah: 2, ayah: 255, wordIndex: 0 }),
      mistake({ id: 'this-session', surah: 112, ayah: 4, wordIndex: 2 }),
    ]);
    const api = mockApi({ ...routes, [`GET /students/${SID}/mistakes`]: () => ({ body: envelope(state) }) });
    renderWithProviders(<OpenMistakesInPassage studentId={SID} range={range} excludeIds={['this-session']} />);

    expect(screen.getByText(FIXED_NOTE_COPY)).toBeTruthy();
    const list = await screen.findByRole('list', { name: 'Open mistakes in this passage' });
    expect(within(list).getByText('112:2 word 2')).toBeTruthy();
    expect(within(list).getByText('112:3 word 1')).toBeTruthy();
    expect(within(list).queryByText('2:255 word 1')).toBeNull();
    expect(within(list).queryByText('112:4 word 3')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Still wrong: 112:3 word 1' }));
    // The badge, besides each row's button.
    expect(within(list).getAllByText('Still wrong')).toHaveLength(3);
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Fixed: 112:2 word 2' }));
    // Still listed after the refetch, now Fixed with an Undo.
    expect(await screen.findByRole('button', { name: 'Undo fixed: 112:2 word 2' })).toBeTruthy();
    expect(within(list).getByText('Fixed')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/mistakes/m1/resolve'))).toBe(true);
    await waitFor(() => expect(state[0].resolvedAt).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Undo fixed: 112:2 word 2' }));
    expect(await screen.findByRole('button', { name: 'Fixed: 112:2 word 2' })).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/mistakes/m1/reopen'))).toBe(true);
  });

  it('shows on the teacher review screen, between the passage and the feedback', async () => {
    const assignment = {
      id: 'pa-1',
      studentId: SID,
      fromSurah: 112,
      fromAyah: 1,
      toSurah: 112,
      toAyah: 4,
      mode: 'READING',
      targetMinutes: 15,
      dueOn: null,
      status: 'IN_PROGRESS',
      createdAt: '2026-11-01T00:00:00Z',
      student: { id: SID, displayName: 'Demo' },
      teacher: { id: 't-1', user: { name: 'QA Teacher' } },
      minutesDone: 5,
      sessionCount: 1,
      lastPractisedAt: null,
      overdue: false,
    };
    mockApi({
      'GET /mushaf/ayah-words': { body: envelope({ surah: 112, ayah: 1, words: [], licensed: true }) },
      'GET /practice-assignments/pa-1/reference-audio': { body: envelope({ available: false, truncated: false, ayahs: [] }) },
      'GET /practice-sessions/ps-9': {
        body: envelope({
          session: {
            id: 'ps-9',
            kind: 'RECITATION',
            startedAt: '2026-11-05T10:00:00Z',
            endedAt: '2026-11-05T10:05:00Z',
            minutes: 5,
            wordsRecited: 0,
            revealsCount: 0,
            audioDeleteAfter: null,
            resultSummary: null,
            hasAudio: true,
            audioUrl: 'https://audio.test/rec.webm',
            reviewedAt: null,
            feedback: null,
            reviewedBy: null,
            marks: [],
          },
          assignment,
          canReview: true,
        }),
      },
      [`GET /students/${SID}/mistakes`]: { body: envelope([mistake({ id: 'm1', surah: 112, ayah: 2, wordIndex: 1 })]) },
    });
    renderWithProviders(<PracticeReviewScreen sessionId="ps-9" />);
    expect(await screen.findByText('Open mistakes in this passage')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Fixed: 112:2 word 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy();
  }, 20_000);
});
