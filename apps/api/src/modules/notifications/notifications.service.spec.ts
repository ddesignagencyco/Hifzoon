import { NotificationChannel, NotificationStatus } from '@hifzoon/shared';

import { NotificationsService, TEMPLATE } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { QueueService } from '../../queue/queue.service';
import type { Mailer } from '../../integrations/providers';
import type { Messenger } from '../../integrations/providers';

const DATA = {
  studentName: 'Maryam',
  teacherName: 'Ustadh Bilal',
  localTime: '16:00',
  joinUrl: 'https://web.test/class/1',
} as never;

function buildHarness(preferences: { quietFrom: string | null; quietTo: string | null }) {
  const created: Array<Record<string, any>> = [];

  const prisma = {
    user: {
      findMany: jest.fn(async () => [
        {
          id: 'user-1',
          language: 'en',
          notificationPreferences: {
            language: 'en',
            quietFrom: preferences.quietFrom ? new Date(preferences.quietFrom) : null,
            quietTo: preferences.quietTo ? new Date(preferences.quietTo) : null,
          },
        },
      ]),
    },
    notification: {
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        created.push(data);
        return { id: `n-${created.length}`, ...data };
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  } as unknown as PrismaService;

  const queues = { add: jest.fn(async () => undefined) } as unknown as QueueService;
  const mailer = { send: jest.fn() } as unknown as Mailer;
  const messenger = { send: jest.fn() } as unknown as Messenger;

  return { service: new NotificationsService(prisma, queues, mailer, messenger), created, queues };
}

describe('NotificationsService.enqueue quiet hours (FR-NTF-04, B23)', () => {
  const at = (time: string) => new Date(`2026-03-01T${time}:00.000Z`);

  it('queues a notification for a user with no quiet hours set', async () => {
    const { service, created, queues } = buildHarness({ quietFrom: null, quietTo: null });

    const result = await service.enqueue({
      userIds: ['user-1'],
      template: TEMPLATE.CLASS_REMINDER_15_MIN,
      data: DATA,
      channel: NotificationChannel.EMAIL,
      scheduledFor: at('16:00'),
    });

    expect(result.queued).toBe(1);
    expect(created[0].status).toBe(NotificationStatus.QUEUED);
    expect(queues.add).toHaveBeenCalled();
  });

  it('queues outside the quiet window instead of skipping it', async () => {
    const { service, created } = buildHarness({
      quietFrom: '2026-01-01T22:00:00.000Z',
      quietTo: '2026-01-01T07:00:00.000Z',
    });

    await service.enqueue({
      userIds: ['user-1'],
      template: TEMPLATE.CLASS_REMINDER_15_MIN,
      data: DATA,
      scheduledFor: at('16:00'),
    });

    expect(created[0].status).toBe(NotificationStatus.QUEUED);
  });

  it('skips inside the quiet window, including a window that wraps past midnight', async () => {
    const { service, created, queues } = buildHarness({
      quietFrom: '2026-01-01T22:00:00.000Z',
      quietTo: '2026-01-01T07:00:00.000Z',
    });

    await service.enqueue({
      userIds: ['user-1'],
      template: TEMPLATE.CLASS_REMINDER_15_MIN,
      data: DATA,
      scheduledFor: at('23:30'),
    });
    await service.enqueue({
      userIds: ['user-1'],
      template: TEMPLATE.CLASS_REMINDER_15_MIN,
      data: DATA,
      scheduledFor: at('03:00'),
    });

    expect(created).toHaveLength(2);
    for (const row of created) {
      expect(row.status).toBe(NotificationStatus.SKIPPED);
      expect(row.failureReason).toBe('Within quiet hours');
    }
    expect(queues.add).not.toHaveBeenCalled();
  });

  it('delivers a safety-critical alert even inside the quiet window', async () => {
    const { service, created } = buildHarness({
      quietFrom: '2026-01-01T00:00:00.000Z',
      quietTo: '2026-01-01T23:59:00.000Z',
    });

    await service.enqueue({
      userIds: ['user-1'],
      template: TEMPLATE.SAFEGUARDING_ALERT,
      data: DATA,
      scheduledFor: at('03:00'),
    });

    expect(created[0].status).toBe(NotificationStatus.QUEUED);
  });
});

describe('NotificationsService.enqueue missing template data (B34)', () => {
  it('records a FAILED notification instead of sending "undefined"', async () => {
    const { service, created, queues } = buildHarness({ quietFrom: null, quietTo: null });

    const result = await service.enqueue({
      userIds: ['user-1'],
      template: TEMPLATE.CLASS_REMINDER_DAY_BEFORE,
      // Only what the old worker producer sent: no studentName, localTime, timeZone, joinUrl.
      data: {
        courseName: 'Hifz',
        teacherName: 'Ustadh Bilal',
        startsAt: '2026-10-20T11:00:00Z',
      } as never,
    });

    expect(result).toEqual({ queued: 0 });
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe(NotificationStatus.FAILED);
    expect(created[0].failureReason).toMatch(/Missing template data: .*studentName/);
    expect(queues.add).not.toHaveBeenCalled();
  });

  it('never renders the word "undefined" for a complete payload', () => {
    const { service } = buildHarness({ quietFrom: null, quietTo: null });
    const copy = service.resolve(TEMPLATE.CLASS_REMINDER_DAY_BEFORE, 'en', {
      studentName: 'Maryam',
      teacherName: 'Ustadh Bilal',
      localTime: '16:00',
      timeZone: 'Asia/Karachi',
      joinUrl: 'https://web.test/classroom/1',
    } as never);

    expect(copy.missing).toEqual([]);
    expect(`${copy.subject} ${copy.body}`).not.toMatch(/undefined/);
  });
});
