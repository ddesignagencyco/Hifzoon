// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

import {
  CONSENT_MISSING_COPY,
  filterPractice,
  PassageText,
  PracticeReviewScreen,
  PracticeWorkspace,
  reviewLine,
} from '@/components/practice/Practice';
import {
  passageAyahs,
  sessionStatus,
  timerMinutes,
  type PracticeAssignment,
  type PracticeSessionRow,
} from '@/lib/api/modules/practice';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const WORDS = ['قُلْ', 'هُوَ', 'ٱللَّهُ', 'أَحَدٌ'].map((text, index) => ({
  index,
  text,
  tajweedRules: [],
  translation: ['Say', 'He', 'Allah', 'One'][index],
}));

/** Every ayah answers with the same four words, so the passage renders without a network. */
const QURAN = {
  'GET /mushaf/ayah-words': {
    body: envelope({ surah: 112, ayah: 1, words: WORDS, licensed: true, source: 'quran_foundation' }),
  },
  'GET /practice-assignments/pa-1/reference-audio': {
    body: envelope({ available: false, truncated: false, ayahs: [] }),
  },
};

const ASSIGNMENT: PracticeAssignment = {
  id: 'pa-1',
  studentId: 'st-1',
  fromSurah: 112,
  fromAyah: 1,
  toSurah: 112,
  toAyah: 4,
  mode: 'MEMORISATION',
  targetMinutes: 30,
  dueOn: null,
  status: 'IN_PROGRESS',
  createdAt: '2026-11-01T00:00:00Z',
  student: { id: 'st-1', displayName: 'Demo' },
  teacher: { id: 't-1', user: { name: 'QA Teacher' } },
  minutesDone: 5,
  sessionCount: 1,
  lastPractisedAt: null,
  overdue: false,
  awaitingReview: 0,
  lastReview: { at: '2026-11-05T12:00:00Z', by: 'QA Teacher' },
};

const REVIEWED: PracticeSessionRow = {
  id: 'ps-1',
  startedAt: '2026-11-05T10:00:00Z',
  endedAt: '2026-11-05T10:05:00Z',
  minutes: 5,
  wordsRecited: 0,
  revealsCount: 2,
  audioDeleteAfter: null,
  resultSummary: { note: 'Your teacher will listen and reply.' },
  hasAudio: false,
  audioUrl: null,
  reviewedAt: '2026-11-05T12:00:00Z',
  feedback: 'Lovely. Watch the qalqalah.',
  reviewedBy: { name: 'QA Teacher' },
  marks: [
    { id: 'm1', surah: 112, ayah: 1, wordIndex: 3, type: 'TAJWEED_RULE', note: null, resolvedAt: null },
  ],
};

describe('practice helpers', () => {
  it('lists ayahs across surahs and rounds timer seconds up to whole minutes', () => {
    expect(passageAyahs({ fromSurah: 113, fromAyah: 4, toSurah: 114, toAyah: 2 }).ayahs).toEqual([
      { surah: 113, ayah: 4 },
      { surah: 113, ayah: 5 },
      { surah: 114, ayah: 1 },
      { surah: 114, ayah: 2 },
    ]);
    expect(timerMinutes(1)).toBe(1);
    expect(timerMinutes(60)).toBe(1);
    expect(timerMinutes(61)).toBe(2);
    expect(timerMinutes(5 * 3600)).toBe(180);
  });

  it('says who reviewed, or that the teacher has not yet', () => {
    expect(reviewLine(ASSIGNMENT)).toBe('Reviewed by QA Teacher');
    expect(reviewLine({ awaitingReview: 2, lastReview: null })).toBe('Waiting for teacher');
    expect(reviewLine({ awaitingReview: 0, lastReview: null })).toBeNull();
    // Only prepare sessions so far: practised, nothing waits for the teacher.
    expect(reviewLine({ awaitingReview: 0, lastReview: null, sessionCount: 3 })).toBe('Practised');
  });

  it('a session without a recording is practised; a recitation waits, then is reviewed', () => {
    const base = { hasAudio: false, audioDeleteAfter: null, reviewedAt: null };
    expect(sessionStatus(base)).toBe('practised');
    expect(sessionStatus({ ...base, kind: 'PREPARE' })).toBe('practised');
    expect(sessionStatus({ ...base, hasAudio: true })).toBe('waiting');
    expect(sessionStatus({ ...base, kind: 'RECITATION' })).toBe('waiting');
    // Audio deleted after 30 days: still a reviewed recitation.
    expect(
      sessionStatus({ ...base, audioDeleteAfter: '2026-10-01T00:00:00Z', reviewedAt: '2026-09-05T00:00:00Z' }),
    ).toBe('reviewed');
  });

  it('filters the list by child, review status and due date', () => {
    const waiting = { ...ASSIGNMENT, id: 'pa-2', studentId: 'st-2', awaitingReview: 1, dueOn: null };
    const rows = [ASSIGNMENT, waiting];
    const base = { child: 'all', status: 'all', due: 'any' } as const;
    expect(filterPractice(rows, { ...base, child: 'st-2' }).map((r) => r.id)).toEqual(['pa-2']);
    expect(filterPractice(rows, { ...base, status: 'waiting' }).map((r) => r.id)).toEqual(['pa-2']);
    expect(filterPractice(rows, { ...base, status: 'reviewed' }).map((r) => r.id)).toEqual(['pa-1']);
    expect(filterPractice(rows, { ...base, due: 'week' })).toEqual([]);
  });
});

