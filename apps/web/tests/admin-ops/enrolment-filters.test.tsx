// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { EnrolmentsPanel } from '@/components/admin/courses/EnrolmentsPanel';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { chooseOption, optionLabels, renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function row(id: string, name: string, family: string, course: { id: string; name: string }) {
  return {
    id,
    status: 'ACTIVE',
    startedAt: '2026-10-10T00:00:00.000Z',
    pausedUntil: null,
    currentLessonPosition: 1,
    student: { id: `stu-${id}`, displayName: name, birthYear: 2016, family: { name: family } },
    course: { ...course, code: course.id.toUpperCase() },
    currentLevel: null,
    teacher: { id: `tp-${id}`, user: { name: 'Ustadh Bilal' } },
  };
}

const HIFZ = { id: 'hifz', name: 'Hifz programme' };
const QAIDA = { id: 'qaida', name: 'Noorani Qaida' };
const ROWS = [row('e1', 'Maryam', 'Khan family', HIFZ), row('e2', 'Yusuf', 'Ali family', QAIDA), row('e3', 'Aisha', 'Khan family', QAIDA)];

afterEach(() => vi.restoreAllMocks());

/** The pager's page-size select also exposes options; keep only the filter menu's. */
const menu = (labels: string[]) => labels.filter((l) => !/^\d+$/.test(l));

describe('admin enrolments course and family filters', () => {
  it('offers only courses and families in the loaded rows and narrows the table', async () => {
    mockApi({
      'GET /courses/enrolments/list': {
        body: envelope(ROWS, { requestId: 't', pagination: { page: 1, limit: 25, total: ROWS.length, totalPages: 1 } }),
      },
    });
    renderWithProviders(<EnrolmentsPanel />);
    expect(await screen.findByText('Maryam')).toBeTruthy();

    expect(menu(await optionLabels(screen.getByLabelText('Course')))).toEqual(['All courses', 'Hifz programme', 'Noorani Qaida']);
    expect(menu(await optionLabels(screen.getByLabelText('Family')))).toEqual(['All families', 'Ali family', 'Khan family']);

    await chooseOption(screen.getByLabelText('Family'), 'Khan family');
    await waitFor(() => expect(screen.queryByText('Yusuf')).toBeNull());
    expect(screen.getByText('Maryam')).toBeTruthy();
    expect(screen.getByText('Aisha')).toBeTruthy();

    await chooseOption(screen.getByLabelText('Course'), 'Noorani Qaida');
    await waitFor(() => expect(screen.queryByText('Maryam')).toBeNull());
    expect(screen.getByText('Aisha')).toBeTruthy();
  }, 15_000);
});
