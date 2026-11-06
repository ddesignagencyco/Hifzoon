// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { DataRequestsQueue } from '@/components/admin/data-requests/DataRequestsQueue';
import { InterviewsBoard } from '@/components/interviews/InterviewsBoard';
import { mockApi } from '../helpers/fetch-mock';
import { chooseOption, optionLabels, renderWithProviders } from '../helpers/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const request = (over: Record<string, unknown>) => ({
  id: 'dr-1',
  reference: 'REF-1',
  type: 'DELETE',
  status: 'REQUESTED',
  requestedAt: '2026-10-01T00:00:00Z',
  dueAt: '2026-10-31T00:00:00Z',
  completedAt: null,
  rejectionReason: null,
  overdue: true,
  family: { id: 'f1', name: 'Khan family' },
  student: null,
  ...over,
});

describe('<DataRequestsQueue> filters', () => {
  const rows = [
    request({}),
    request({ id: 'dr-2', reference: 'REF-2', type: 'EXPORT', overdue: false, dueAt: '2099-01-01T00:00:00Z', family: { id: 'f2', name: 'Ali family' } }),
  ];

  it('offers only the types present and narrows the table by type', async () => {
    mockApi({ 'GET /admin/data-requests': { body: rows } });
    renderWithProviders(<DataRequestsQueue />);
    expect(await screen.findByText(/Khan family/)).toBeTruthy();
    expect(screen.getByText(/Ali family/)).toBeTruthy();

    expect(await optionLabels(screen.getByLabelText('Type'))).toEqual(['All types', 'Deletion', 'Export']);
    await chooseOption(screen.getByLabelText('Type'), 'Export');
    expect(screen.queryByText(/Khan family/)).toBeNull();
    expect(screen.getByText(/Ali family/)).toBeTruthy();
  });

  it('filters by deadline and searches by family or reference', async () => {
    mockApi({ 'GET /admin/data-requests': { body: rows } });
    renderWithProviders(<DataRequestsQueue />);
    await screen.findByText(/Khan family/);

    await chooseOption(screen.getByLabelText('Deadline'), 'Overdue');
    expect(screen.queryByText(/Ali family/)).toBeNull();
    await chooseOption(screen.getByLabelText('Deadline'), 'All deadlines');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'REF-2' } });
    expect(screen.queryByText(/Khan family/)).toBeNull();
    expect(screen.getByText(/Ali family/)).toBeTruthy();
  });
});

describe('<InterviewsBoard> filters', () => {
  const interview = (over: Record<string, unknown>) => ({
    id: 'iv-1',
    applicationId: 'app-1',
    stage: null,
    startsAt: '2026-01-01T10:00:00Z',
    endsAt: '2026-01-01T10:30:00Z',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    status: 'COMPLETED',
    outcome: 'PASSED',
    decidedAt: null,
    interviewerId: 'u1',
    interviewer: { name: 'Sister Huda' },
    application: { applicantName: 'Aisha Rahman', email: 'aisha@example.com', status: 'INTERVIEW' },
    ...over,
  });

  it('filters by verdict and by past or upcoming', async () => {
    mockApi({
      'GET /interviews': {
        body: [
          interview({}),
          interview({
            id: 'iv-2',
            outcome: 'PENDING',
            status: 'SCHEDULED',
            startsAt: '2099-01-01T10:00:00Z',
            endsAt: '2099-01-01T10:30:00Z',
            application: { applicantName: 'Bilal Ahmed', email: 'bilal@example.com', status: 'INTERVIEW' },
          }),
        ],
      },
    });
    renderWithProviders(<InterviewsBoard basePath="/admin/interviews" />);
    expect(await screen.findByText('Aisha Rahman')).toBeTruthy();

    expect(await optionLabels(screen.getByLabelText('Verdict'))).toEqual(['All verdicts', 'No verdict yet', 'Passed']);
    await chooseOption(screen.getByLabelText('Verdict'), 'Passed');
    expect(screen.queryByText('Bilal Ahmed')).toBeNull();
    await chooseOption(screen.getByLabelText('Verdict'), 'All verdicts');

    await chooseOption(screen.getByLabelText('Date'), 'Upcoming');
    expect(screen.queryByText('Aisha Rahman')).toBeNull();
    expect(screen.getByText('Bilal Ahmed')).toBeTruthy();
  });
});