describe('passage text', () => {
  it('renders each ayah in the Quran font with its number, marks and meanings', async () => {
    mockApi(QURAN);
    renderWithProviders(
      <PassageText range={ASSIGNMENT} marks={REVIEWED.marks} meaning="en" audio={false} />,
    );
    expect(await screen.findAllByText('ٱللَّهُ')).toHaveLength(4);
    expect(screen.getByTestId('ayah-112:1')).toBeTruthy();
    expect(screen.getByTestId('ayah-112:4')).toBeTruthy();
    // Ayah markers in Arabic-Indic digits.
    expect(screen.getByText('﴿٤﴾')).toBeTruthy();
    // The teacher's mark is highlighted with its type.
    const marked = screen.getByLabelText('أَحَدٌ, Tajweed rule');
    expect(marked.getAttribute('data-marked')).toBe('TAJWEED_RULE');
    expect(screen.getAllByText('Allah').length).toBeGreaterThan(0);
  });

  it('pages a long passage ten ayahs at a time', async () => {
    mockApi(QURAN);
    renderWithProviders(
      <PassageText range={{ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 25 }} audio={false} />,
    );
    expect(await screen.findByText('Ayahs 1–10 of 25')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Ayahs 11–20 of 25')).toBeTruthy();
    expect(screen.getByTestId('ayah-2:11')).toBeTruthy();
  });
});

describe('practice workspace', () => {
  it('test myself hides the words, counts each reveal and sends the count with the session', async () => {
    const api = mockApi({
      ...QURAN,
      'POST /practice-sessions': { body: envelope({ assignmentStatus: 'IN_PROGRESS', minutesDone: 7 }) },
      'GET /practice-assignments': { body: envelope([]) },
    });
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[]} />);
    await screen.findAllByText('ٱللَّهُ');

    fireEvent.click(screen.getByRole('button', { name: 'Test myself' }));
    const blanks = screen.getAllByRole('button', { name: 'Hidden word, tap to show' });
    expect(blanks).toHaveLength(16);
    expect(screen.queryByText('ٱللَّهُ')).toBeNull();

    fireEvent.click(blanks[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hidden word, tap to show' })[3]);
    expect(screen.getByText('2 words peeked')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Hidden word, tap to show' })).toHaveLength(14);

    // Hide all covers the words again but keeps the count; Show all ends the test.
    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    expect(screen.getAllByRole('button', { name: 'Hidden word, tap to show' })).toHaveLength(16);
    expect(screen.getByText('2 words peeked')).toBeTruthy();

    // Log through the manual fallback: the reveals go with the session.
    fireEvent.click(screen.getByText('Enter minutes by hand instead'));
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log minutes' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.method === 'POST' && c.url.endsWith('/practice-sessions'));
      expect(call?.body).toEqual({ assignmentId: 'pa-1', minutes: 7, revealsCount: 2 });
    });
  }, 20_000);

  it('the timer logs the real time practised, rounded up, on Finish', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockApi({
      ...QURAN,
      'POST /practice-sessions': { body: envelope({ assignmentStatus: 'IN_PROGRESS', minutesDone: 7 }) },
      'GET /practice-assignments': { body: envelope([]) },
    });
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const shown = screen.getByLabelText(/^Practice time/).textContent ?? '';
    // 90 s plus whatever real time passed: rounded up to 2 minutes either way.
    expect(shown.startsWith('1:3')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Finish and log 2 min/ }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.method === 'POST' && c.url.endsWith('/practice-sessions'));
      expect(call?.body).toEqual({ assignmentId: 'pa-1', minutes: 2, revealsCount: 0 });
    });
  }, 20_000);

  it('shows the teacher reply and highlights the marked words, with no AI wording', async () => {
    mockApi(QURAN);
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[REVIEWED]} />);
    expect(await screen.findByText('Lovely. Watch the qalqalah.')).toBeTruthy();
    expect(screen.getByText('Reviewed')).toBeTruthy();
    expect(screen.getAllByText(/Your teacher will listen and reply/).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('أَحَدٌ, Tajweed rule')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bAI\b|automatic/i);
  }, 20_000);
});

