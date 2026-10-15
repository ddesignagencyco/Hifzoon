import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setAccessToken } from '@/lib/api/client';
import { http } from '@/lib/api/http';
import { classroomApi } from '@/lib/api/modules/classroom';
import { mushafApi } from '@/lib/api/modules/mushaf';
import { lessonsApi } from '@/lib/api/modules/lessons';
import { API_URL, SEED_PASSWORD, actAs, actAsAnonymous, uniq } from '../helpers/live';

/**
 * Live classroom → mistakes → lesson card walk against the seeded API.
 *
 * Every run provisions its own family, child and teacher and books a class that is
 * live *now* (the room only opens ±10 minutes around the class), following
 * apps/api/scripts/full-flow-check.ts. Fresh records avoid the teacher/student
 * double-booking exclusion constraints colliding across runs.
 */

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status} ${json?.message}`);
  return json.data.accessToken as string;
}

const ctx = {
  classId: '',
  studentId: '',
  teacherToken: '',
  guardianToken: '',
  lessonCardId: '',
};

describe('live API — classroom, mushaf and lesson cards', () => {
  beforeAll(async () => {
    const tag = uniq('cls');

    // A fresh guardian with a child and the consents booking needs (CR-01).
    actAsAnonymous();
    const guardianEmail = `${tag}@example.test`;
    await http.post('/auth/register', { email: guardianEmail, password: SEED_PASSWORD, name: 'Classroom Test Guardian', timeZone: 'Europe/London' });
    ctx.guardianToken = await login(guardianEmail, SEED_PASSWORD);
    setAccessToken(ctx.guardianToken);
    const family = await http.post<{ id: string }>('/families', { name: 'Classroom Test Family', country: 'GB', currency: 'GBP', timeZone: 'Europe/London' });
    const child = await http.post<{ id: string }>(`/families/${family.id}/students`, {
      displayName: 'Amina',
      birthYear: new Date().getUTCFullYear() - 9,
      gender: 'FEMALE',
    });
    ctx.studentId = child.id;
    await http.post(`/consent/students/${child.id}/grant`, {
      purposes: ['DATA_COLLECTION', 'CLASS_RECORDING'],
      method: 'CARD_CHECK',
      policyVersion: 'v1',
    });

    // A fresh, fully cleared teacher (super admin console + hiring pipeline).
    await actAs('superAdmin');
    const courses = await http.get<Array<{ id: string; code: string }>>('/courses');
    const hifz = courses.find((c) => c.code === 'HIFZ');
    if (!hifz) throw new Error('HIFZ course missing from the seed');
    const teacherEmail = `${tag}-teacher@hifzoon.test`;
    const teacherPassword = 'Hifzoon!ClassroomTest2026';
    const teacher = await http.post<{ id: string; applicationId: string }>('/admin/console/teachers', {
      email: teacherEmail,
      name: `Classroom Test Teacher ${tag}`,
      password: teacherPassword,
      languages: ['en'],
      subjects: [hifz.code],
      ageGroups: ['10-13'],
      gender: 'MALE',
    });
    await http.post(`/teachers/profiles/${teacher.id}/safeguarding-training`, { completedAt: new Date().toISOString() });
    for (const step of ['RECITATION_REVIEW', 'DEMO_CLASS', 'ID_CHECK', 'REFERENCE_CHECK', 'TRAINING']) {
      await http.post(`/teachers/applications/${teacher.applicationId}/steps`, { step, status: 'PASSED' });
    }
    const enrolment = await http.post<{ id: string }>('/courses/enrolments', {
      studentId: child.id,
      courseId: hifz.id,
      teacherId: teacher.id,
      status: 'ACTIVE',
    });

    // A class that started a minute ago, so the room is open.
    const booked = await http.post<{ id: string }>('/scheduling/book', {
      teacherId: teacher.id,
      courseId: hifz.id,
      studentId: child.id,
      enrolmentId: enrolment.id,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE',
      type: 'REGULAR',
    });
    ctx.classId = booked.id;
    ctx.teacherToken = await login(teacherEmail, teacherPassword);
  }, 60_000);

  afterAll(() => actAsAnonymous());

  it('serves the Mushaf layouts publicly and a page to a signed-in teacher', async () => {
    actAsAnonymous();
    const layouts = await mushafApi.layouts();
    expect(layouts.map((l) => l.layout).sort()).toEqual(['INDOPAK_13', 'INDOPAK_16', 'MADANI_15']);
    expect(layouts.find((l) => l.layout === 'MADANI_15')?.linesPerPage).toBe(15);

    setAccessToken(ctx.teacherToken);
    const page = await mushafApi.page('MADANI_15', 12);
    expect(page.page).toBe(12);
    expect(page.lines).toHaveLength(15);
    expect(typeof page.licensed).toBe('boolean');
    await expect(mushafApi.page('MADANI_15', 999)).rejects.toMatchObject({ status: 400 });

    const words = await mushafApi.ayahWords({ layout: 'MADANI_15', surah: 1, ayah: 1 });
    expect(Array.isArray(words.words)).toBe(true);
  });

  it('issues the teacher a room token and drives the shared state', async () => {
    setAccessToken(ctx.teacherToken);
    const token = await classroomApi.token(ctx.classId);
    expect(token.role).toBe('TEACHER');
    expect(token.cid).toBe(ctx.classId);
    expect(token.token).toMatch(/\./);
    expect(token.url).toBeTruthy();

    expect(await classroomApi.setPage(ctx.classId, 3)).toMatchObject({ page: 3 });
    expect(await classroomApi.setHighlight(ctx.classId, { surah: 2, ayah: 5, wordIndex: 1 })).toEqual({ surah: 2, ayah: 5, wordIndex: 1 });
    expect(await classroomApi.setLayout(ctx.classId, 'INDOPAK_13')).toEqual({ layout: 'INDOPAK_13' });
    expect(await classroomApi.setTajweed(ctx.classId, true)).toEqual({ tajweedColours: true });

    const state = await classroomApi.state(ctx.classId);
    expect(state).toMatchObject({ classId: ctx.classId, layout: 'INDOPAK_13', tajweedColours: true, page: 3, highlight: { surah: 2, ayah: 5, wordIndex: 1 } });
    expect(Array.isArray(state.participants)).toBe(true);

    const attendance = await classroomApi.attendance(ctx.classId);
    expect(attendance.classId).toBe(ctx.classId);
    expect(typeof attendance.summary.stillConnected).toBe('number');

    const consent = await classroomApi.recordingConsent(ctx.classId);
    expect(consent.students.map((s) => s.studentId)).toEqual([ctx.studentId]);
    expect(consent.allowed).toBe(true);

    const advice = await classroomApi.bandwidthAdvice({ rttMs: 1200, downlinkKbps: 80, packetLossPercent: 20 });
    expect(advice).toMatchObject({ tier: 'AUDIO_ONLY', publishVideo: false, publishAudio: true });
  });

  it('lets the guardian join view-only and follow the state, but not drive it (FR-CLS-13)', async () => {
    setAccessToken(ctx.guardianToken);
    const token = await classroomApi.token(ctx.classId);
    expect(token.role).toBe('GUARDIAN_VIEWER');
    const state = await classroomApi.state(ctx.classId);
    expect(state.page).toBe(3);
    await expect(classroomApi.setPage(ctx.classId, 4)).rejects.toMatchObject({ status: 403 });
  });

  it('logs a mistake and reads it back', async () => {
    setAccessToken(ctx.teacherToken);
    const marked = await lessonsApi.markMistake(ctx.classId, {
      studentId: ctx.studentId,
      surah: 2,
      ayah: 5,
      wordIndex: 1,
      type: 'TAJWEED_RULE',
      tajweedRule: 'Ghunnah',
    });
    expect(marked).toMatchObject({ classId: ctx.classId, type: 'TAJWEED_RULE', tajweedRule: 'Ghunnah', confirmed: true });

    const list = await lessonsApi.classMistakes(ctx.classId);
    expect(list.map((m) => m.id)).toContain(marked.id);

    const history = await lessonsApi.studentMistakes(ctx.studentId, { limit: 10 });
    expect(history.find((m) => m.id === marked.id)).toMatchObject({ source: 'CLASS', classId: ctx.classId });
  });

  it('prefills, submits and reads back the lesson card with its edit log', async () => {
    setAccessToken(ctx.teacherToken);
    const prefill = await lessonsApi.prefill(ctx.classId);
    expect(prefill.classId).toBe(ctx.classId);
    expect(prefill.students[0].id).toBe(ctx.studentId);
    expect(prefill.mistakes.length).toBeGreaterThan(0);
    expect(prefill.portions[0]).toMatchObject({ kind: 'SABAQ', fromSurah: 2, fromAyah: 5 });
    expect(prefill.pagesShown).toEqual({ lastPage: 3 });

    const submitted = await lessonsApi.submit(ctx.classId, {
      homework: 'Revise page 3 twice',
      parentNote: 'Lovely recitation today.',
      portions: [
        { kind: 'SABAQ', fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5, grade: 'GOOD' },
        { kind: 'MANZIL', fromSurah: 78, toSurah: 80, grade: 'EXCELLENT' },
      ],
    });
    ctx.lessonCardId = submitted.id;
    expect(submitted.portions).toHaveLength(2);

    await expect(lessonsApi.prefill(ctx.classId)).rejects.toMatchObject({ status: 409, details: { lessonCardId: submitted.id } });

    const card = await lessonsApi.get(submitted.id);
    expect(card).toMatchObject({ id: submitted.id, classId: ctx.classId, homework: 'Revise page 3 twice', locked: false });
    expect(card.portions.map((p) => p.kind)).toEqual(['SABAQ', 'MANZIL']);
    expect(card.mistakes.length).toBeGreaterThan(0);

    const updated = await lessonsApi.update(submitted.id, { homework: 'Revise page 3 three times' });
    expect(updated).toMatchObject({ homework: 'Revise page 3 three times', locked: false, loggedAsSupervisorEdit: false });

    const draft = await lessonsApi.saveAiDraft(submitted.id, 'Amina read well and is revising page 3.');
    expect(draft.aiSummaryDraft).toContain('Amina');
    const approved = await lessonsApi.approveAiDraft(submitted.id);
    expect(approved.approvedAt).toBeTruthy();

    const log = await lessonsApi.editLog(submitted.id);
    expect(Array.isArray(log)).toBe(true);
  });

  it('records presence when the teacher connects to the classroom socket, then closes attendance', async () => {
    setAccessToken(ctx.teacherToken);
    const room = await classroomApi.token(ctx.classId);
    const { io } = await import('socket.io-client');
    const { classroomSocketUrl } = await import('@/lib/api/modules/classroom');
    const socket = io(classroomSocketUrl(API_URL), { auth: { token: room.token }, transports: ['polling', 'websocket'] });
    try {
      const sync = await new Promise<{ classId: string; page: number | null }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No classroom:state within 8s')), 8000);
        socket.on('classroom:state', (payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
        socket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      expect(sync).toMatchObject({ classId: ctx.classId, page: 3 });

      const attendance = await classroomApi.attendance(ctx.classId);
      expect(attendance.participants.some((p) => p.role === 'TEACHER' && p.leftAt === null)).toBe(true);
    } finally {
      socket.disconnect();
    }

    const closed = await classroomApi.closeAttendance(ctx.classId);
    expect(typeof closed.closed).toBe('number');
  });
});
