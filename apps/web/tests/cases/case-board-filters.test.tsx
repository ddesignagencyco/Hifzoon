// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { chooseOption, optionLabels, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/safeguarding',
}));

import { CaseBoard } from '@/components/cases/CaseBoard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const due = new Date(Date.now() + 3_600_000).toISOString();
const kase = (id: string, summary: string, severity: string, owner: { id: string; name: string } | null) => ({
  id,
  type: 'COMPLAINT',
  status: 'OPEN',
  severity,
  summary,
  dueAt: due,
  createdAt: '2026-11-01T10:00:00Z',
  owner,
  openedBy: { id: 'u9', name: 'Opener' },
  _count: { notes: 0 },
});

describe('case board filters', () => {
  it('narrows the loaded cases by severity, assignee and search', async () => {
    mockApi({
      'GET /cases': {
        body: envelope(
          [
            kase('aaaaaaaa-0000-0000-0000-000000000001', 'Late teacher', 'HIGH', { id: 'o1', name: 'Amina Lead' }),
            kase('aaaaaaaa-0000-0000-0000-000000000002', 'Billing query', 'LOW', null),
          ],
          { page: 1, limit: 25, total: 2 },
        ),
      },
    });
    renderWithProviders(<CaseBoard basePath="/safeguarding/cases" title="Case board" description="Cases" />);

    expect(await screen.findByText('Late teacher')).toBeTruthy();
    expect(screen.getByText('Billing query')).toBeTruthy();

    // Choices come from the loaded rows only.
    // (The pager's native page-size options are also role="option", so check by inclusion.)
    const severities = await optionLabels(screen.getByLabelText('Severity'));
    expect(severities).toEqual(expect.arrayContaining(['All severities', 'High', 'Low']));
    expect(severities).not.toContain('Medium');
    expect(await optionLabels(screen.getByLabelText('Assignee'))).toEqual(
      expect.arrayContaining(['All owners', 'Amina Lead', 'Unassigned']),
    );

    await chooseOption(screen.getByLabelText('Severity'), 'Low');
    await waitFor(() => expect(screen.queryByText('Late teacher')).toBeNull());
    expect(screen.getByText('Billing query')).toBeTruthy();

    await chooseOption(screen.getByLabelText('Severity'), 'All severities');
    await chooseOption(screen.getByLabelText('Assignee'), 'Amina Lead');
    await waitFor(() => expect(screen.queryByText('Billing query')).toBeNull());
    expect(screen.getByText('Late teacher')).toBeTruthy();

    await chooseOption(screen.getByLabelText('Assignee'), 'All owners');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'billing' } });
    await waitFor(() => expect(screen.queryByText('Late teacher')).toBeNull());
    expect(screen.getByText('Billing query')).toBeTruthy();
  }, 15_000);
});
