// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourseDetailScreen } from '@/components/admin/courses/CoursesAdmin';
import { EnrolmentsPanel } from '@/components/admin/courses/EnrolmentsPanel';
import { LessonPicker, parseLessonValue } from '@/components/courses/LessonPicker';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { chooseOption, findSuccessToast, optionLabels, renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/admin/courses',
  useSearchParams: () => new URLSearchParams(),
}));

const lesson = (id: string, position: number, title: string, enrolmentCount = 0) => ({
  id,
  position,
  title,
  objectives: ['Read it well'],
  materials: null,
  teacherNotes: null,
  enrolmentCount,
});

const LEVELS = [
  {
    id: 'lv1',
    name: 'Sabaq start',
    position: 1,
    passMark: 70,
    rubric: null,
    enrolmentCount: 1,
    lessonTemplates: [lesson('t1', 1, 'Juz 30: An-Nas – Al-Kawthar', 1), lesson('t2', 2, "Juz 30: Al-Ma'un – At-Takathur")],
  },
  {
    id: 'lv2',
    name: 'Building momentum',
    position: 2,
    passMark: 70,
    rubric: null,
    enrolmentCount: 0,
    lessonTemplates: [lesson('t3', 1, 'Juz 29: Al-Mulk')],
  },
];
const COURSE = { id: 'c1', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: 'Memorise', active: true, levels: LEVELS };

