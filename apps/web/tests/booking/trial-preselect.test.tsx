// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearnerStep } from '@/components/booking/LearnerStep';
import { initialBookingStep } from '@/components/booking/BookingFlow';
import { ApiClientError } from '@/lib/api/http';
import { bookingPath, parseBookingSelection, trialBookingHref, trialRefusal } from '@/lib/api/modules/public-booking';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

describe('a trial link from the family portal', () => {
  it('carries the child and the course, and survives the sign-in round trip', () => {
    expect(trialBookingHref('stu-1', 'hifz')).toBe('/book-trial?course=HIFZ&studentId=stu-1');
    expect(trialBookingHref('stu-1')).toBe('/book-trial?studentId=stu-1');
    const parsed = parseBookingSelection(new URLSearchParams('course=HIFZ&studentId=stu-1'));
    expect(parsed).toEqual({ course: 'HIFZ', studentId: 'stu-1' });
    expect(bookingPath(parsed)).toBe('/book-trial?course=HIFZ&studentId=stu-1');
  });

  it('skips the steps the link already answered', () => {
    expect(initialBookingStep({})).toBe('details');
    expect(initialBookingStep({ studentId: 'stu-1' })).toBe('details');
    expect(initialBookingStep({ course: 'HIFZ', studentId: 'stu-1' })).toBe('time');
    expect(initialBookingStep({ course: 'HIFZ', slotTeacher: 'tp-1', slotStart: '2031-03-04T17:00:00.000Z' })).toBe('learner');
  });

  it('tells a trial rule apart from a slot someone else took', () => {
    expect(trialRefusal(new ApiClientError('x', 409, 'CONFLICT', { reason: 'TRIAL_PENDING' }))).toBe('TRIAL_PENDING');
    expect(trialRefusal(new ApiClientError('x', 409, 'DOUBLE_BOOKED', { startsAt: 'x' }))).toBeNull();
    expect(trialRefusal(new ApiClientError('x', 409, 'CONFLICT', { reason: 'SOMETHING_ELSE' }))).toBeNull();
    expect(trialRefusal(null)).toBeNull();
  });
});

const FAMILY = { id: 'fam-1', name: 'Khan family', timeZone: 'Europe/London' };
const KIDS = [
  { id: 'stu-1', displayName: 'Maryam', birthYear: 2012, familyId: 'fam-1' },
  { id: 'stu-2', displayName: 'Yusuf', birthYear: 2014, familyId: 'fam-1' },
];
const GRANTED = (studentId: string) =>
  envelope({
    studentId,
    purposes: [{ purpose: 'DATA_COLLECTION', status: 'GRANTED', grantedAt: '2026-10-01T00:00:00.000Z', withdrawnAt: null, policyVersion: 'v1' }],
  });

function renderStep(bookResponse: { status?: number; body?: unknown }) {
  const api = mockApi({
    'GET /families': { body: envelope([FAMILY]) },
    'GET /families/fam-1/students': { body: envelope(KIDS) },
    'GET /consent/students/stu-1': { body: GRANTED('stu-1') },
    'GET /consent/students/stu-2': { body: GRANTED('stu-2') },
    'GET /consent/policy-version': { body: envelope({ version: 'v1' }) },
    'POST /scheduling/book': bookResponse,
  });
  renderWithProviders(
    <LearnerStep
      guardianName="Amina Khan"
      timeZone="Europe/London"
      courseId="c-1"
      slot={{ teacherId: 'tp-1', startsAt: '2031-03-04T17:00:00.000Z' }}
      preselectedStudentId="stu-2"
      onBooked={() => undefined}
      onSlotTaken={() => undefined}
    />,
  );
  return api;
}

describe('LearnerStep', () => {
  it('starts on the learner chosen in the family portal', async () => {
    renderStep({ status: 201, body: envelope({ id: 'class-1' }) });
    expect(await screen.findByRole('button', { name: 'Confirm free trial for Yusuf' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Yusuf/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('explains a trial already booked instead of offering another time', async () => {
    renderStep(
      apiError(409, 'CONFLICT', 'A trial for this course is already booked. The teacher’s result follows the class.', {
        reason: 'TRIAL_PENDING',
      }),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Confirm free trial for Yusuf' }));

    expect(await screen.findByText('Yusuf already has a trial for this course')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open Yusuf's courses/ }).getAttribute('href')).toBe(
      '/parent/children/stu-2?tab=courses',
    );
    expect(screen.queryByRole('button', { name: 'Choose another time' })).toBeNull();
  });

  it('offers another week when this week’s trial classes are used up', async () => {
    renderStep(apiError(409, 'CONFLICT', 'Up to 3 trial classes can be booked in a week.', { reason: 'TRIAL_WEEK_FULL' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Confirm free trial for Yusuf' }));

    expect(await screen.findByRole('button', { name: 'Choose another time' })).toBeTruthy();
  });
});
