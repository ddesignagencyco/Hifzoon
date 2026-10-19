import { describe, it, expect } from 'vitest';
import { teacherScheduleApi, classStudentNames } from '@/lib/api/modules/teacher-schedule';
import {
  teacherEnrolmentsApi,
  formatPortionRange,
  groupEnrolmentsByStudent,
  TeacherEnrolment,
} from '@/lib/api/modules/enrolments-teacher';
import { payrollTeacherApi, formatMinorAmount, formatPeriod } from '@/lib/api/modules/payroll-teacher';
import { teacherApi, resolveTeacherProfileId, validateProfileChanges } from '@/lib/api/modules/teacher';
import { ApiClientError } from '@/lib/api/http';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const TEACHER = 'tp-1';

function enrolment(overrides: Partial<TeacherEnrolment> = {}): TeacherEnrolment {
  return {
    id: 'e1',
    status: 'ACTIVE',
    startedAt: '2026-10-01T00:00:00Z',
    pausedUntil: null,
    currentLessonPosition: 3,
    student: { id: 's1', displayName: 'Maryam', birthYear: 2017 },
    course: { id: 'c1', code: 'QAIDA', name: 'Noorani Qaida' },
    currentLevel: { id: 'l1', name: 'Beginner', position: 1 },
    teacher: { id: TEACHER, user: { name: 'Ustadh Bilal' } },
    ...overrides,
  };
}

