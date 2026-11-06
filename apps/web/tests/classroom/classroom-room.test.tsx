// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { findErrorToast, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { ClassroomRoom, ClassroomViewer, LessonCardButton } from '@/components/classroom/ClassroomRoom';
import { classPhase, formatClock, formatElapsed, useServerClock } from '@/components/classroom/MeetingChrome';
import type { ClassroomSnapshot } from '@/lib/api/modules/classroom';

const CID = 'class-1';
const STARTS = '2026-10-19T14:00:00.000Z';
const ENDS = '2026-10-19T14:45:00.000Z';
const at = (min: number, sec = 0) => new Date(Date.parse(STARTS) + min * 60_000 + sec * 1000).toISOString();

const TEACHER = { userId: 'u-t', displayName: 'Ustadh Hamza', role: 'TEACHER' as const, joinedAt: STARTS };
const STUDENT = { userId: 'u-s', displayName: 'Yusuf Ali', role: 'STUDENT' as const, joinedAt: STARTS };
const GUARDIAN = { userId: 'u-g', displayName: 'Umm Yusuf', role: 'GUARDIAN_VIEWER' as const, joinedAt: STARTS };

function snapshot(over: Partial<ClassroomSnapshot> = {}): ClassroomSnapshot {
  return {
    classId: CID,
    status: 'SCHEDULED',
    startsAt: STARTS,
    endsAt: ENDS,
    layout: 'MADANI_15',
    tajweedColours: false,
    page: 1,
    highlight: null,
    course: null,
    students: [],
    recording: null,
    participants: [],
    serverTime: at(5, 7),
    ...over,
  };
}

const licensedPage = {
  layout: 'MADANI_15', page: 1, lines: [{ lineNumber: 1, ayahs: [{ surah: 1, ayah: 1 }] }],
  surahStart: 1, ayahStart: 1, licensed: true, source: 'licensed-test', cachedUntil: '2026-10-20T00:00:00Z',
};

function mockRoom(snap: ClassroomSnapshot, extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    ...extra,
    [`GET /classroom/classes/${CID}/state`]: { body: envelope(snap) },
    [`GET /classroom/classes/${CID}/recording/consent`]: {
      body: envelope({ allowed: true, students: [{ studentId: 's1', displayName: 'Yusuf Ali', consented: true }], missing: [] }),
    },
    [`GET /classroom/classes/${CID}/attendance`]: {
      body: envelope({ classId: CID, participants: [], summary: { studentsPresent: 0, guardiansPresent: 0, averageMinutes: 0, stillConnected: 0 } }),
    },
    [`GET /classes/${CID}/mistakes`]: { body: envelope([]) },
    'GET /students/s1/mistakes': { body: envelope([]) },
    'GET /mushaf/layouts': { body: envelope([]) },
    'GET /mushaf/pages/MADANI_15/1': { body: envelope(licensedPage) },
    'GET /mushaf/ayah-words': {
      body: envelope({ surah: 1, ayah: 1, words: [{ index: 0, text: 'W0', tajweedRules: [] }], licensed: true, source: 'licensed-test' }),
    },
  });
}

