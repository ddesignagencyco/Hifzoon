import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { messagingApi, MessageThread } from '@/lib/api/modules/messaging';
import { ApiClientError } from '@/lib/api/http';
import { actAs, actAsAnonymous, SEED, uniq } from '../helpers/live';

/** Guardian ↔ teacher messaging against the live, seeded API. */
describe('live API — messaging', () => {
  let guardianUserId = '';
  let teacherUserId = '';
  let thread: MessageThread;
  const opening = `Salam ustadh, how is Maryam doing? (${uniq('it')})`;
  const reply = `Wa alaykum salam — Maryam is doing well. (${uniq('re')})`;

  beforeAll(async () => {
    guardianUserId = (await actAs('guardian')).userId;
    teacherUserId = (await actAs('teacher')).userId;
  });
  afterAll(() => actAsAnonymous());

  it('guardian derives child + teacher from real data and opens a thread', async () => {
    await actAs('guardian');
    const families = await messagingApi.families();
    expect(families.map((f) => f.id)).toContain(SEED.familyId);

    const students = await messagingApi.familyStudents(SEED.familyId);
    const maryam = students.find((s) => s.id === SEED.students.maryam);
    expect(maryam?.displayName).toBe('Maryam');

    const enrolments = await messagingApi.studentEnrolments(SEED.students.maryam);
    const enrolment = enrolments.find((e) => e.teacher && ['TRIAL', 'ACTIVE', 'PAUSED'].includes(e.status));
    expect(enrolment?.teacher?.id).toBeTruthy();

    thread = await messagingApi.openThread({
      familyId: SEED.familyId,
      teacherId: enrolment!.teacher!.id,
      studentId: SEED.students.maryam,
      enrolmentId: enrolment!.id,
    });
    expect(thread.familyId).toBe(SEED.familyId);
    expect(thread.studentId).toBe(SEED.students.maryam);

    // Opening again for the same family/teacher/child reuses the thread.
    const again = await messagingApi.openThread({
      familyId: SEED.familyId,
      teacherId: enrolment!.teacher!.id,
      studentId: SEED.students.maryam,
    });
    expect(again.id).toBe(thread.id);
  });

  it('refuses a thread with a teacher who does not teach the child', async () => {
    await actAs('guardian');
    const error = await messagingApi
      .openThread({
        familyId: SEED.familyId,
        teacherId: '00000000-0000-7000-8000-00000000dead',
        studentId: SEED.students.maryam,
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).status).toBe(403);
  });

  it('guardian posts a message', async () => {
    await actAs('guardian');
    const message = await messagingApi.postMessage('guardian', thread.id, `  ${opening}  `);
    expect(message.body).toBe(opening);
    expect(message.senderId).toBe(guardianUserId);
  });

  it('teacher sees the thread and the message, then replies', async () => {
    await actAs('teacher');
    const threads = await messagingApi.listThreads('teacher');
    const row = threads.find((t) => t.id === thread.id);
    expect(row).toBeTruthy();
    expect(row?.studentName).toBe('Maryam');
    expect(row?.family.id).toBe(SEED.familyId);
    expect(row?.messages[0]?.body).toBe(opening);

    const detail = await messagingApi.getThread('teacher', thread.id);
    expect(detail.messages.some((m) => m.body === opening && m.senderId === guardianUserId)).toBe(true);

    const sent = await messagingApi.postMessage('teacher', thread.id, reply);
    expect(sent.senderId).toBe(teacherUserId);
  });

  it('guardian reads the reply, oldest-first, and the list shows it as latest', async () => {
    await actAs('guardian');
    const detail = await messagingApi.getThread('guardian', thread.id);
    const bodies = detail.messages.map((m) => m.body);
    expect(bodies.indexOf(opening)).toBeGreaterThanOrEqual(0);
    expect(bodies.indexOf(reply)).toBeGreaterThan(bodies.indexOf(opening));
    const replyMsg = detail.messages.find((m) => m.body === reply);
    expect(replyMsg?.sender.id).toBe(teacherUserId);
    expect(detail.thread.teacher.user.name).toBeTruthy();

    const threads = await messagingApi.listThreads('guardian');
    expect(threads.find((t) => t.id === thread.id)?.messages[0]?.body).toBe(reply);
  });

  it('rejects an empty message body', async () => {
    await actAs('guardian');
    await expect(messagingApi.postMessage('guardian', thread.id, '')).rejects.toBeInstanceOf(ApiClientError);
  });
});
