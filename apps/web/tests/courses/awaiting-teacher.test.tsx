// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnrolmentsPanel } from '@/components/admin/courses/EnrolmentsPanel';
import { canAssignTeacher, isAwaitingTeacher } from '@/lib/api/modules/courses-admin';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { findSuccessToast, renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function row(id: string, name: string, status: string, teacher: string | null) {
  return {
    id,
    status,
    startedAt: '2026-10-10T00:00:00.000Z',
    pausedUntil: null,
    currentLessonPosition: 1,
    student: { id: `stu-${id}`, displayName: name, birthYear: 2016 },
    course: { id: 'course-1', code: 'HIFZ', name: 'Hifz programme' },
    currentLevel: null,
    teacher: teacher ? { id: `tp-${id}`, user: { name: teacher } } : null,
  };
}

const ROWS = [
  row('e1', 'Maryam', 'TRIAL', null),
  row('e2', 'Yusuf', 'ACTIVE', 'Ustadh Bilal'),
  row('e3', 'Aisha', 'ACTIVE', null),
  row('e4', 'Omar', 'CANCELLED', null),
];

describe('awaiting a teacher', () => {
  it('means a live enrolment with no teacher; only a trial can be assigned', () => {
    expect(ROWS.map((r) => isAwaitingTeacher(r as never))).toEqual([true, false, true, false]);
    expect(ROWS.map((r) => canAssignTeacher(r as never))).toEqual([true, false, false, false]);
  });

  it('filters the list and assigns a matching teacher through POST /courses/enrolments', async () => {
    const api = mockApi({
      // The endpoint now filters "awaiting a teacher" on the server, so the mock honours the
      // query param rather than relying on the component to filter the full list in-browser.
      'GET /courses/enrolments/list': (call) => {
        const awaiting = new URL(call.url).searchParams.get('awaitingTeacher') === 'true';
        const rows = awaiting ? ROWS.filter((r) => isAwaitingTeacher(r as never)) : ROWS;
        return {
          body: envelope(rows, {
            requestId: 'test-request',
            pagination: { page: 1, limit: 20, total: rows.length, totalPages: 1 },
          }),
        };
      },
      'GET /scheduling/matching/stu-e1': {
        body: envelope({
          studentId: 'stu-e1',
          courseId: 'course-1',
          suggestions: [
            { teacherId: 'tp-9', name: 'Ustadha Khadija', bio: null, photoUrl: null, gender: 'FEMALE', languages: ['en'], subjects: [], ratingAvg: 4.8, reasons: ['Teaches this course'] },
          ],
        }),
      },
      'POST /courses/enrolments': {
        status: 201,
        body: envelope({ id: 'e1', status: 'TRIAL', course: { id: 'course-1', code: 'HIFZ', name: 'Hifz programme' } }),
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EnrolmentsPanel initialAwaiting />);

    expect(await screen.findByText('Maryam')).toBeTruthy();
    expect(screen.getByText('Aisha')).toBeTruthy();
    expect(screen.queryByText('Yusuf')).toBeNull();
    expect(screen.queryByText('Omar')).toBeNull();
    // An unassigned ACTIVE row can't be upgraded by the API, so its action is disabled.
    expect((screen.getByRole('button', { name: 'Assign a teacher to Aisha in Hifz programme' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Assign a teacher to Maryam in Hifz programme' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('radio'));
    await user.click(within(dialog).getByRole('button', { name: 'Assign teacher' }));

    await findSuccessToast(/Ustadha Khadija assigned to Maryam/);
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ studentId: 'stu-e1', courseId: 'course-1', teacherId: 'tp-9', status: 'TRIAL' });

    // Turning the filter off shows every row again.
    await user.click(screen.getByLabelText(/Only enrolments awaiting a teacher/));
    await waitFor(() => expect(screen.getByText('Yusuf')).toBeTruthy());
  }, 15_000);

  it('books the trial time in the same dialog through the office’s trial booking', async () => {
    const api = mockApi({
      'GET /courses/enrolments/list': {
        body: envelope([ROWS[0]], { requestId: 'test-request', pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      },
      'GET /scheduling/matching/stu-e1': {
        body: envelope({
          studentId: 'stu-e1',
          courseId: 'course-1',
          suggestions: [
            { teacherId: 'tp-9', name: 'Ustadha Khadija', bio: null, photoUrl: null, gender: 'FEMALE', languages: ['en'], subjects: [], ratingAvg: 4.8, reasons: [] },
          ],
        }),
      },
      'POST /trials': {
        status: 201,
        body: envelope({ id: 'class-1', type: 'TRIAL', startsAt: '2031-03-04T17:00:00.000Z', endsAt: '2031-03-04T17:30:00.000Z', status: 'SCHEDULED' }),
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<EnrolmentsPanel initialAwaiting />);

    await user.click(await screen.findByRole('button', { name: 'Assign a teacher to Maryam in Hifz programme' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('radio'));
    await user.type(within(dialog).getByLabelText(/Trial class time/), '2031-03-04T17:00');
    await user.click(within(dialog).getByRole('button', { name: 'Assign and book trial' }));

    await findSuccessToast(/Trial booked for Maryam with Ustadha Khadija.*The family has been notified/);
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.url).toMatch(/\/trials$/);
    expect(post?.body).toEqual({
      studentId: 'stu-e1',
      courseId: 'course-1',
      teacherId: 'tp-9',
      startsAt: new Date('2031-03-04T17:00').toISOString(),
    });
    // The teacher-only route is not used as well: one booking path, no second write.
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/courses/enrolments'))).toBe(false);
  }, 15_000);
});
