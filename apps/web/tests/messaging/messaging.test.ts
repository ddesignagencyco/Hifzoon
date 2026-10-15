import { describe, it, expect } from 'vitest';
import {
  counterpartName,
  detectContactDetails,
  hasUnread,
  messagingApi,
  ThreadSummary,
  validateMessageBody,
} from '@/lib/api/modules/messaging';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const THREAD = 'thread-1';

const summary = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: THREAD,
  familyId: 'fam',
  teacherId: 'tp',
  studentId: 'stu',
  enrolmentId: 'enr',
  createdAt: '2026-10-15T10:00:00Z',
  updatedAt: '2026-10-15T10:00:00Z',
  family: { id: 'fam', name: 'Khan Family' },
  teacher: { photoUrl: null, user: { name: 'Ustadh Bilal' } },
  messages: [],
  ...over,
});

describe('messaging API module', () => {
  it('lists threads from the guardian and teacher endpoints', async () => {
    const api = mockApi({
      'GET /parent/threads': { body: envelope([summary()]) },
      'GET /teacher/threads': { body: envelope([summary({ teacher: undefined, studentName: 'Maryam' })]) },
    });
    const guardian = await messagingApi.listThreads('guardian');
    const teacher = await messagingApi.listThreads('teacher');
    expect(guardian[0].teacher?.user.name).toBe('Ustadh Bilal');
    expect(teacher[0].studentName).toBe('Maryam');
    expect(api.calls.map((c) => `${c.method} ${c.url.replace(/^.*\/api\/v1/, '')}`)).toEqual([
      'GET /parent/threads',
      'GET /teacher/threads',
    ]);
  });

  it('reads a thread with an optional limit', async () => {
    const api = mockApi({
      [`GET /parent/threads/${THREAD}`]: {
        body: envelope({ thread: summary(), messages: [{ id: 'm1', body: 'Salam', sender: { id: 'u', name: 'A' } }] }),
      },
      [`GET /teacher/threads/${THREAD}`]: { body: envelope({ thread: summary(), messages: [] }) },
    });
    const detail = await messagingApi.getThread('guardian', THREAD);
    await messagingApi.getThread('teacher', THREAD, 200);
    expect(detail.messages[0].body).toBe('Salam');
    expect(api.calls[0].url).toMatch(new RegExp(`/parent/threads/${THREAD}$`));
    expect(api.calls[1].url).toContain(`/teacher/threads/${THREAD}?limit=200`);
  });

  it('POSTs a message body to the side-specific endpoint', async () => {
    const api = mockApi({
      [`POST /parent/threads/${THREAD}/messages`]: (call) => ({ body: envelope({ id: 'm1', ...(call.body as object) }) }),
      [`POST /teacher/threads/${THREAD}/messages`]: (call) => ({ body: envelope({ id: 'm2', ...(call.body as object) }) }),
    });
    const sent = await messagingApi.postMessage('guardian', THREAD, 'Salam ustadh');
    await messagingApi.postMessage('teacher', THREAD, 'Wa alaykum salam');
    expect(sent.body).toBe('Salam ustadh');
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].body).toEqual({ body: 'Salam ustadh' });
    expect(api.calls[1].body).toEqual({ body: 'Wa alaykum salam' });
    expect(api.calls[0].headers.get('Idempotency-Key')).toBeNull();
  });

  it('surfaces a forbidden post (thread not owned)', async () => {
    mockApi({ [`POST /teacher/threads/${THREAD}/messages`]: apiError(403, 'FORBIDDEN', 'You can only post in threads you own') });
    await expect(messagingApi.postMessage('teacher', THREAD, 'hi')).rejects.toMatchObject({ status: 403 });
  });

  it('opens a guardian thread with family, teacher, child and enrolment', async () => {
    const api = mockApi({ 'POST /parent/threads': (call) => ({ body: envelope({ id: THREAD, ...(call.body as object) }) }) });
    const input = { familyId: 'fam', teacherId: 'tp', studentId: 'stu', enrolmentId: 'enr' };
    const thread = await messagingApi.openThread(input);
    expect(thread.id).toBe(THREAD);
    expect(api.calls[0].body).toEqual(input);
  });

  it('surfaces "That teacher does not teach your child"', async () => {
    mockApi({ 'POST /parent/threads': apiError(403, 'FORBIDDEN', 'That teacher does not teach your child') });
    await expect(messagingApi.openThread({ familyId: 'f', teacherId: 't', studentId: 's' })).rejects.toThrow(
      'That teacher does not teach your child',
    );
  });

  it('looks up families, children and a child’s enrolments for the new-thread form', async () => {
    const api = mockApi({
      'GET /families': { body: envelope([{ id: 'fam', name: 'Khan Family' }]) },
      'GET /families/fam/students': { body: envelope([{ id: 'stu', displayName: 'Maryam' }]) },
      'GET /courses/enrolments/list': {
        body: envelope([{ id: 'enr', status: 'ACTIVE', student: { id: 'stu' }, teacher: { id: 'tp', user: { name: 'B' } } }]),
      },
    });
    expect((await messagingApi.families())[0].id).toBe('fam');
    expect((await messagingApi.familyStudents('fam'))[0].displayName).toBe('Maryam');
    expect((await messagingApi.studentEnrolments('stu'))[0].teacher?.id).toBe('tp');
    expect(api.calls[2].url).toContain('/courses/enrolments/list?studentId=stu');
  });
});

describe('messaging helpers', () => {
  it('validates the body like the DTO (trimmed 1..4000)', () => {
    expect(validateMessageBody('   ')).toMatch(/Write a message/);
    expect(validateMessageBody('Salam')).toBeNull();
    expect(validateMessageBody('a'.repeat(4000))).toBeNull();
    expect(validateMessageBody('a'.repeat(4001))).toMatch(/at most 4000/);
  });

  it('flags contact details but not Quran references or times', () => {
    expect(detectContactDetails('email me at dad@example.com')).toBe('an email address');
    expect(detectContactDetails('call +44 7700 900123 please')).toBe('a phone number');
    expect(detectContactDetails('whatsapp wa.me/447700900123')).toMatch(/link/);
    expect(detectContactDetails('see https://example.com')).toMatch(/link/);
    expect(detectContactDetails('We revised Al-Baqarah 2:255 and 2:256 at 17:30')).toBeNull();
    expect(detectContactDetails('Pages 12-14, lesson 3')).toBeNull();
  });

  it('names the other party from the viewer side', () => {
    expect(counterpartName(summary(), 'guardian')).toBe('Ustadh Bilal');
    expect(counterpartName(summary(), 'teacher')).toBe('Khan Family');
  });

  it('marks a thread unread only when the latest message is from the other side and unread', () => {
    const msg = { id: 'm', threadId: THREAD, body: 'x', createdAt: '', readAt: null as string | null };
    expect(hasUnread(summary({ messages: [{ ...msg, senderId: 'other' }] }), 'me')).toBe(true);
    expect(hasUnread(summary({ messages: [{ ...msg, senderId: 'me' }] }), 'me')).toBe(false);
    expect(hasUnread(summary({ messages: [{ ...msg, senderId: 'other', readAt: '2026-10-15' }] }), 'me')).toBe(false);
    expect(hasUnread(summary(), 'me')).toBe(false);
  });
});
