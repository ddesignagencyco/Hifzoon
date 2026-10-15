// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleBuilder } from '@/components/admin/scheduling/ScheduleBuilder';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { findErrorToast, renderWithProviders, chooseOption, optionLabels } from '../helpers/render';

const ENROLMENT = '00000000-0000-7000-8000-000000000101';
const STUDENT = '00000000-0000-7000-8000-000000000011';
const COURSE = '01a13f96-7076-7a90-b275-5151d68adb6e';
const TEACHER = '01a13f96-7bbb-7950-9fad-72b04b7541d3';

function routes() {
  return {
    'GET /courses/enrolments/list': {
      body: envelope([
        {
          id: ENROLMENT,
          status: 'ACTIVE',
          student: { id: STUDENT, displayName: 'Maryam', birthYear: 2017 },
          course: { id: COURSE, code: 'QAIDA', name: 'Noorani Qaida' },
          currentLevel: null,
          teacher: { id: TEACHER, user: { name: 'Ustadh Bilal Rahman' } },
        },
      ]),
    },
    [`GET /scheduling/matching/${STUDENT}`]: {
      body: envelope({ studentId: STUDENT, courseId: COURSE, suggestions: [{ teacherId: TEACHER, name: 'Ustadh Bilal Rahman', reasons: ['teaches in en'], score: 39 }] }),
    },
    [`GET /scheduling/teachers/${TEACHER}/availability`]: {
      body: envelope({ teacherId: TEACHER, timeZone: 'UTC', slots: [{ weekday: 2, startTime: '15:00', endTime: '20:00', timeZone: 'UTC', effectiveFrom: 'x', effectiveTo: null }] }),
    },
    'POST /scheduling/schedules': (call: { body: unknown }) => ({
      status: 201,
      body: envelope({ scheduleId: 'sch-1', rrule: (call.body as { rrule: string }).rrule, localStartTime: '17:30', familyTimeZone: 'Europe/London', materialisedUntil: null, sessions: [], skippedConflicts: 0 }),
    }),
  };
}

function renderBuilder(onCreated = vi.fn()) {
  renderWithProviders(<ScheduleBuilder onCreated={onCreated} />);
  return { onCreated };
}

describe('ScheduleBuilder', () => {
  it('serialises weekday picks, interval and COUNT into the RRULE preview', async () => {
    mockApi(routes());
    renderBuilder();
    const preview = screen.getByTestId('rrule-preview');
    expect(preview.textContent).toBe('FREQ=WEEKLY');

    await userEvent.click(screen.getByRole('button', { name: 'Thursday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(screen.getByRole('button', { name: 'Tuesday' }).getAttribute('aria-pressed')).toBe('true');
    expect(preview.textContent).toBe('FREQ=WEEKLY;BYDAY=TU,TH');

    fireEvent.change(screen.getByLabelText(/every \(weeks\)/i), { target: { value: '2' } });
    await userEvent.click(screen.getByLabelText(/after/i));
    fireEvent.change(screen.getByLabelText('Number of classes'), { target: { value: '8' } });
    expect(preview.textContent).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=8');
    expect(screen.getByText(/Every 2 weeks on Tue, Thu, 8 classes/)).toBeTruthy();

    // Toggling a day off removes it.
    await userEvent.click(screen.getByRole('button', { name: 'Thursday' }));
    expect(preview.textContent).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=8');
  }, 15_000);

  it('refuses to submit without an enrolment, teacher and weekday', async () => {
    const api = mockApi(routes());
    renderBuilder();
    await userEvent.click(screen.getByRole('button', { name: /create schedule/i }));
    await findErrorToast('Choose an enrolment.');
    expect(screen.getAllByText('Choose an enrolment.').length).toBeGreaterThan(0);
    expect(screen.getByText('Choose a teacher.')).toBeTruthy();
    expect(screen.getByText('Pick at least one weekday.')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('posts the CreateScheduleDto with the serialised rule', async () => {
    const api = mockApi(routes());
    const { onCreated } = renderBuilder();

    const enrolmentSelect = screen.getByLabelText(/^enrolment/i);
    await waitFor(async () => expect((await optionLabels(enrolmentSelect)).length).toBeGreaterThan(1));
    await chooseOption(enrolmentSelect, /Yusuf|Maryam|Hifz|Qaida/i);

    const teacherSelect = screen.getByRole('combobox', { name: 'Teacher' });
    await waitFor(async () => expect((await optionLabels(teacherSelect)).some((l) => /Bilal/.test(l))).toBe(true));
    await chooseOption(teacherSelect, /Bilal/);

    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thursday' }));
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '17:30' } });
    await chooseOption(screen.getByLabelText(/family time zone/i), /London/);
    fireEvent.change(screen.getByLabelText(/starts on/i), { target: { value: '2030-01-07' } });
    await userEvent.click(screen.getByLabelText(/^on$/i));
    fireEvent.change(screen.getByLabelText('Recurrence end date'), { target: { value: '2030-03-31' } });

    await userEvent.click(screen.getByRole('button', { name: /create schedule/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      enrolmentId: ENROLMENT,
      teacherId: TEACHER,
      localStartTime: '17:30',
      familyTimeZone: 'Europe/London',
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE',
      startsOn: '2030-01-07',
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20300331T235959',
    });
    expect(onCreated.mock.calls[0][0].scheduleId).toBe('sch-1');
  }, 15_000);
});
