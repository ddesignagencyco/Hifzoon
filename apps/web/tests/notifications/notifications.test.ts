import { describe, it, expect } from 'vitest';
import { notificationsApi, toHHmm, describeNotification, isBrokenText, NotificationRecord } from '@/lib/api/modules/notifications';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

describe('notifications API module', () => {
  it('lists notifications with pagination params', async () => {
    const api = mockApi({
      'GET /notifications': {
        body: envelope(
          [{ id: 'n1', type: 'CLASS_REMINDER', channel: 'EMAIL', status: 'SENT', sentAt: null, createdAt: '2026-10-15T10:00:00Z', payload: null }],
          { page: 2, limit: 10, total: 11, totalPages: 2 },
        ),
      },
    });

    const page = await notificationsApi.list({ page: 2, limit: 10 });

    expect(api.calls[0].url).toContain('/notifications?page=2&limit=10');
    expect(page.items[0].type).toBe('CLASS_REMINDER');
    expect(page.meta.totalPages).toBe(2);
  });

  it('patches only the provided preference fields', async () => {
    const api = mockApi({
      'PATCH /notifications/preferences': (call) => ({ body: envelope({ userId: 'u1', ...(call.body as object) }) }),
    });

    await notificationsApi.updatePreferences({ whatsapp: true, quietFrom: '21:00', quietTo: '07:00' });

    expect(api.calls[0].body).toEqual({ whatsapp: true, quietFrom: '21:00', quietTo: '07:00' });
  });

  it('surfaces validation errors for bad quiet hours', async () => {
    mockApi({ 'PATCH /notifications/preferences': apiError(400, 'VALIDATION_FAILED', 'quietFrom must be HH:mm') });
    await expect(notificationsApi.updatePreferences({ quietFrom: '25:00' })).rejects.toThrow('quietFrom must be HH:mm');
  });

  it('normalises stored quiet-hour timestamps to HH:mm', () => {
    expect(toHHmm('1970-01-01T21:30:00.000Z')).toBe('21:30');
    expect(toHHmm('07:05')).toBe('07:05');
    expect(toHHmm(null)).toBe('');
  });

  it('describes a notification from its payload subject or template type', () => {
    expect(describeNotification({ id: '1', type: 'lesson_card.ready', channel: 'EMAIL', status: 'SENT', sentAt: null, createdAt: '', payload: null }).title).toBe('Lesson card ready');
    expect(describeNotification({ id: '2', type: 'X', channel: 'EMAIL', status: 'SENT', sentAt: null, createdAt: '', payload: { subject: 'Class in 15 minutes' } }).title).toBe('Class in 15 minutes');
    // Backend template types get a proper title when the payload has no subject.
    expect(describeNotification({ id: '3', type: 'consent.data-request', channel: 'EMAIL', status: 'SKIPPED', sentAt: null, createdAt: '', payload: {} }).title).toBe('Your data export is ready');
    expect(describeNotification({ id: '4', type: 'class.rescheduled', channel: 'IN_APP', status: 'SENT', sentAt: null, createdAt: '', payload: null }).title).toBe('Class rescheduled');
  });
});

describe('describeNotification with a badly rendered reminder (backend B34)', () => {
  // Exactly what the worker's day-before reminder stored for parent@hifzoon.test.
  const broken = {
    id: 'n1',
    type: 'class.reminder.day-before',
    channel: 'IN_APP',
    status: 'SENT',
    sentAt: null,
    createdAt: '2026-10-18T15:00:00.000Z',
    payload: {
      subject: 'Class tomorrow: undefined',
      body: 'Ustadh Bilal Rahman is teaching undefined tomorrow at undefined (undefined). Join: undefined',
      startsAt: '2026-10-19T15:00:00.000Z',
      courseName: 'Hifz',
      teacherName: 'Ustadh Bilal Rahman',
    },
  } as unknown as NotificationRecord;

  it('never shows "undefined"; builds the text from the payload instead', () => {
    const { title, body } = describeNotification(broken);
    expect(title).toBe('Class tomorrow: Hifz');
    expect(body).toMatch(/^Hifz with Ustadh Bilal Rahman · /);
    expect(`${title} ${body}`).not.toMatch(/undefined/);
  });

  it('keeps well-formed backend text as it is', () => {
    const ok = { ...broken, payload: { subject: 'Class tomorrow: Maryam', body: 'Ustadh Bilal is teaching Maryam tomorrow at 16:00 (Europe/London).' } } as unknown as NotificationRecord;
    expect(describeNotification(ok)).toEqual({ title: 'Class tomorrow: Maryam', body: 'Ustadh Bilal is teaching Maryam tomorrow at 16:00 (Europe/London).' });
  });

  it('flags broken text but not ordinary words', () => {
    expect(isBrokenText('at undefined (undefined)')).toBe(true);
    expect(isBrokenText('Nullah Road')).toBe(false);
  });
});
