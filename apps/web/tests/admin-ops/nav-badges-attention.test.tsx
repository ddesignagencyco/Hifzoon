// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { Role } from '@/lib/types';
import { PORTALS, canUseAccountSettings, navForRoles } from '@/lib/portal/nav';
import { NavBadge, countBillingAttention, countOpenDataRequests } from '@/components/portal/NavBadges';
import { hrefForNotification } from '@/lib/portal/notification-links';
import type { NotificationRecord } from '@/lib/api/modules/notifications';
import { mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sub = (over: Record<string, unknown>) => ({ id: 's', familyId: 'f', status: 'ACTIVE', setup: null, ...over }) as never;
const inv = (status: string) => ({ id: status, familyId: 'f', status }) as never;

describe('attention counts', () => {
  it('counts invoices to pay and live plans that need weekly times', () => {
    expect(countBillingAttention(undefined)).toBeUndefined();
    expect(
      countBillingAttention({
        invoices: [inv('OPEN'), inv('FAILED'), inv('PAID')],
        subscriptions: [
          sub({ setup: { timesNeeded: true } }),
          sub({ setup: { scheduleError: 'slot taken' } }),
          sub({ status: 'CANCELLED', setup: { timesNeeded: true } }),
          sub({}),
        ],
      }),
    ).toBe(4);
  });

  it('counts open data requests and the overdue ones', () => {
    expect(
      countOpenDataRequests([
        { status: 'REQUESTED', overdue: true },
        { status: 'IN_PROGRESS', overdue: false },
        { status: 'COMPLETED', overdue: false },
        { status: 'REJECTED', overdue: false },
      ]),
    ).toEqual({ open: 2, overdue: 1 });
  });

  it('puts the billing badge on the family Billing item when billing is on', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');
    const billing = navForRoles(PORTALS.parent, [Role.GUARDIAN]).find((i) => i.label === 'Billing');
    expect(billing?.badge).toBe('billingAttention');
  });

  it('gives a kids-PIN session no account settings', () => {
    expect(canUseAccountSettings([Role.CHILD_STUDENT])).toBe(false);
    expect(canUseAccountSettings([Role.STUDENT])).toBe(true);
    expect(canUseAccountSettings([Role.GUARDIAN])).toBe(true);
  });
});

describe('<NavBadge> for the new queues', () => {
  it('shows interviews that ended without a verdict', async () => {
    const api = mockApi({ 'GET /interviews': { body: [{ id: 'i1' }, { id: 'i2' }] } });
    renderWithProviders(<NavBadge kind="interviewsAwaitingOutcome" viewerUserId="u" />);
    expect((await screen.findByText('2')).textContent).toBe('2 interviews waiting for a result');
    expect(api.calls[0].url).toContain('awaitingOutcome=true');
  });

  it('adds lesson cards and trial results on the teacher Today item', async () => {
    mockApi({
      'GET /teacher/lesson-cards/outstanding': { body: [{ classId: 'c1' }, { classId: 'c2' }] },
      'GET /trials/awaiting-result': { body: [{ id: 't1' }] },
    });
    renderWithProviders(<NavBadge kind="teacherTodayTasks" viewerUserId="u" />);
    expect((await screen.findByText('3')).textContent).toBe('3 lesson cards and trial results to write');
  });

  it('shows the lesson cards still to write on Lesson cards', async () => {
    mockApi({ 'GET /teacher/lesson-cards/outstanding': { body: [{ classId: 'c1' }, { classId: 'c2' }] } });
    renderWithProviders(<NavBadge kind="teacherLessonCardsDue" viewerUserId="u" />);
    expect((await screen.findByText('2')).textContent).toBe('2 lesson cards to write');
  });

  it('counts trial results to record, leaving out trials marked teacher absent', async () => {
    mockApi({
      'GET /trials/awaiting-result': {
        body: [
          { id: 't1', status: 'COMPLETED' },
          { id: 't2', status: 'NO_SHOW_TEACHER' },
        ],
      },
    });
    renderWithProviders(<NavBadge kind="teacherTrialResultsDue" viewerUserId="u" />);
    expect((await screen.findByText('1')).textContent).toBe('1 trial results to record');
  });

  it('shows children missing a required consent', async () => {
    mockApi({ 'GET /consent/missing': { body: [{ studentId: 's1', missing: ['DATA_COLLECTION'] }] } });
    renderWithProviders(<NavBadge kind="consentMissing" viewerUserId="u" />);
    expect((await screen.findByText('1')).textContent).toBe('1 children missing a required consent');
  });

  it('shows the family billing items to sort out', async () => {
    mockApi({
      'GET /billing/family': {
        body: { invoices: [inv('OPEN')], subscriptions: [sub({ setup: { timesNeeded: true } })] },
      },
    });
    renderWithProviders(<NavBadge kind="billingAttention" viewerUserId="u" />);
    expect((await screen.findByText('2')).textContent).toBe('2 billing items to sort out');
  });

  it('shows open data requests, marking overdue ones', async () => {
    const api = mockApi({
      'GET /admin/data-requests': {
        body: [
          { id: 'a', status: 'REQUESTED', overdue: true },
          { id: 'b', status: 'IN_PROGRESS', overdue: false },
        ],
      },
    });
    renderWithProviders(<NavBadge kind="dataRequestsOpen" viewerUserId="u" />);
    expect(await screen.findByText('open data requests, 1 overdue')).toBeTruthy();
    expect(api.calls[0].url).toContain('openOnly=true');
  });

  it('shows unread notifications from the same endpoint as the bell', async () => {
    mockApi({ 'GET /notifications/unread-count': { body: { unread: 5 } } });
    renderWithProviders(<NavBadge kind="notificationsUnread" viewerUserId="u" />);
    expect((await screen.findByText('5')).textContent).toBe('5 unread notifications');
  });
});

describe('bell links for the new notices', () => {
  const n = (type: string) => ({ id: 'n', type, payload: {}, createdAt: '2026-11-06T00:00:00Z' }) as unknown as NotificationRecord;
  it('opens the right page per portal', () => {
    expect(hrefForNotification(n('consent.data-request-deadline'), 'admin')).toBe('/admin/data-requests');
    expect(hrefForNotification(n('consent.data-request-rejected'), 'parent')).toBe('/parent/privacy');
    expect(hrefForNotification(n('trial.teacher-assigned'), 'parent')).toBe('/parent/children');
    expect(hrefForNotification(n('consent.data-request-deadline'), 'parent')).toBeNull();
  });
});
