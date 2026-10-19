// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@/lib/types';
import { NotificationRecord } from '@/lib/api/modules/notifications';
import {
  classIdFromJoinUrl,
  hasUnseenNotifications,
  hrefForNotification,
  notificationsPageFor,
  notificationsSeenKey,
  readNotificationsSeenAt,
  writeNotificationsSeenAt,
} from '@/lib/portal/notification-links';
import { clearAccessToken } from '@/lib/api/client';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { NotificationBell } from '@/components/portal/NotificationBell';

afterEach(() => {
  clearAccessToken();
  window.localStorage.clear();
});

function n(type: string, payload: Record<string, unknown> | null, createdAt = '2026-10-18T10:00:00.000Z'): NotificationRecord {
  return { id: `${type}-${createdAt}`, type, channel: 'IN_APP', status: 'SENT', sentAt: null, createdAt, payload };
}

describe('hrefForNotification', () => {
  it('sends a safeguarding alert to the case in the viewer’s portal', () => {
    const alert = n('case.safeguarding-alert', { caseId: 'case-1' });
    expect(hrefForNotification(alert, 'safeguarding')).toBe('/safeguarding/cases/case-1');
    expect(hrefForNotification(alert, 'supervisor')).toBe('/supervisor/cases/case-1');
    expect(hrefForNotification(alert, 'admin', [Role.SUPER_ADMIN])).toBe('/safeguarding/cases/case-1');
    // A plain admin can't open the safeguarding portal, so the row isn't a link.
    expect(hrefForNotification(alert, 'admin', [Role.ADMIN])).toBeNull();
    expect(hrefForNotification(alert, 'parent')).toBeNull();
  });

  it('opens a message thread for the family or teacher side', () => {
    const msg = n('message.new', { threadId: 'th 1' });
    expect(hrefForNotification(msg, 'parent')).toBe('/parent/messages/th%201');
    expect(hrefForNotification(msg, 'teacher')).toBe('/teacher/messages/th%201');
    expect(hrefForNotification(msg, 'admin')).toBeNull();
  });

  it('opens a lesson card (the parent route resolves the child)', () => {
    const card = n('lesson-card.ready', { lessonCardId: 'lc-1', studentName: 'Maryam' });
    expect(hrefForNotification(card, 'parent')).toBe('/parent/lesson-cards/lc-1');
    expect(hrefForNotification(card, 'supervisor', [Role.SUPERVISOR])).toBe('/supervisor/lesson-cards/lc-1');
    expect(hrefForNotification(card, 'teacher')).toBeNull();
  });

  it('opens the classroom from a reminder’s classId or joinUrl', () => {
    const reminder = n('class.reminder.15-min', { joinUrl: 'https://app.hifzoon.com/classroom/cls-9' });
    expect(classIdFromJoinUrl('https://app.hifzoon.com/classroom/cls-9?x=1')).toBe('cls-9');
    expect(classIdFromJoinUrl('https://example.com/other')).toBeUndefined();
    expect(hrefForNotification(reminder, 'parent')).toBe('/parent/classroom/cls-9');
    expect(hrefForNotification(reminder, 'teacher')).toBe('/teacher/classroom/cls-9');
    expect(hrefForNotification(reminder, 'student')).toBe('/student/classroom/cls-9');
    expect(hrefForNotification(n('x', { classId: 'cls-2' }), 'parent')).toBe('/parent/classroom/cls-2');
  });

  it('maps class changes to the timetable and data exports to privacy', () => {
    expect(hrefForNotification(n('class.cancelled', { localDate: '2026-10-20' }), 'parent')).toBe('/parent/timetable');
    expect(hrefForNotification(n('class.rescheduled', null), 'teacher')).toBe('/teacher/timetable');
    expect(hrefForNotification(n('consent.data-request', { type: 'export', reference: 'AB12CD34' }), 'parent')).toBe('/parent/privacy');
    expect(hrefForNotification(n('consent.data-request', {}), 'teacher')).toBeNull();
  });

  it('returns null for notifications with nowhere to go, and keeps billing hidden while it is off', () => {
    expect(hrefForNotification(n('auth.password-reset', { subject: 'Reset' }), 'parent')).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', '');
    expect(hrefForNotification(n('billing.payment-failed', {}), 'parent')).toBeNull();
    vi.unstubAllEnvs();
  });

  it('knows which portals have a notifications page', () => {
    expect(notificationsPageFor('parent')).toBe('/parent/notifications');
    expect(notificationsPageFor('admin')).toBe('/admin/notifications');
    expect(notificationsPageFor('supervisor')).toBe('/supervisor/notifications');
    expect(notificationsPageFor('safeguarding')).toBe('/safeguarding/notifications');
  });
});

describe('"new since last opened"', () => {
  it('is new until the bell was opened after the newest item', () => {
    const items = [n('a', null, '2026-10-18T10:00:00.000Z')];
    expect(hasUnseenNotifications([], null)).toBe(false);
    expect(hasUnseenNotifications(items, null)).toBe(true);
    expect(hasUnseenNotifications(items, '2026-10-18T09:00:00.000Z')).toBe(true);
    expect(hasUnseenNotifications(items, '2026-10-18T11:00:00.000Z')).toBe(false);
    expect(hasUnseenNotifications(items, 'garbage')).toBe(true);
  });

  it('survives storage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readNotificationsSeenAt('k')).toBeNull();
    expect(() => writeNotificationsSeenAt('k', 'x')).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('NotificationBell', () => {
  const lead = {
    id: 'u-lead',
    email: 'safeguarding@hifzoon.test',
    name: 'Safeguarding Lead',
    roles: [Role.SAFEGUARDING_LEAD],
    status: 'ACTIVE',
    twoFactorEnabled: true,
    lastActiveAt: null,
    language: 'en',
    timeZone: 'UTC',
  };

  function mockBell(items: NotificationRecord[]) {
    return mockApi({
      'POST /auth/refresh': { body: envelope({ accessToken: 'tok', expiresIn: 900, user: lead }) },
      'GET /auth/me': { body: envelope(lead) },
      'GET /notifications': {
        body: envelope(items, { requestId: 'r', pagination: { page: 1, limit: 5, total: items.length, totalPages: 1 } }),
      },
    });
  }

  it('links items, offers "See all" and clears the dot once opened', async () => {
    mockBell([n('case.safeguarding-alert', { caseId: 'case-7', subject: 'Safeguarding alert' }, '2020-01-01T00:00:00.000Z')]);
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell portal="safeguarding" />);

    const bell = await screen.findByRole('button', { name: 'Notifications (new)' });
    await user.click(bell);
    const link = await screen.findByRole('link', { name: /Safeguarding alert/ });
    await waitFor(() => expect(link.getAttribute('href')).toBe('/safeguarding/cases/case-7'));
    expect(screen.getByRole('link', { name: 'See all notifications' }).getAttribute('href')).toBe('/safeguarding/notifications');

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(window.localStorage.getItem(notificationsSeenKey('u-lead'))).toBeTruthy();
  });

  it('shows no dot when nothing is newer than the last visit', async () => {
    window.localStorage.setItem(notificationsSeenKey('u-lead'), '2026-10-19T00:00:00.000Z');
    mockBell([n('message.new', { threadId: 't' }, '2026-10-18T10:00:00.000Z')]);
    renderWithProviders(<NotificationBell portal="safeguarding" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy());
    // Give the list time to load: the label must stay without "(new)".
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Notifications (new)' })).toBeNull();
  });
});
