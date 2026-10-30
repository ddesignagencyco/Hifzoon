import { describe, it, expect } from 'vitest';
import { studentApi, StudentNotification } from '@/lib/api/modules/student';
import { mockApi, envelope } from '../helpers/fetch-mock';

const n = (id: string, createdAt: string, payload: Record<string, unknown> | null, type = 'class.reminder_15min'): StudentNotification => ({
  id,
  type,
  channel: 'IN_APP',
  status: 'SENT',
  sentAt: null,
  createdAt,
  payload,
});

describe('student API module', () => {
  it('reads the signed-in profile and paginated notifications', async () => {
    const api = mockApi({
      'GET /auth/me': { body: envelope({ id: 'u1', name: 'Yusuf', timeZone: 'Europe/London', roles: ['STUDENT'] }) },
      'GET /notifications': { body: envelope([n('1', '2026-10-15T10:00:00Z', null)], { page: 1, limit: 50, total: 1, totalPages: 1 }) },
    });
    expect((await studentApi.me()).name).toBe('Yusuf');
    const page = await studentApi.notifications({ page: 1, limit: 50 });
    expect(api.calls[1].url).toContain('/notifications?page=1&limit=50');
    expect(page.meta.total).toBe(1);
  });

  it('reads its own timetable for a window in its zone (M49)', async () => {
    const api = mockApi({
      'GET /scheduling/students/me/timetable': {
        body: envelope([{ id: 'c1', type: 'REGULAR', status: 'SCHEDULED', startsAt: '2026-10-30T16:00:00Z', endsAt: '2026-10-30T16:30:00Z' }]),
      },
    });
    const rows = await studentApi.timetable({ from: '2026-10-29T00:00:00Z', to: '2026-11-12T00:00:00Z', tz: 'Europe/London' });
    expect(rows).toHaveLength(1);
    expect(api.calls[0].url).toContain('/scheduling/students/me/timetable?');
    expect(api.calls[0].url).toContain('tz=Europe%2FLondon');
  });
});
