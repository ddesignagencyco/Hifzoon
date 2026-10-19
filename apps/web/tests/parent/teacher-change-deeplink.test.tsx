// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { ChildCourses } from '@/components/parent/ChildCourses';
import { latestTeacherChangeFor, teacherChangeHref } from '@/lib/api/modules/admissions-guardian';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

const S = 'stu-1';

function enrolment(id: string, status = 'ACTIVE', teacher: { id: string; user: { name: string } } | null = { id: 'tp-1', user: { name: 'Ustadh Bilal' } }) {
  return {
    id,
    status,
    startedAt: '2026-09-01T00:00:00.000Z',
    pausedUntil: null,
    currentLessonPosition: 3,
    student: { id: S, displayName: 'Maryam', birthYear: 2016 },
    course: { id: 'c-1', code: 'HIFZ', name: 'Hifz programme' },
    currentLevel: null,
    teacher,
  };
}

function change(enrolmentId: string, status: string, createdAt = '2026-10-10T00:00:00.000Z') {
  return {
    id: `tc-${enrolmentId}-${createdAt}`,
    familyId: 'fam-1',
    studentId: S,
    enrolmentId,
    reason: 'Schedule does not suit us',
    status,
    resolvedById: null,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
    studentName: 'Maryam',
    family: { id: 'fam-1', name: 'Khan family' },
    resolvedBy: null,
  };
}

const consentGranted = envelope({
  studentId: S,
  purposes: [{ purpose: 'DATA_COLLECTION', status: 'GRANTED', grantedAt: '2026-10-01T00:00:00.000Z', withdrawnAt: null, policyVersion: 'v1' }],
});

function mockCourses(enrolments: unknown[], changes: unknown[]) {
  return mockApi({
    'GET /courses/enrolments/list': { body: envelope(enrolments) },
    'GET /teacher-changes': { body: envelope(changes) },
    [`GET /consent/students/${S}`]: { body: consentGranted },
  });
}

describe('teacher-change deep link (?tab=courses&change=<enrolmentId>)', () => {
  it('builds the deep link and picks the newest request per enrolment', () => {
    expect(teacherChangeHref('stu 1', 'enr-1')).toBe('/parent/children/stu%201?tab=courses&change=enr-1');
    const rows = [change('enr-1', 'DECLINED', '2026-10-01T00:00:00.000Z'), change('enr-1', 'OPEN', '2026-10-12T00:00:00.000Z'), change('enr-2', 'APPROVED')];
    expect(latestTeacherChangeFor(rows, 'enr-1')?.status).toBe('OPEN');
    expect(latestTeacherChangeFor(rows, 'enr-3')).toBeUndefined();
  });

  it('opens the request dialog for the linked enrolment', async () => {
    mockCourses([enrolment('enr-1')], []);
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" initialChangeId="enr-1" />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Request a different teacher')).toBeTruthy();
    expect(within(dialog).getByText(/currently Ustadh Bilal/)).toBeTruthy();
  });

  it('does not open the dialog when a request is already open for that enrolment', async () => {
    mockCourses([enrolment('enr-1')], [change('enr-1', 'OPEN')]);
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" initialChangeId="enr-1" />);
    await screen.findByRole('button', { name: 'Change requested' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores a link to an enrolment without a teacher or not in this child', async () => {
    mockCourses([enrolment('enr-1', 'TRIAL', null)], []);
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" initialChangeId="enr-1" />);
    await screen.findByText(/Not assigned yet/);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('labels the course action "Change teacher" without a link', async () => {
    mockCourses([enrolment('enr-1')], []);
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" />);
    expect(await screen.findByRole('button', { name: 'Change teacher' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