describe('teacher scheduling API module', () => {
  it('reads the timetable for a profile id with from/to/tz', async () => {
    const api = mockApi({
      [`GET /scheduling/teachers/${TEACHER}/timetable`]: {
        body: envelope([
          {
            id: 'k1', type: 'REGULAR', status: 'SCHEDULED', startsAt: '2026-10-20T15:00:00.000Z', endsAt: '2026-10-20T15:30:00.000Z',
            roomId: null, course: { name: 'Hifz', code: 'HIFZ' }, students: [{ student: { id: 's2', displayName: 'Yusuf' } }],
            localStart: '2026-10-20T16:00:00.000+01:00', localEnd: '2026-10-20T16:30:00.000+01:00', viewerZone: 'Europe/London',
          },
        ]),
      },
    });
    const rows = await teacherScheduleApi.timetable(TEACHER, { from: '2026-10-19T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z', tz: 'Europe/London' });
    expect(api.calls[0].url).toContain(
      `/scheduling/teachers/${TEACHER}/timetable?from=2026-10-19T00%3A00%3A00.000Z&to=2026-10-26T00%3A00%3A00.000Z&tz=Europe%2FLondon`,
    );
    expect(classStudentNames(rows[0])).toBe('Yusuf');
  });

  it('reads availability', async () => {
    mockApi({
      [`GET /scheduling/teachers/${TEACHER}/availability`]: {
        body: envelope({ teacherId: TEACHER, timeZone: 'UTC', slots: [{ weekday: 1, startTime: '16:00', endTime: '20:00', timeZone: 'UTC', effectiveFrom: '2026-10-15T00:00:00.000Z', effectiveTo: null }] }),
      },
    });
    const data = await teacherScheduleApi.availability(TEACHER);
    expect(data.slots[0]).toMatchObject({ weekday: 1, startTime: '16:00' });
  });

  it('PUTs availability with exactly the DTO body', async () => {
    const api = mockApi({
      [`PUT /scheduling/teachers/${TEACHER}/availability`]: (call) => ({
        body: envelope({ teacherId: TEACHER, timeZone: 'UTC', slots: (call.body as { slots: unknown[] }).slots }),
      }),
    });
    await teacherScheduleApi.setAvailability(TEACHER, { slots: [{ weekday: 2, startTime: '09:00', endTime: '12:00' }], effectiveFrom: '2026-11-01' });
    expect(api.calls[0].method).toBe('PUT');
    expect(api.calls[0].body).toEqual({ slots: [{ weekday: 2, startTime: '09:00', endTime: '12:00' }], effectiveFrom: '2026-11-01' });
  });

  it('cancels a class as TEACHER and omits noticeHours unless given', async () => {
    const api = mockApi({
      'POST /scheduling/classes/k1/cancel': {
        body: envelope({ classId: 'k1', status: 'CANCELLED_TEACHER', charged: false, makeUpCredits: 1, noticeHours: 4 }),
      },
    });
    const result = await teacherScheduleApi.cancelClass('k1', { reason: 'Unwell' });
    // `by` and `noticeHours` were removed from CancelClassDto (backend S7); the API derives them.
    expect(api.calls[0].body).toEqual({ reason: 'Unwell' });
    expect(result.makeUpCredits).toBe(1);
  });

  it('reschedules and surfaces DOUBLE_BOOKED conflicts', async () => {
    const api = mockApi({
      'POST /scheduling/classes/k1/reschedule': { body: envelope({ id: 'k1', startsAt: '2026-10-21T15:00:00.000Z', endsAt: '2026-10-21T15:30:00.000Z' }) },
      'POST /scheduling/classes/k2/reschedule': apiError(409, 'DOUBLE_BOOKED', 'The new time collides with another booking (FR-SCH-07)'),
    });
    const moved = await teacherScheduleApi.reschedule('k1', { newStartsAt: '2026-10-21T15:00:00.000Z' });
    expect(api.calls[0].body).toEqual({ newStartsAt: '2026-10-21T15:00:00.000Z' });
    expect(moved.startsAt).toBe('2026-10-21T15:00:00.000Z');
    const error = await teacherScheduleApi.reschedule('k2', { newStartsAt: '2026-10-21T15:00:00.000Z' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).toBe('DOUBLE_BOOKED');
  });

  it('encodes ids in paths', async () => {
    const api = mockApi({ 'GET /scheduling/teachers/a%2Fb/availability': { body: envelope({ teacherId: 'a/b', timeZone: 'UTC', slots: [] }) } });
    await teacherScheduleApi.availability('a/b');
    expect(api.calls[0].url).toContain('/teachers/a%2Fb/availability');
  });
});

describe('teacher enrolments API module', () => {
  it('lists enrolments by teacher user id and optional student', async () => {
    const api = mockApi({ 'GET /courses/enrolments/list': { body: envelope([enrolment()]) } });
    await teacherEnrolmentsApi.list({ teacherUserId: 'u1' });
    await teacherEnrolmentsApi.list({ teacherUserId: 'u1', studentId: 's1' });
    expect(api.calls[0].url).toContain('/courses/enrolments/list?teacherUserId=u1');
    expect(api.calls[1].url).toContain('teacherUserId=u1&studentId=s1');
  });

  it('reads the next lesson', async () => {
    mockApi({
      'GET /courses/enrolments/e1/next-lesson': {
        body: envelope({ enrolmentId: 'e1', student: { id: 's1', displayName: 'Maryam' }, course: { id: 'c1', name: 'Qaida', code: 'QAIDA' }, level: null, lesson: null, suggestedAdvance: null }),
      },
    });
    const next = await teacherEnrolmentsApi.nextLesson('e1');
    expect(next.lesson).toBeNull();
  });

  it('patches the lesson position with { position }', async () => {
    const api = mockApi({ 'PATCH /courses/enrolments/e1/lesson-position': { body: envelope({ id: 'e1', currentLessonPosition: 4 }) } });
    const result = await teacherEnrolmentsApi.setLessonPosition('e1', 4);
    expect(api.calls[0].body).toEqual({ position: 4 });
    expect(result.currentLessonPosition).toBe(4);
  });

  it('reads lesson card history and a single card', async () => {
    mockApi({
      'GET /students/s1/lesson-cards': { body: envelope([{ id: 'lc1', submittedAt: null, sharedAt: null, lockedAt: null, homework: null, student: { displayName: 'Maryam' }, teacher: { name: 'B' }, portions: [] }]) },
      'GET /lesson-cards/lc1': { body: envelope({ id: 'lc1', locked: false, portions: [], mistakes: [] }) },
    });
    expect((await teacherEnrolmentsApi.lessonCards('s1'))[0].id).toBe('lc1');
    expect((await teacherEnrolmentsApi.lessonCard('lc1')).locked).toBe(false);
  });

  it('surfaces 403s from lesson-card reads', async () => {
    mockApi({ 'GET /students/s9/lesson-cards': apiError(403, 'FORBIDDEN', 'No access') });
    await expect(teacherEnrolmentsApi.lessonCards('s9')).rejects.toMatchObject({ status: 403 });
  });

  it('formats portion ranges and groups enrolments by student', () => {
    expect(formatPortionRange({ fromSurah: 2, fromAyah: 255, toSurah: 2, toAyah: 260 })).toBe('2:255 → 2:260');
    expect(formatPortionRange({ fromSurah: 1, fromAyah: null, toSurah: 1, toAyah: null })).toBe('1');
    expect(formatPortionRange({ fromSurah: null, fromAyah: null, toSurah: null, toAyah: null })).toBe('—');
    const grouped = groupEnrolmentsByStudent([
      enrolment(),
      enrolment({ id: 'e2', course: { id: 'c2', code: 'TAJWEED', name: 'Tajweed' } }),
      enrolment({ id: 'e3', student: { id: 's2', displayName: 'Yusuf', birthYear: 2011 } }),
    ]);
    expect(grouped.map((g) => [g.student.displayName, g.enrolments.length])).toEqual([['Maryam', 2], ['Yusuf', 1]]);
  });
});

describe('teacher payroll API module', () => {
  it('reads my payslips', async () => {
    const api = mockApi({
      'GET /payroll/my-payslips': {
        body: envelope([
          {
            id: 'p1', periodId: 'pp1', teacherId: TEACHER, grossMinor: 150000, deductionsMinor: 0, bonusesMinor: 0, netMinor: 150000,
            status: 'PAID', paidAt: '2026-10-05T10:00:00Z', payoutReference: 'BACS-1', createdAt: '', updatedAt: '',
            period: { startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-09-30T00:00:00.000Z', status: 'PAID' },
            lines: [{ kind: 'CLASS', amountMinor: 1500, note: 'REGULAR class', classId: 'k1' }],
          },
        ]),
      },
    });
    const slips = await payrollTeacherApi.myPayslips();
    expect(api.calls[0].url).toContain('/payroll/my-payslips');
    expect(slips[0].lines[0].kind).toBe('CLASS');
  });

  it('formats minor amounts without inventing a currency and periods in UTC', () => {
    expect(formatMinorAmount(150000)).toMatch(/1.?500[.,]00/);
    expect(formatMinorAmount(-1500)).toMatch(/-15[.,]00|−15[.,]00/);
    expect(formatMinorAmount(null)).toBe('—');
    const label = formatPeriod({ startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-09-30T00:00:00.000Z', status: 'PAID' });
    expect(label).toContain('2026');
    expect(label).toMatch(/1/);
    expect(label).toMatch(/30/);
  });
});

describe('teacher API module', () => {
  it('reads the pre-class brief', async () => {
    const api = mockApi({
      'GET /teachers/me/classes/k1/brief': {
        body: envelope({ classId: 'k1', startsAt: '2026-10-20T15:00:00Z', course: null, students: [], recurringMistakes: [], recentLessonCards: [] }),
      },
    });
    const brief = await teacherApi.brief('k1');
    expect(api.calls[0].url).toContain('/teachers/me/classes/k1/brief');
    expect(brief.classId).toBe('k1');
  });

  it('wraps profile edits in { changes }', async () => {
    const api = mockApi({ 'PATCH /teachers/me/profile': { body: envelope({ id: TEACHER, pendingProfileChanges: { bio: 'New' } }) } });
    const result = await teacherApi.requestProfileChange({ bio: 'New' });
    expect(api.calls[0].body).toEqual({ changes: { bio: 'New' } });
    expect(result.pendingProfileChanges).toEqual({ bio: 'New' });
  });

  it('reads the public profile and the rating summary', async () => {
    mockApi({
      'GET /teachers/public/u1': { body: envelope({ id: TEACHER, bio: null, photoUrl: null, introVideoUrl: null, gender: 'MALE', languages: ['en'], subjects: ['HIFZ'], ageGroups: [], publicRatingAvg: '4.8', user: { name: 'B', timeZone: 'UTC' } }) },
      [`GET /quality/teachers/${TEACHER}/rating`]: { body: envelope({ teacherId: TEACHER, average: null, count: 0, distribution: [] }) },
    });
    expect((await teacherApi.publicProfile('u1')).publicRatingAvg).toBe('4.8');
    expect((await teacherApi.rating(TEACHER)).count).toBe(0);
  });

  it('replies to a QA review with { teacherReply }', async () => {
    const api = mockApi({ 'POST /qa/reviews/r1/reply': { body: envelope({ id: 'r1', classId: 'k1', teacherReply: 'Thanks', feedback: null, scores: {}, reviewedAt: '' }) } });
    await teacherApi.replyToReview('r1', 'Thanks');
    expect(api.calls[0].body).toEqual({ teacherReply: 'Thanks' });
  });

  it('resolves the teacher profile id from enrolments', () => {
    expect(resolveTeacherProfileId([])).toBeNull();
    expect(resolveTeacherProfileId([enrolment({ teacher: null }), enrolment()])).toBe(TEACHER);
  });

  it('validates profile changes like the form expects', () => {
    expect(validateProfileChanges({ bio: '  ' }).bio).toMatch(/empty/);
    expect(validateProfileChanges({ bio: 'x'.repeat(2001) }).bio).toMatch(/2000/);
    expect(validateProfileChanges({ photoUrl: 'not a url' }).photoUrl).toBeTruthy();
    expect(validateProfileChanges({ introVideoUrl: 'ftp://x.test/a' }).introVideoUrl).toBeTruthy();
    expect(validateProfileChanges({ photoUrl: 'https://cdn.test/me.jpg', bio: 'Hello', recitationSampleUrl: '' })).toEqual({});
  });
});

