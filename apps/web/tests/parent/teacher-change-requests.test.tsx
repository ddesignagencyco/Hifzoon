// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TeacherChangeRequests } from '@/components/parent/TeacherChangeRequests';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function request(id: string, familyId: string, status: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    familyId,
    studentId: `stu-${id}`,
    enrolmentId: `enr-${id}`,
    reason: `Reason for ${id}`,
    status,
    resolvedById: null,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
    studentName: `Child ${id}`,
    family: { id: familyId, name: 'Khan family' },
    resolvedBy: null,
    ...extra,
  };
}

describe('Family teacher-change requests', () => {
  it('lists this family’s requests newest first with their status and a link to the child', async () => {
    mockApi({
      'GET /teacher-changes': {
        body: envelope([
          request('a', 'fam-1', 'DECLINED', '2026-10-01T00:00:00.000Z', {
            resolvedAt: '2026-10-03T00:00:00.000Z',
            resolvedBy: { id: 'adm', name: 'Academy Admin' },
          }),
          request('b', 'fam-1', 'OPEN', '2026-10-12T00:00:00.000Z'),
          request('c', 'fam-2', 'OPEN', '2026-10-13T00:00:00.000Z'),
        ]),
      },
    });
    renderWithProviders(<TeacherChangeRequests familyId="fam-1" />);

    expect(await screen.findByText('Teacher-change requests')).toBeTruthy();
    const names = screen.getAllByText(/^Child /).map((el) => el.textContent);
    expect(names).toEqual(['Child b', 'Child a']);
    expect(screen.queryByText('Child c')).toBeNull();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(screen.getByText(/by Academy Admin/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'View courses' })[0].getAttribute('href')).toBe('/parent/children/stu-b?tab=courses');
  });

  it('renders nothing until the family has made a request', async () => {
    const api = mockApi({ 'GET /teacher-changes': { body: envelope([]) } });
    const { container } = renderWithProviders(<TeacherChangeRequests familyId="fam-1" />);
    await vi.waitFor(() => expect(api.calls.length).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
