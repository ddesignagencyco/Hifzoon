// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { chooseOption, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

import {
  AssignPracticeButton,
  PracticeList,
  PracticeReviewScreen,
  PracticeWorkspace,
  practiceSources,
} from '@/components/practice/Practice';
import { practiceTitle, type PracticeAssignment } from '@/lib/api/modules/practice';
import { boardPracticeFromMistakes, boardRefOfMistake, NO_BOARD_AUDIO } from '@/lib/board-practice';
import type { DuaCollection } from '@/lib/api/modules/duas';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DUAS: DuaCollection = {
  source: { name: 'Hisn al-Muslim', author: 'al-Qahtani', url: 'https://hisnmuslim.com', languages: ['ar', 'en'], importedAt: '2026-11-06' },
  categories: [
    {
      id: 1,
      title: 'Supplications for when you wake up',
      titleAr: 'أذكار الاستيقاظ من النوم',
      duas: [
        {
          id: 1,
          title: 'Supplications for when you wake up (1)',
          arabic: 'الْحَمْدُ للَّهِ الَّذِي أَحْيَانَا',
          transliteration: 'Alhamdu lillahil-lathee ahyana',
          translation: { en: 'All praise is for Allah who gave us life' },
          repeat: 1,
          reference: 'Hisn al-Muslim 1',
        },
        {
          id: 2,
          title: 'Supplications for when you wake up (2)',
          arabic: 'لَا إِلَهَ إِلَّا اللَّهُ',
          transliteration: 'La ilaha illallah',
          translation: { en: 'None has the right to be worshipped but Allah' },
          repeat: 1,
          reference: 'Hisn al-Muslim 2',
        },
      ],
    },
    {
      id: 68,
      title: 'Before eating',
      titleAr: 'الدعاء قبل الطعام',
      duas: [
        {
          id: 180,
          title: 'Before eating',
          arabic: 'بِسْمِ اللَّهِ',
          transliteration: 'Bismillah',
          translation: { en: 'In the name of Allah' },
          repeat: 1,
          reference: 'Hisn al-Muslim 180',
        },
      ],
    },
  ],
};

const BASE: PracticeAssignment = {
  id: 'pa-9',
  studentId: 'st-1',
  fromSurah: null,
  fromAyah: null,
  toSurah: null,
  toAyah: null,
  board: 'DUAS',
  boardLesson: 68,
  boardItem: null,
  label: 'Before eating',
  mode: 'MEMORISATION',
  targetMinutes: 20,
  dueOn: null,
  status: 'ASSIGNED',
  createdAt: '2026-11-06T00:00:00Z',
  student: { id: 'st-1', displayName: 'Demo' },
  teacher: { id: 't-1', user: { name: 'QA Teacher' } },
  minutesDone: 0,
  sessionCount: 0,
  lastPractisedAt: null,
  overdue: false,
  awaitingReview: 0,
  lastReview: null,
};

const QAIDA: PracticeAssignment = {
  ...BASE,
  id: 'pa-10',
  board: 'QAIDA',
  boardLesson: 3,
  label: 'Huroof muqattaʿat',
  mode: 'READING',
};

const RANGE: PracticeAssignment = {
  ...BASE,
  id: 'pa-11',
  fromSurah: 67,
  fromAyah: 1,
  toSurah: 67,
  toAyah: 10,
  board: null,
  boardLesson: null,
  label: null,
};

describe('list labels', () => {
  it('names a range by surah, a dua and a Qaida lesson by their titles', () => {
    expect(practiceTitle(RANGE)).toBe('Surah 67:1–10');
    expect(practiceTitle(BASE)).toBe('Duas: Before eating');
    expect(practiceTitle(QAIDA)).toBe('Qaida: Lesson 3 — Huroof muqattaʿat');
  });

  it('the Assigned practice table shows the label in the Passage column', async () => {
    mockApi({ 'GET /practice-assignments': { body: envelope([BASE, QAIDA, RANGE]) } });
    renderWithProviders(<PracticeList practiceHref={(a) => `/parent/practice/${a.id}`} />);
    expect(await screen.findByText('Duas: Before eating')).toBeTruthy();
    expect(screen.getByText('Qaida: Lesson 3 — Huroof muqattaʿat')).toBeTruthy();
    expect(screen.getByText('Surah 67:1–10')).toBeTruthy();
    expect(screen.queryByText(/Surah\s*$/)).toBeNull();
  });
});

