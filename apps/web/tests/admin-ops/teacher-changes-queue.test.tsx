// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { TeacherChangesQueue } from '@/components/admin/teacher-changes/TeacherChangesQueue';
import { matchesSearch, optionsFrom } from '@/components/ui/FilterSelect';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { chooseOption, optionLabels, renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function request(
  id: string,
  child: string,
  family: { id: string; name: string },
  status: string,
  current: { id: string; name: string } | null,
  assigned: { id: string; name: string } | null = null,
) {
  const resolved = status !== 'OPEN';
  return {
    id,
    familyId: family.id,
    studentId: `stu-${child.toLowerCase()}`,
    enrolmentId: `enr-${id}`,
    reason: `Reason for ${child}`,
    status,
    resolvedById: resolved ? 'admin-1' : null,
    resolvedAt: resolved ? '2026-10-20T10:00:00.000Z' : null,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    family,
    resolvedBy: resolved ? { id: 'admin-1', name: 'Admin Amina' } : null,
    studentName: child,
    course: { id: 'course-1', name: 'Hifz programme' },
    currentTeacher: current,
    newTeacher: assigned,
  };
}

const KHAN = { id: 'fam-khan', name: 'Khan family' };
const ALI = { id: 'fam-ali', name: 'Ali family' };
const BILAL = { id: 'tp-bilal', name: 'Ustadh Bilal' };
const ZAINAB = { id: 'tp-zainab', name: 'Ustadhah Zainab' };

const ROWS = [
  request('tc-1', 'Maryam', KHAN, 'OPEN', BILAL),
  request('tc-2', 'Yusuf', KHAN, 'APPROVED', ZAINAB, ZAINAB),
  request('tc-3', 'Aisha', ALI, 'DECLINED', BILAL),
];

function mockQueue() {
  return mockApi({
    'GET /teacher-changes': (call) => {
      const status = new URL(call.url).searchParams.get('status');
      const rows = status ? ROWS.filter((r) => r.status === status) : ROWS;
      return {
        body: envelope(rows, {
          requestId: 'test',
          pagination: { page: 1, limit: 100, total: rows.length, totalPages: 1 },
        }),
      };
    },
  });
}

function bodyRows() {
  const table = screen.getByRole('table');
  return within(table).getAllByRole('row').slice(1);
}

describe('TeacherChangesQueue', () => {
  it('shows the requests as a table with teacher, status and resolution columns', async () => {
    const api = mockQueue();
    renderWithProviders(<TeacherChangesQueue />);

    await screen.findByText('Maryam');
    const headers = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim());
    expect(headers).toEqual([
      'Child',
      'Family',
      'Current teacher',
      'Requested / assigned',
      'Reason',
      'Status',
      'Requested on',
      'Resolved',
      '',
    ]);
    expect(bodyRows()).toHaveLength(3);
    const yusuf = bodyRows().find((r) => r.textContent?.includes('Yusuf'))!;
    expect(within(yusuf).getAllByText('Ustadhah Zainab')).toHaveLength(2);
    expect(within(yusuf).getByText('by Admin Amina')).toBeTruthy();
    expect(within(bodyRows()[0]).getByRole('button', { name: /Review|View/ })).toBeTruthy();
    // The whole queue is loaded in one page and filtered in the browser.
    expect(api.calls[0].url).toContain('limit=100');
  });

  it('narrows by family, child, teacher and name search', async () => {
    mockQueue();
    renderWithProviders(<TeacherChangesQueue />);
    await screen.findByText('Maryam');

    expect(await optionLabels(screen.getByLabelText('Family'))).toEqual(['All families', 'Ali family', 'Khan family']);

    await chooseOption(screen.getByLabelText('Family'), 'Khan family');
    expect(bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Maryam'), expect.stringContaining('Yusuf')]),
    );
    expect(bodyRows()).toHaveLength(2);
    // Children offered are only the chosen family's.
    expect(await optionLabels(screen.getByLabelText('Child'))).toEqual(['All children', 'Maryam', 'Yusuf']);

    await chooseOption(screen.getByLabelText('Child'), 'Yusuf');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent).toContain('Yusuf');

    await chooseOption(screen.getByLabelText('Family'), 'All families');
    await chooseOption(screen.getByLabelText('Child'), 'All children');
    await chooseOption(screen.getByLabelText('Teacher'), 'Ustadh Bilal');
    expect(bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('Maryam'),
      expect.stringContaining('Aisha'),
    ]);

    await chooseOption(screen.getByLabelText('Teacher'), 'All teachers');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ali' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent).toContain('Aisha');
  });

  it('keeps the status filter on the server query', async () => {
    const api = mockQueue();
    renderWithProviders(<TeacherChangesQueue />);
    await screen.findByText('Maryam');

    await chooseOption(screen.getByLabelText('Status'), 'Open');
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0].textContent).toContain('Maryam');
    expect(api.calls.some((c) => c.url.includes('status=OPEN'))).toBe(true);
  });
});

describe('filter helpers', () => {
  it('builds distinct, sorted options from the rows with the "All" default first', () => {
    expect(
      optionsFrom(
        [{ c: 'b' }, { c: 'a' }, { c: 'b' }, { c: '' }],
        (r) => ({ value: r.c, label: r.c.toUpperCase() }),
        'All',
      ),
    ).toEqual([
      { value: 'ALL', label: 'All' },
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
  });

  it('matches every word of a search in any field', () => {
    expect(matchesSearch('', 'x')).toBe(true);
    expect(matchesSearch('khan mar', 'Maryam', 'Khan family')).toBe(true);
    expect(matchesSearch('khan omar', 'Maryam', 'Khan family')).toBe(false);
    expect(matchesSearch('x', null, undefined)).toBe(false);
  });
});
