import { describe, it, expect } from 'vitest';
import { studentApi, extractClassLinks, StudentNotification } from '@/lib/api/modules/student';
import { mockApi, envelope } from '../helpers/fetch-mock';

const CLASS_A = '01a13f96-cccc-7000-8000-00000000000a';
const CLASS_B = '01a13f96-cccc-7000-8000-00000000000b';

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
});

describe('extractClassLinks', () => {
  it('finds class ids from join URLs or classId fields, newest first, deduplicated', () => {
    const links = extractClassLinks([
      n('1', '2026-10-14T10:00:00Z', { joinUrl: `https://app.hifzoon.com/classroom/${CLASS_A}`, teacherName: 'Bilal', localTime: '17:00' }),
      n('2', '2026-10-15T10:00:00Z', { classId: CLASS_B, subject: 'Class in 15 minutes' }),
      n('3', '2026-10-13T10:00:00Z', { joinUrl: `https://app.hifzoon.com/classroom/${CLASS_A}` }),
      n('4', '2026-10-12T10:00:00Z', { classId: 'not-a-uuid' }),
      n('5', '2026-10-11T10:00:00Z', null),
    ]);
    expect(links.map((l) => l.classId)).toEqual([CLASS_B, CLASS_A]);
    expect(links[0].title).toBe('Class in 15 minutes');
    expect(links[1]).toMatchObject({ teacherName: 'Bilal', localTime: '17:00', notificationId: '1' });
  });
});