describe('admin course page: lesson edit dialog', () => {
  it('opens on click, saves the new title through PATCH /courses/lessons/:id', async () => {
    const api = mockApi({
      'GET /courses/c1/curriculum': { body: envelope(COURSE) },
      'PATCH /courses/lessons/t2': { body: envelope({ id: 't2', title: 'Juz 30: Surah Al-Ma’un', position: 2 }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<CourseDetailScreen courseId="c1" />);

    await user.click(await screen.findByRole('button', { name: /Edit lesson 2: Juz 30: Al-Ma'un/ }));
    const title = await screen.findByLabelText(/Lesson title/);
    expect((title as HTMLInputElement).value).toBe("Juz 30: Al-Ma'un – At-Takathur");
    expect((screen.getByLabelText(/Objectives/) as HTMLTextAreaElement).value).toBe('Read it well');

    await user.clear(title);
    await user.type(title, 'Juz 30: Surah Al-Ma’un');
    await user.click(screen.getByRole('button', { name: 'Save lesson' }));

    await findSuccessToast(/saved/);
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('/courses/lessons/t2');
    expect(patch?.body).toEqual({
      title: 'Juz 30: Surah Al-Ma’un',
      objectives: ['Read it well'],
      materials: {},
      teacherNotes: null,
    });
  });

  it('offers delete (with a confirm) only when no student is on the lesson', async () => {
    const api = mockApi({
      'GET /courses/c1/curriculum': { body: envelope(COURSE) },
      'DELETE /courses/lessons/t2': { body: envelope({ id: 't2', deleted: true }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<CourseDetailScreen courseId="c1" />);

    await user.click(await screen.findByRole('button', { name: /Edit lesson 1: Juz 30: An-Nas/ }));
    expect(await screen.findByText(/1 student is on this lesson/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete lesson' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: /Edit lesson 2: Juz 30: Al-Ma'un/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete lesson' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/courses/lessons/t2'))).toBe(true));
  });

  it('moves a lesson down through PATCH /courses/lessons/:id/move', async () => {
    const api = mockApi({
      'GET /courses/c1/curriculum': { body: envelope(COURSE) },
      'PATCH /courses/lessons/t1/move': { body: envelope({ id: 't1', position: 2 }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<CourseDetailScreen courseId="c1" />);
    await user.click(await screen.findByRole('button', { name: /Move lesson Juz 30: An-Nas – Al-Kawthar down/ }));
    await waitFor(() => expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ direction: 'down' }));
    expect((screen.getByRole('button', { name: /Move lesson Juz 30: An-Nas – Al-Kawthar up/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('LessonPicker', () => {
  it('lists every lesson as "Level — Lesson N: title", grouped by level, locking other levels when asked', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <>
        <label htmlFor="pick">Lesson</label>
        <LessonPicker id="pick" levels={LEVELS} value={{ levelId: 'lv1', position: 2 }} onChange={onChange} lockedLevelId="lv1" />
      </>,
    );
    expect(screen.getByText("Sabaq start — Lesson 2: Juz 30: Al-Ma'un – At-Takathur")).toBeTruthy();
    const control = screen.getByLabelText('Lesson');
    fireEvent.focus(control);
    fireEvent.keyDown(control, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
    expect(await screen.findByText('Level 1: Sabaq start')).toBeTruthy();
    expect(screen.getByText('Level 2: Building momentum')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Juz 29: Al-Mulk/ }).getAttribute('aria-disabled')).toBe('true');
    const labels = await optionLabels(control);
    expect(labels).toEqual([
      'Sabaq start — Lesson 1: Juz 30: An-Nas – Al-Kawthar',
      "Sabaq start — Lesson 2: Juz 30: Al-Ma'un – At-Takathur",
      'Building momentum — Lesson 1: Juz 29: Al-Mulk',
    ]);
  });

  it('parses the level:position value', () => {
    expect(parseLessonValue('0190-abc:3')).toEqual({ levelId: '0190-abc', position: 3 });
    expect(parseLessonValue('nope')).toBeNull();
  });
});

describe('admin "Set lesson position" dialog', () => {
  it('preselects the current lesson, explains it, and can move the student to another level', async () => {
    const row = {
      id: 'e1',
      status: 'ACTIVE',
      startedAt: '2026-10-10T00:00:00.000Z',
      pausedUntil: null,
      currentLessonPosition: 2,
      student: { id: 's1', displayName: 'Maryam', birthYear: 2016 },
      course: { id: 'c1', code: 'HIFZ', name: 'Hifz' },
      currentLevel: { id: 'lv1', name: 'Sabaq start', position: 1 },
      teacher: { id: 'tp1', user: { name: 'Ustadh Bilal' } },
    };
    const api = mockApi({
      'GET /courses/enrolments/list': {
        body: envelope([row], { requestId: 'r', pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      },
      'GET /courses/c1': { body: envelope(COURSE) },
      'PATCH /courses/enrolments/e1/lesson-position': { body: envelope({ id: 'e1', currentLessonPosition: 1, currentLevelId: 'lv2' }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<EnrolmentsPanel />);

    await user.click(await screen.findByRole('button', { name: /Set lesson position for Maryam/ }));
    expect(await screen.findByText(/The lesson the teacher teaches next\. It appears on the teacher's class brief\./)).toBeTruthy();
    expect(await screen.findByText("Sabaq start — Lesson 2: Juz 30: Al-Ma'un – At-Takathur")).toBeTruthy();

    // Every level's lessons are offered, not only the current level's.
    await chooseOption(screen.getByLabelText(/Next lesson/), /Building momentum — Lesson 1: Juz 29: Al-Mulk/);
    await user.click(screen.getByRole('button', { name: 'Save next lesson' }));
    await findSuccessToast(/Next lesson: Juz 29: Al-Mulk \(Building momentum\)/);
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ position: 1, levelId: 'lv2' });
  });
});

describe("teacher's student page: next lesson picker", () => {
  it('names the lessons instead of numbers and saves within the level', async () => {
    const { LessonPositionForm } = await import('@/components/teacher/StudentDetailScreen');
    const api = mockApi({
      'GET /courses/c1': { body: envelope(COURSE) },
      'PATCH /courses/enrolments/e1/lesson-position': { body: envelope({ id: 'e1', currentLessonPosition: 2 }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonPositionForm enrolmentId="e1" courseId="c1" levelId="lv1" current={1} suggested={2} />);

    expect(await screen.findByText('Sabaq start — Lesson 1: Juz 30: An-Nas – Al-Kawthar')).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(screen.getByRole('button', { name: "Move on to: Juz 30: Al-Ma'un – At-Takathur" }));
    await findSuccessToast(/Next lesson: Juz 30: Al-Ma'un – At-Takathur/);
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ position: 2 });
  });
});
