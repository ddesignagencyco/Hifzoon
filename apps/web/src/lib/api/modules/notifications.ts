import { http, Paginated } from '../http';

/** Row from `GET /notifications` (NotificationsService.listForUser). */
export interface NotificationRecord {
  id: string;
  type: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'PUSH' | 'IN_APP' | string;
  /** QUEUED, SENT, DELIVERED or READ (provider-confirmed via webhook), FAILED, SKIPPED. */
  status: string;
  sentAt: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
}

export interface NotificationPreferences {
  userId: string;
  email: boolean;
  whatsapp: boolean;
  push: boolean;
  /** Stored as a 1970-01-01 UTC timestamp, or `HH:mm` when echoed back. */
  quietFrom: string | null;
  quietTo: string | null;
  language: string;
}

export interface UpdateNotificationPreferences {
  email?: boolean;
  whatsapp?: boolean;
  push?: boolean;
  quietFrom?: string;
  quietTo?: string;
  language?: string;
}

export const notificationsApi = {
  list: (params: { page?: number; limit?: number } = {}) =>
    http.getPage<NotificationRecord>('/notifications', { query: params }),
  preferences: () => http.get<NotificationPreferences>('/notifications/preferences'),
  updatePreferences: (body: UpdateNotificationPreferences) =>
    http.patch<NotificationPreferences>('/notifications/preferences', body),
  registerDevice: (body: { platform: 'WEB' | 'IOS' | 'ANDROID'; token: string }) =>
    http.post<{ id: string; platform: string }>('/notifications/devices', body),
  preferencesForUser: (userId: string) =>
    http.get<NotificationPreferences | null>(`/notifications/preferences/${encodeURIComponent(userId)}`),
};

export type NotificationsPage = Paginated<NotificationRecord>;

/** `1970-01-01T21:00:00.000Z` or `21:00` → `21:00` (quiet hours are stored as UTC times). */
export function toHHmm(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

/** Titles for the backend's notification templates (notifications.service.ts TEMPLATE). */
const TITLES: Record<string, string> = {
  'class.reminder.day-before': 'Class tomorrow',
  'class.reminder.15-min': 'Class starts in 15 minutes',
  'class.cancelled': 'Class cancelled',
  'class.rescheduled': 'Class rescheduled',
  'lesson-card.ready': 'New lesson card',
  'trial.booked': 'Trial class booked',
  'report-card.ready': 'Monthly report card ready',
  'class.missed': 'Missed class',
  'class.teacher-change': 'Teacher change',
  'billing.payment-failed': 'Payment failed',
  'case.safeguarding-alert': 'Safeguarding alert',
  'auth.password-reset': 'Password reset requested',
  'auth.account-locked': 'Account locked',
  'consent.guardian-verification': 'Guardian verification code',
  'consent.data-request': 'Data request received',
};

/** Best-effort human title for a notification from its template type + payload. */
export function describeNotification(n: NotificationRecord): { title: string; body?: string } {
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const subject = typeof payload.subject === 'string' ? payload.subject : undefined;
  const body = typeof payload.body === 'string' ? payload.body : undefined;
  const title =
    subject ??
    TITLES[n.type] ??
    n.type
      .replace(/[._]/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  return { title, body };
}