async function renderRoom(
  snap: ClassroomSnapshot,
  viewer: ClassroomViewer = 'student',
  extra: Parameters<typeof mockApi>[0] = {},
) {
  const api = mockRoom(snap, extra);
  renderWithProviders(<ClassroomRoom classId={CID} viewer={viewer} />);
  const pill = await screen.findByTestId('class-status');
  return Object.assign(pill, { api });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('classroom status helpers', () => {
  it('derives the phase from the status and the server clock', () => {
    const now = (iso: string) => Date.parse(iso);
    expect(classPhase('SCHEDULED', STARTS, ENDS, now(at(-5)))).toBe('upcoming');
    expect(classPhase('SCHEDULED', STARTS, ENDS, now(at(5)))).toBe('live');
    expect(classPhase('SCHEDULED', STARTS, ENDS, now(at(50)))).toBe('ended');
    expect(classPhase('LIVE', STARTS, ENDS, now(at(5)))).toBe('live');
    expect(classPhase('COMPLETED', STARTS, ENDS, now(at(5)))).toBe('ended');
    expect(classPhase('CANCELLED', STARTS, ENDS, now(at(5)))).toBe('other');
  });

  it('formats elapsed time as mm:ss, then h:mm:ss', () => {
    expect(formatElapsed(-1000)).toBe('00:00');
    expect(formatElapsed(307_000)).toBe('05:07');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('the server clock ticks every second from the snapshot time', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { result } = renderHook(() => useServerClock(at(5, 7)));
    expect(result.current).toBe(Date.parse(at(5, 7)));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(Date.parse(at(5, 10)));
  });
});

describe('meeting top bar status pill', () => {
  it('before the start: "Starts at hh:mm", no timer', async () => {
    const pill = await renderRoom(snapshot({ serverTime: at(-20) }));
    expect(pill.dataset.phase).toBe('upcoming');
    expect(pill.textContent).toContain(`Starts at ${formatClock(STARTS)}`);
    expect(screen.queryByTestId('class-timer')).toBeNull();
  });

  it('in progress (still SCHEDULED after the start): "Live" with a timer from the start time', async () => {
    const pill = await renderRoom(snapshot({ serverTime: at(5, 7) }));
    expect(pill.dataset.phase).toBe('live');
    expect(pill.textContent).toContain('Live');
    expect(within(pill).getByTestId('class-timer').textContent).toBe('05:07');
  });

  it('completed: "Ended"', async () => {
    const pill = await renderRoom(snapshot({ status: 'COMPLETED', serverTime: at(60) }));
    expect(pill.dataset.phase).toBe('ended');
    expect(pill.textContent).toBe('Ended');
  });

  it('shows the participant count and no REC pill until a recording has started', async () => {
    await renderRoom(snapshot({ participants: [TEACHER, STUDENT] }));
    expect(screen.getByText('people in the room').parentElement?.textContent).toContain('2');
    expect(screen.queryByTestId('rec-pill')).toBeNull();
  });
});

describe('participant tiles', () => {
  it('shows a tile per participant with Host and Watch-only badges', async () => {
    await renderRoom(snapshot({ participants: [GUARDIAN, STUDENT, TEACHER] }));
    const strip = screen.getByRole('list', { name: 'People on camera' });
    const tiles = within(strip).getAllByTestId('participant-tile');
    // The host comes first, like a meeting filmstrip.
    expect(tiles.map((t) => t.dataset.role)).toEqual(['TEACHER', 'STUDENT', 'GUARDIAN_VIEWER']);

    const teacher = within(strip).getByRole('listitem', { name: /Ustadh Hamza, Teacher/ });
    expect(within(teacher).getByText('Host')).toBeTruthy();
    expect(within(teacher).getByText('UH')).toBeTruthy();

    const guardian = within(strip).getByRole('listitem', { name: /Umm Yusuf, Guardian/ });
    expect(within(guardian).getByText('Watch-only')).toBeTruthy();

    const student = within(strip).getByRole('listitem', { name: /Yusuf Ali, Student/ });
    expect(within(student).queryByText('Host')).toBeNull();
    expect(within(student).queryByText('Watch-only')).toBeNull();
  });

  function guardianRoutes(snap: ClassroomSnapshot) {
    return mockApi({
      [`GET /classroom/classes/${CID}/state`]: { body: envelope(snap) },
      'GET /families': { body: envelope([{ id: 'fam-1', name: 'Ali family', members: [] }]) },
      'GET /families/fam-1/students': { body: envelope([{ id: 's1', displayName: 'Yusuf Ali' }]) },
      [`POST /classroom/classes/${CID}/token`]: (call) => ({
        status: 201,
        body: envelope({
          sub: 'u-g', cid: CID, role: (call.body as { asStudentId?: string })?.asStudentId ? 'STUDENT' : 'GUARDIAN_VIEWER',
          studentId: (call.body as { asStudentId?: string })?.asStudentId ?? null, token: 't', url: 'fake://room/1', expiresAt: ENDS,
        }),
      }),
      'GET /mushaf/layouts': { body: envelope([]) },
      'GET /mushaf/pages/MADANI_15/1': { body: envelope(licensedPage) },
    });
  }
  const twoStudents = () =>
    snapshot({
      participants: [TEACHER],
      course: { name: 'Hifz' },
      students: [
        { id: 's1', displayName: 'Yusuf Ali' },
        { id: 's-other', displayName: 'Another child' },
      ],
    });
  const tokenBody = async (api: ReturnType<typeof mockApi>) => {
    let call: (typeof api.calls)[number] | undefined;
    await vi.waitFor(() => {
      call = api.calls.find((c) => c.method === 'POST' && c.url.includes('/token'));
      expect(call).toBeTruthy();
    });
    return call!.body;
  };

  it('joins a guardian as the child chosen outside the room, with no Join button inside (M48)', async () => {
    const api = guardianRoutes(twoStudents());
    renderWithProviders(<ClassroomRoom classId={CID} viewer="guardian" joinAs="s1" />);
    expect(await tokenBody(api)).toEqual({ asStudentId: 's1' });
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
    expect(await screen.findByRole('button', { name: /leave class/i })).toBeTruthy();
  });

  it('joins a guardian to watch when they chose Watch only', async () => {
    const api = guardianRoutes(twoStudents());
    renderWithProviders(<ClassroomRoom classId={CID} viewer="guardian" joinAs="watch" />);
    expect(await tokenBody(api)).toEqual({});
  });

  it('defaults a guardian to their only child on the class', async () => {
    const api = guardianRoutes(twoStudents());
    renderWithProviders(<ClassroomRoom classId={CID} viewer="guardian" />);
    expect(await tokenBody(api)).toEqual({ asStudentId: 's1' });
  });

  it('titles the room with the course and shows REC from the snapshot (M55)', async () => {
    await renderRoom(
      snapshot({ participants: [TEACHER, STUDENT], course: { name: 'Tajweed' }, recording: { status: 'RECORDING', startedAt: at(1) } }),
      'teacher',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Tajweed' })).toBeTruthy();
    expect(screen.getByTestId('rec-pill')).toBeTruthy();
  });
});

describe('teacher: tap a word, then Log mistake', () => {
  const logButton = () => screen.getByRole('button', { name: 'Log mistake' });
  const word0 = () => screen.findByRole('button', { name: 'Surah 1, ayah 1, word 0' });
  const highlightRoutes = {
    [`POST /classroom/classes/${CID}/highlight`]: (c: { body: unknown }) => ({ body: envelope(c.body) }),
    [`DELETE /classroom/classes/${CID}/highlight`]: { body: envelope({ cleared: true }) },
    [`POST /classes/${CID}/mistakes`]: (c: { body: unknown }) => ({
      status: 201,
      body: envelope({ id: 'm1', classId: CID, confirmed: true, occurredAt: at(6), tajweedRule: null, ...(c.body as object) }),
    }),
  };

  it('before the start, Log mistake says when logging opens and opens nothing', async () => {
    await renderRoom(snapshot({ serverTime: at(-5), participants: [TEACHER, STUDENT] }), 'teacher');
    expect(logButton().getAttribute('aria-disabled')).toBe('true');
    expect(logButton().getAttribute('title')).toMatch(/can be logged from/);
    fireEvent.click(logButton());
    expect(screen.queryByRole('dialog', { name: 'Log a mistake' })).toBeNull();
  });

  it('is held until a word is selected ("Tap a word first")', async () => {
    await renderRoom(snapshot({ serverTime: at(5), participants: [TEACHER, GUARDIAN] }), 'teacher', highlightRoutes);
    await word0();
    await waitFor(() => expect(logButton().getAttribute('title')).toBe('Tap a word first'));
    expect(logButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(logButton());
    expect(screen.queryByRole('dialog', { name: 'Log a mistake' })).toBeNull();
    await findErrorToast(/Tap a word first/);
  });

  it('a tap highlights the word for the class; Log mistake opens the dialog with it filled in and logs', async () => {
    const pill = await renderRoom(snapshot({ serverTime: at(5), participants: [TEACHER, GUARDIAN] }), 'teacher', highlightRoutes);
    fireEvent.click(await word0());
    await waitFor(() =>
      expect(pill.api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/highlight'))).toBe(true),
    );
    expect(screen.queryByRole('dialog', { name: 'Log a mistake' })).toBeNull();
    await waitFor(() => expect(logButton().getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(logButton());
    const dialog = await screen.findByRole('dialog', { name: 'Log a mistake' });
    expect(within(dialog).getByText('1:1 · word 1')).toBeTruthy();
    expect(within(dialog).getByText('W0')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tajweed rule' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Log mistake/ }));
    await waitFor(() => expect(pill.api.calls.some((c) => c.method === 'POST' && c.url.endsWith(`/classes/${CID}/mistakes`))).toBe(true));
    const post = pill.api.calls.find((c) => c.method === 'POST' && c.url.endsWith(`/classes/${CID}/mistakes`))!;
    expect(post.body).toEqual({ studentId: 's1', surah: 1, ayah: 1, wordIndex: 0, type: 'TAJWEED_RULE' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Log a mistake' })).toBeNull());
  });

  it('tapping the same word again clears the highlight and holds Log mistake again', async () => {
    const pill = await renderRoom(snapshot({ serverTime: at(5), participants: [TEACHER, GUARDIAN] }), 'teacher', highlightRoutes);
    fireEvent.click(await word0());
    await waitFor(() => expect(logButton().getAttribute('aria-disabled')).toBe('false'));
    fireEvent.click(await word0());
    await waitFor(() => expect(logButton().getAttribute('aria-disabled')).toBe('true'));
    await waitFor(() => expect(pill.api.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/highlight'))).toBe(true));
  });
});

describe('side panel and Mistakes window', () => {
  it.each(['teacher', 'student'] as const)('the %s panel has only People and Connection tabs', async (viewer) => {
    await renderRoom(snapshot({ participants: [TEACHER, STUDENT] }), viewer);
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+/g, '').trim())).toEqual(['People', 'Connection']);
  });

  it('the header Mistakes button opens the Mistakes window', async () => {
    await renderRoom(snapshot({ participants: [TEACHER, STUDENT] }), 'teacher');
    fireEvent.click(screen.getByRole('button', { name: /^Mistakes:/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Mistakes' });
    expect(within(dialog).getByRole('tab', { name: /This class/ })).toBeTruthy();
    expect(within(dialog).getByRole('tab', { name: /Earlier classes/ })).toBeTruthy();
  });
});

describe('header lesson card button', () => {
  it('before 10 minutes to the end it is locked, says when, and explains on click without opening', async () => {
    renderWithProviders(
      <LessonCardButton endsAt={ENDS} serverTime={at(20)} zone="UTC" submitted={false} onOpen={vi.fn()} />,
    );
    const button = screen.getByTestId('lesson-card-locked');
    const from = formatClock(new Date(Date.parse(ENDS) - 10 * 60_000).toISOString(), 'UTC');
    expect(button.textContent).toContain(`from ${from}`);
    fireEvent.click(button);
    await findErrorToast(`You can write the lesson card from ${from} (10 minutes before the class ends).`);
  });

  it('turns on by itself at that minute, and opens the card', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(at(34, 58)));
    const onOpen = vi.fn();
    renderWithProviders(<LessonCardButton endsAt={ENDS} serverTime={at(34, 58)} zone="UTC" submitted={false} onOpen={onOpen} />);
    expect(screen.getByTestId('lesson-card-locked')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByRole('button', { name: /Write lesson card/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('after a submit it reads Lesson card ✓ · View', () => {
    const onOpen = vi.fn();
    renderWithProviders(<LessonCardButton endsAt={ENDS} serverTime={at(40)} zone="UTC" submitted onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lesson card submitted — view it' }));
    expect(onOpen).toHaveBeenCalled();
  });
});
