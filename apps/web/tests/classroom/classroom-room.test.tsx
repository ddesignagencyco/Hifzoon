// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { ClassroomRoom, ClassroomViewer } from '@/components/classroom/ClassroomRoom';
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
    participants: [],
    serverTime: at(5, 7),
    ...over,
  };
}

const licensedPage = {
  layout: 'MADANI_15', page: 1, lines: [{ lineNumber: 1, ayahs: [{ surah: 1, ayah: 1 }] }],
  surahStart: 1, ayahStart: 1, licensed: true, source: 'licensed-test', cachedUntil: '2026-10-20T00:00:00Z',
};

function mockRoom(snap: ClassroomSnapshot) {
  return mockApi({
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

async function renderRoom(snap: ClassroomSnapshot, viewer: ClassroomViewer = 'student') {
  mockRoom(snap);
  renderWithProviders(<ClassroomRoom classId={CID} viewer={viewer} />);
  return screen.findByTestId('class-status');
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

  it('offers the right join button for a guardian', async () => {
    await renderRoom(snapshot({ participants: [TEACHER] }), 'guardian');
    expect(screen.getByRole('button', { name: /Join to watch/ })).toBeTruthy();
  });
});

describe('teacher mistake logger', () => {
  it('waits for the start time', async () => {
    await renderRoom(snapshot({ serverTime: at(-5), participants: [TEACHER, STUDENT] }), 'teacher');
    expect(await screen.findByText("The class hasn't started yet")).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Log a mistake' })).toBeNull();
  });

  it('after the start, waits for the student side to join', async () => {
    await renderRoom(snapshot({ serverTime: at(5), participants: [TEACHER] }), 'teacher');
    expect(await screen.findByText('Waiting for the student')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Log a mistake' })).toBeNull();
  });

  it('shows the logger once started and a guardian device (the student side) is present', async () => {
    await renderRoom(snapshot({ serverTime: at(5), participants: [TEACHER, GUARDIAN] }), 'teacher');
    expect(await screen.findByRole('form', { name: 'Log a mistake' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Mistakes/ }).getAttribute('aria-selected')).toBe('true');
  });
});