describe('two steps: prepare and recite', () => {
  const PREPARED: PracticeSessionRow = {
    ...REVIEWED,
    id: 'ps-prep',
    kind: 'PREPARE',
    reviewedAt: null,
    feedback: null,
    reviewedBy: null,
    marks: [],
  };

  it('shows 1. Prepare and 2. Recite to your teacher, and a prepare session reads Practised', async () => {
    mockApi({
      ...QURAN,
      'GET /practice-assignments/pa-1/recording-allowed': { body: envelope({ allowed: true }) },
    });
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[PREPARED]} />);
    expect(screen.getByRole('heading', { name: '1. Prepare' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2. Recite to your teacher' })).toBeTruthy();
    expect(screen.getByText(/Your teacher doesn't review this part/)).toBeTruthy();
    expect(screen.getByText('Practised')).toBeTruthy();
    expect(screen.queryByText('Waiting for teacher')).toBeNull();
    // Send needs a recording first.
    expect(screen.queryByRole('button', { name: /Send to teacher/ })).toBeNull();
  }, 20_000);

  it('Prepare Finish logs minutes and reveals with no audio', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockApi({
      ...QURAN,
      'GET /practice-assignments/pa-1/recording-allowed': { body: envelope({ allowed: true }) },
      'POST /practice-sessions': { body: envelope({ assignmentStatus: 'IN_PROGRESS', minutesDone: 6 }) },
      'GET /practice-assignments': { body: envelope([]) },
    });
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /Finish and log 1 min/ }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.method === 'POST' && c.url.endsWith('/practice-sessions'));
      expect(call?.body).toEqual({ assignmentId: 'pa-1', minutes: 1, revealsCount: 0 });
    });
    expect(api.calls.some((c) => c.url.includes('/upload-url'))).toBe(false);
  }, 20_000);

  it('without recording consent, a parent gets a link to allow it', async () => {
    mockApi({
      ...QURAN,
      'GET /practice-assignments/pa-1/recording-allowed': { body: envelope({ allowed: false }) },
    });
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[]} viewer="parent" />);
    expect(await screen.findByText(CONSENT_MISSING_COPY)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Allow practice recordings' });
    expect(link.getAttribute('href')).toBe('/parent/children/st-1?tab=consent');
    expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull();
  }, 20_000);

  it('without recording consent, a student is told to ask their parent', async () => {
    mockApi({
      ...QURAN,
      'GET /practice-assignments/pa-1/recording-allowed': { body: envelope({ allowed: false }) },
    });
    renderWithProviders(<PracticeWorkspace assignment={ASSIGNMENT} sessions={[]} viewer="student" />);
    expect(await screen.findByText(CONSENT_MISSING_COPY)).toBeTruthy();
    expect(screen.getByText('Ask your parent.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Allow practice recordings' })).toBeNull();
  }, 20_000);

  it('the teacher opening a prepare session is told there is nothing to review', async () => {
    mockApi({
      ...QURAN,
      'GET /practice-sessions/ps-prep': {
        body: envelope({ session: PREPARED, assignment: ASSIGNMENT, canReview: true }),
      },
    });
    renderWithProviders(<PracticeReviewScreen sessionId="ps-prep" />);
    expect(await screen.findByText('This was a practice session; nothing to review.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
    expect(screen.queryByText(/No recording with this session/)).toBeNull();
  }, 20_000);
});

describe('teacher review screen', () => {
  it('marks a tapped word with a type and sends it with the feedback', async () => {
    const api = mockApi({
      ...QURAN,
      'GET /practice-sessions/ps-2': {
        body: envelope({
          session: {
            ...REVIEWED,
            id: 'ps-2',
            kind: 'RECITATION',
            hasAudio: true,
            audioUrl: 'https://audio.test/rec.webm',
            reviewedAt: null,
            feedback: null,
            reviewedBy: null,
            marks: [],
          },
          assignment: ASSIGNMENT,
          canReview: true,
        }),
      },
      'POST /practice-sessions/ps-2/review': {
        body: envelope({ id: 'ps-2', reviewedAt: '2026-11-06T09:00:00Z', feedback: 'Good', added: 1 }),
      },
    });
    renderWithProviders(<PracticeReviewScreen sessionId="ps-2" />);
    const words = await screen.findAllByRole('button', { name: 'هُوَ' });
    fireEvent.click(words[1]); // 112:2, word 2
    fireEvent.click(screen.getByRole('button', { name: 'Skipped word' }));
    expect(screen.getByText('112:2 word 2: Skipped word')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'هُوَ, chosen' })).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/Feedback for the family/), { target: { value: 'Good' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => {
      const call = api.calls.find((c) => c.method === 'POST' && c.url.includes('/review'));
      expect(call?.body).toEqual({
        feedback: 'Good',
        mistakes: [{ surah: 112, ayah: 2, wordIndex: 1, type: 'SKIPPED_WORD' }],
      });
    });
  }, 20_000);
});
