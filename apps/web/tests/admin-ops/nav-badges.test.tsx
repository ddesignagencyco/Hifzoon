// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Role } from '@/lib/types';
import { PORTALS, navForRoles } from '@/lib/portal/nav';
import { NavBadge, countApplicationsInProgress, countOpenCases, navBadgeText } from '@/components/portal/NavBadges';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

describe('nav badge counts', () => {
  it('formats counts: nothing for 0 or unknown, 99+ above 99', () => {
    expect(navBadgeText(undefined)).toBeNull();
    expect(navBadgeText(0)).toBeNull();
    expect(navBadgeText(7)).toBe('7');
    expect(navBadgeText(140)).toBe('99+');
  });

  it('counts applications still in progress and open / overdue cases', () => {
    expect(countApplicationsInProgress([{ status: 'SUBMITTED' }, { status: 'APPROVED' }, { status: 'REJECTED' }, { status: 'DEMO_CLASS' }])).toBe(2);
    expect(countApplicationsInProgress(undefined)).toBeUndefined();
    const now = Date.parse('2026-10-19T12:00:00.000Z');
    expect(
      countOpenCases(
        [
          { status: 'OPEN', dueAt: '2026-10-19T10:00:00.000Z' },
          { status: 'INVESTIGATING', dueAt: '2026-10-20T10:00:00.000Z' },
          { status: 'CLOSED', dueAt: '2026-10-01T10:00:00.000Z' },
        ],
        now,
      ),
    ).toEqual({ open: 2, overdue: 1 });
  });

  it('puts badges on the queues that have a cheap list endpoint', () => {
    const badged = (key: keyof typeof PORTALS, roles: Role[]) =>
      navForRoles(PORTALS[key], roles)
        .filter((i) => i.badge)
        .map((i) => [i.label, i.badge]);
    expect(badged('admin', [Role.ADMIN])).toEqual([
      ['Teacher changes', 'teacherChangesOpen'],
      ['Teachers', 'applicationsInProgress'],
      ['Enrolments', 'enrolmentsAwaitingTeacher'],
    ]);
    expect(badged('supervisor', [Role.SUPERVISOR])).toEqual([
      ['Hiring pipeline', 'applicationsInProgress'],
      ['Cases', 'casesOpen'],
    ]);
    expect(badged('safeguarding', [Role.SAFEGUARDING_LEAD])).toEqual([['Case board', 'casesOpen']]);
    expect(badged('parent', [Role.GUARDIAN])).toEqual([['Messages', 'unreadThreadsGuardian']]);
    expect(badged('teacher', [Role.TEACHER])).toEqual([['Messages', 'unreadThreadsTeacher']]);
  });
});

describe('<NavBadge>', () => {
  it('shows open teacher-change requests', async () => {
    mockApi({ 'GET /teacher-changes': { body: envelope([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) } });
    renderWithProviders(<NavBadge kind="teacherChangesOpen" viewerUserId="u-1" />);
    expect((await screen.findByText('3')).textContent).toBe('3 open requests');
    expect(screen.getByText('open requests')).toBeTruthy();
  });

  it('shows unread conversations for the viewer only', async () => {
    const thread = (id: string, senderId: string, readAt: string | null) => ({
      id,
      family: { id: 'f', name: 'Khan family' },
      teacher: null,
      student: null,
      updatedAt: '2026-10-18T10:00:00.000Z',
      messages: [{ id: `m-${id}`, body: 'Salaam', senderId, readAt, createdAt: '2026-10-18T10:00:00.000Z' }],
    });
    mockApi({
      'GET /parent/threads': {
        body: envelope([thread('t1', 'teacher-u', null), thread('t2', 'u-1', null), thread('t3', 'teacher-u', '2026-10-18T11:00:00.000Z')]),
      },
    });
    renderWithProviders(<NavBadge kind="unreadThreadsGuardian" viewerUserId="u-1" />);
    expect(await screen.findByText('1')).toBeTruthy();
  });

  it('marks overdue cases and stays silent when the list fails', async () => {
    // The badge now reads exact counts from meta.total of two filtered requests
    // (openOnly → 2 open, overdueOnly → 1 overdue) rather than counting a full list.
    mockApi({
      'GET /cases': (call) => {
        const total = new URL(call.url).searchParams.get('overdueOnly') === 'true' ? 1 : 2;
        return { body: envelope([], { requestId: 'test', pagination: { page: 1, limit: 1, total, totalPages: total } }) };
      },
    });
    const { unmount } = renderWithProviders(<NavBadge kind="casesOpen" viewerUserId="u-1" />);
    expect(await screen.findByText('2')).toBeTruthy();
    expect(screen.getByText('open cases, 1 overdue')).toBeTruthy();
    unmount();

    mockApi({});
    const { container } = renderWithProviders(<NavBadge kind="enrolmentsAwaitingTeacher" viewerUserId="u-1" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