describe('teacher Set practice form', () => {
  it('offers the board for a Duas or Qaida course, the Mushaf for the rest', () => {
    expect(practiceSources(['DUAS'])).toEqual(['DUAS']);
    expect(practiceSources(['QAIDA', 'HIFZ'])).toEqual(['QAIDA', 'QURAN']);
    expect(practiceSources(['HIFZ'])).toEqual(['QURAN']);
    expect(practiceSources([])).toEqual(['QURAN']);
  });

  it('a Duas student gets a dua chapter and optional dua instead of surah/ayah, Memorisation by default', async () => {
    mockApi({ 'GET /content/duas': { body: envelope(DUAS) } });
    renderWithProviders(<AssignPracticeButton studentId="st-1" studentName="Demo" courseTypes={['DUAS']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set practice' }));
    expect(await screen.findByText('Dua chapter')).toBeTruthy();
    expect(screen.getByText('One dua')).toBeTruthy();
    expect(screen.queryByText('From surah')).toBeNull();
    expect(screen.getByText('Memorisation')).toBeTruthy();
  });

  it('a Qaida student gets a lesson picker, Reading by default', () => {
    mockApi({});
    renderWithProviders(<AssignPracticeButton studentId="st-1" courseTypes={['QAIDA']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set practice' }));
    expect(screen.getByText('Qaida lesson')).toBeTruthy();
    expect(screen.queryByText('From surah')).toBeNull();
    expect(screen.getByText('Reading')).toBeTruthy();
  });

  it('a Hifz student keeps the surah and ayah fields', () => {
    mockApi({});
    renderWithProviders(<AssignPracticeButton studentId="st-1" courseTypes={['HIFZ']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set practice' }));
    expect(screen.getByText('From surah')).toBeTruthy();
    expect(screen.queryByText('Dua chapter')).toBeNull();
  });

  it('switching the source of a mixed student swaps the fields and the default kind', async () => {
    mockApi({});
    renderWithProviders(<AssignPracticeButton studentId="st-1" courseTypes={['QAIDA', 'NAZRA']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set practice' }));
    expect(screen.getByText('Qaida lesson')).toBeTruthy();
    await chooseOption(screen.getByLabelText('Practise from'), 'Quran passage');
    await waitFor(() => expect(screen.getByText('From surah')).toBeTruthy());
    expect(screen.queryByText('Qaida lesson')).toBeNull();
    expect(screen.getByText('Memorisation')).toBeTruthy();
  });
});

describe('practice screen for a dua', () => {
  it('Prepare shows the dua (Arabic, transliteration, meaning), no qari audio, and Test myself hides the Arabic', async () => {
    mockApi({ 'GET /content/duas': { body: envelope(DUAS) } });
    renderWithProviders(<PracticeWorkspace assignment={BASE} sessions={[]} />);
    expect(await screen.findByText('بِسْمِ اللَّهِ')).toBeTruthy();
    expect(screen.getByText('Bismillah')).toBeTruthy();
    expect(screen.getByText('In the name of Allah')).toBeTruthy();
    expect(screen.getByText(NO_BOARD_AUDIO)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Play ayah/ })).toBeNull();
    expect(screen.queryByLabelText('Word meanings')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Test myself' }));
    expect(screen.queryByText('بِسْمِ اللَّهِ')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /tap to check/ }));
    expect(screen.getByText('بِسْمِ اللَّهِ')).toBeTruthy();
    expect(screen.getByText('1 word peeked')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2. Recite to your teacher' })).toBeTruthy();
  });

  it('a whole chapter shows every dua of it', async () => {
    mockApi({ 'GET /content/duas': { body: envelope(DUAS) } });
    renderWithProviders(
      <PracticeWorkspace assignment={{ ...BASE, boardLesson: 1, label: DUAS.categories[0].title }} sessions={[]} />,
    );
    expect(await screen.findByText('Alhamdu lillahil-lathee ahyana')).toBeTruthy();
    expect(screen.getByText('La ilaha illallah')).toBeTruthy();
  });

  it('a Qaida lesson shows its tiles read-only', () => {
    mockApi({});
    renderWithProviders(<PracticeWorkspace assignment={QAIDA} sessions={[]} />);
    const tiles = screen.getAllByRole('button', { name: /^Item \d+$/ });
    expect(tiles.length).toBeGreaterThan(5);
    expect((tiles[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(NO_BOARD_AUDIO)).toBeTruthy();
  });
});

describe('teacher review of a dua recitation', () => {
  it('taps a dua word, picks a Duas category and sends it as an item mark', async () => {
    const api = mockApi({
      'GET /content/duas': { body: envelope(DUAS) },
      'GET /students/st-1/mistakes': { body: envelope([]) },
      'GET /practice-sessions/ps-9': {
        body: envelope({
          session: {
            id: 'ps-9',
            kind: 'RECITATION',
            startedAt: '2026-11-06T10:00:00Z',
            endedAt: '2026-11-06T10:02:00Z',
            minutes: 2,
            wordsRecited: 0,
            revealsCount: 0,
            audioDeleteAfter: '2026-12-06T10:00:00Z',
            resultSummary: null,
            hasAudio: true,
            audioUrl: 'https://audio.test/rec.webm',
            reviewedAt: null,
            feedback: null,
            reviewedBy: null,
            marks: [],
          },
          assignment: BASE,
          canReview: true,
        }),
      },
      'POST /practice-sessions/ps-9/review': {
        body: envelope({ id: 'ps-9', reviewedAt: '2026-11-06T11:00:00Z', feedback: 'Good', added: 1 }),
      },
    });
    renderWithProviders(<PracticeReviewScreen sessionId="ps-9" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Word 2: اللَّهِ' }));
    // Duas categories, not the recitation ones.
    expect(screen.queryByRole('button', { name: 'Skipped word' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Memory / recall' }));
    expect(screen.getByText('Before eating · word 2 (اللَّهِ): Memory / recall')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.method === 'POST' && c.url.includes('/review'));
      expect(call?.body).toEqual({
        feedback: '',
        mistakes: [{ itemRef: 'Before eating · word 2 (اللَّهِ)', type: 'MEMORY' }],
      });
    });
  }, 20_000);
});

describe('practice from board mistakes', () => {
  const m = (itemRef: string, occurredAt: string) => ({
    id: itemRef + occurredAt,
    surah: null,
    ayah: null,
    wordIndex: null,
    itemRef,
    type: 'MEMORY',
    confirmed: true,
    dismissedAt: null,
    resolvedAt: null,
    occurredAt,
    classId: null,
  });

  it('maps class item references back to the board', () => {
    expect(boardRefOfMistake('QAIDA', 'Tanween: بً', null)).toEqual({ lesson: 5, item: null });
    expect(boardRefOfMistake('DUAS', 'Supplications for when you wake up (2) · word 1 (لَا)', DUAS.categories)).toEqual({
      lesson: 1,
      item: 1,
    });
    expect(boardRefOfMistake('DUAS', 'Before eating', DUAS.categories)).toEqual({ lesson: 68, item: 0 });
  });

  it('picks the dua chapter with the most open mistakes, narrowing to one dua when all are on it', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const rows = [
      m('Before eating · word 1 (بِسْمِ)', '2026-11-01T00:00:00Z'),
      m('Supplications for when you wake up (1)', '2026-11-02T00:00:00Z'),
      m('Supplications for when you wake up (2) · word 2 (إِلَهَ)', '2026-11-03T00:00:00Z'),
    ];
    expect(boardPracticeFromMistakes('st-1', 'DUAS', rows, DUAS.categories, now)).toMatchObject({
      board: 'DUAS',
      boardLesson: 1,
      mode: 'MEMORISATION',
      targetMinutes: 15,
    });
    expect(boardPracticeFromMistakes('st-1', 'DUAS', rows, DUAS.categories, now)?.boardItem).toBeUndefined();
    expect(boardPracticeFromMistakes('st-1', 'DUAS', rows.slice(0, 1), DUAS.categories, now)).toMatchObject({
      boardLesson: 68,
      boardItem: 0,
    });
    expect(
      boardPracticeFromMistakes('st-1', 'QAIDA', [m('Tanween: بً', '2026-11-01T00:00:00Z')], null, now),
    ).toMatchObject({ board: 'QAIDA', boardLesson: 5, mode: 'READING' });
    expect(boardPracticeFromMistakes('st-1', 'QAIDA', [], null, now)).toBeNull();
  });
});
