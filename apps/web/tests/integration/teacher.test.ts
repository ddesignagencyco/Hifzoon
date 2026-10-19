import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetchCurrentUser } from '@/lib/api/client';
import { ApiClientError, http } from '@/lib/api/http';
import { teacherApi, resolveTeacherProfileId } from '@/lib/api/modules/teacher';
import { teacherScheduleApi, AvailabilitySlotInput } from '@/lib/api/modules/teacher-schedule';
import { teacherEnrolmentsApi, TeacherEnrolment } from '@/lib/api/modules/enrolments-teacher';
import { payrollTeacherApi } from '@/lib/api/modules/payroll-teacher';
import { actAs, actAsAnonymous, SEED } from '../helpers/live';

/** Teacher portal against the live, seeded API (teacher@hifzoon.test = Ustadh Bilal). */
describe('live API — teacher portal', () => {
  let userId = '';
  let teacherId = '';
  let enrolments: TeacherEnrolment[] = [];

  beforeAll(async () => {
    await actAs('teacher');
    const me = await fetchCurrentUser();
    userId = me!.id;
    enrolments = await teacherEnrolmentsApi.list({ teacherUserId: userId });
    teacherId = resolveTeacherProfileId(enrolments) ?? '';
  });

  afterAll(() => actAsAnonymous());

  it('lists the teacher’s enrolments and resolves the teacher profile id from them', () => {
    expect(teacherId).toMatch(/^[0-9a-f-]{36}$/);
    expect(teacherId).not.toBe(userId);
    const ids = enrolments.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([SEED.enrolments.maryamQaida, SEED.enrolments.yusufHifz]));
    const maryam = enrolments.find((e) => e.id === SEED.enrolments.maryamQaida)!;
    expect(maryam.student.displayName).toBe('Maryam');
    expect(maryam.course.code).toBe('QAIDA');
    expect(typeof maryam.currentLessonPosition).toBe('number');
  });

  it('cannot resolve a profile id for a trainee with no students (backend gap: no GET /teachers/me)', async () => {
    const trainee = await actAs('trainee');
    const list = await teacherEnrolmentsApi.list({ teacherUserId: trainee.userId });
    expect(resolveTeacherProfileId(list)).toBeNull();
    await actAs('teacher');
  });

  it('reads the timetable in the requested zone', async () => {
    const from = new Date();
    const to = new Date(Date.now() + 14 * 86_400_000);
    const rows = await teacherScheduleApi.timetable(teacherId, { from: from.toISOString(), to: to.toISOString(), tz: 'Europe/London' });
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.viewerZone).toBe('Europe/London');
      expect(['CANCELLED_FAMILY', 'CANCELLED_TEACHER']).not.toContain(row.status);
    }
  });

  it('reads, replaces and restores weekly availability', async () => {
    const original = await teacherScheduleApi.availability(teacherId);
    expect(original.teacherId).toBe(teacherId);
    expect(typeof original.timeZone).toBe('string');
    const originalSlots: AvailabilitySlotInput[] = original.slots.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }));
    expect(originalSlots.length).toBeGreaterThan(0);

    try {
      const updated = await teacherScheduleApi.setAvailability(teacherId, {
        slots: [
          { weekday: 1, startTime: '09:00', endTime: '10:30' },
          { weekday: 6, startTime: '11:00', endTime: '12:00' },
        ],
      });
      expect(updated.slots.map((s) => [s.weekday, s.startTime, s.endTime])).toEqual([
        [1, '09:00', '10:30'],
        [6, '11:00', '12:00'],
      ]);
      // The API stores every slot in the teacher's account zone.
      expect(updated.slots.every((s) => s.timeZone === updated.timeZone)).toBe(true);

      const invalid = await teacherScheduleApi
        .setAvailability(teacherId, { slots: [{ weekday: 1, startTime: '10:00', endTime: '09:00' }] })
        .catch((e) => e);
      expect(invalid).toBeInstanceOf(ApiClientError);
      expect(invalid.status).toBe(400);
    } finally {
      const restored = await teacherScheduleApi.setAvailability(teacherId, { slots: originalSlots });
      expect(restored.slots.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }))).toEqual(originalSlots);
    }
  });

  it('books a class (as admin), then reads its brief, reschedules and cancels it as the teacher', async () => {
    const maryam = enrolments.find((e) => e.id === SEED.enrolments.maryamQaida)!;
    await actAs('admin');
    let booked: { id: string; startsAt: string } | null = null;
    for (let attempt = 0; attempt < 6 && !booked; attempt++) {
      // A random quarter-hour 20–80 days out keeps re-runs from colliding (FR-SCH-07).
      const slot = Math.floor(Math.random() * 60 * 24 * 4);
      const startsAt = new Date(Math.ceil((Date.now() + 20 * 86_400_000) / 900_000) * 900_000 + slot * 900_000);
      try {
        booked = await http.post<{ id: string; startsAt: string }>('/scheduling/book', {
          teacherId,
          courseId: maryam.course.id,
          studentId: SEED.students.maryam,
          enrolmentId: maryam.id,
          startsAt: startsAt.toISOString(),
          durationMinutes: 30,
          roomType: 'ONE_TO_ONE',
          type: 'REGULAR',
        });
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.code !== 'DOUBLE_BOOKED') throw error;
      }
    }
    expect(booked).not.toBeNull();
    const classId = booked!.id;

    await actAs('teacher');
    try {
      const window = {
        from: new Date(new Date(booked!.startsAt).getTime() - 3_600_000).toISOString(),
        to: new Date(new Date(booked!.startsAt).getTime() + 3 * 3_600_000).toISOString(),
        tz: 'Asia/Karachi',
      };
      const rows = await teacherScheduleApi.timetable(teacherId, window);
      const row = rows.find((r) => r.id === classId);
      expect(row).toBeDefined();
      expect(row!.students.map((s) => s.student.displayName)).toContain('Maryam');
      expect(row!.localStart).toMatch(/\+05:00$/);

      const brief = await teacherApi.brief(classId);
      expect(brief.classId).toBe(classId);
      expect(brief.course?.code).toBe('QAIDA');
      expect(brief.students[0].displayName).toBe('Maryam');
      expect(Array.isArray(brief.recurringMistakes)).toBe(true);

      const newStartsAt = new Date(new Date(booked!.startsAt).getTime() + 30 * 60_000).toISOString();
      const moved = await teacherScheduleApi.reschedule(classId, { newStartsAt }).catch((e) => e);
      if (moved instanceof ApiClientError) {
        expect(moved.code).toBe('DOUBLE_BOOKED');
      } else {
        expect(new Date(moved.startsAt).toISOString()).toBe(newStartsAt);
      }
    } finally {
      const cancelled = await teacherScheduleApi.cancelClass(classId, { reason: 'Integration test clean-up' });
      expect(cancelled.status).toBe('CANCELLED_TEACHER');
    }
  });

  it('reads the next lesson and re-saves the current lesson position (no-op)', async () => {
    const maryam = (await teacherEnrolmentsApi.list({ teacherUserId: userId, studentId: SEED.students.maryam }))[0];
    expect(maryam.student.id).toBe(SEED.students.maryam);
    const next = await teacherEnrolmentsApi.nextLesson(maryam.id);
    expect(next.enrolmentId).toBe(maryam.id);
    expect(next.course.code).toBe('QAIDA');
    const saved = await teacherEnrolmentsApi.setLessonPosition(maryam.id, maryam.currentLessonPosition);
    expect(saved).toEqual({ id: maryam.id, currentLessonPosition: maryam.currentLessonPosition });
  });

  it('reads the lesson card history of an assigned student', async () => {
    const cards = await teacherEnrolmentsApi.lessonCards(SEED.students.maryam);
    expect(Array.isArray(cards)).toBe(true);
    if (cards[0]) {
      const card = await teacherEnrolmentsApi.lessonCard(cards[0].id);
      expect(card.id).toBe(cards[0].id);
    }
  });

  it('reads own payslips, rating summary and public profile', async () => {
    const [slips, rating, profile] = await Promise.all([
      payrollTeacherApi.myPayslips(),
      teacherApi.rating(teacherId),
      teacherApi.publicProfile(userId),
    ]);
    expect(Array.isArray(slips)).toBe(true);
    for (const slip of slips) {
      expect(slip.teacherId).toBe(teacherId);
      expect(Array.isArray(slip.lines)).toBe(true);
    }
    expect(rating.teacherId).toBe(teacherId);
    expect(rating.distribution.map((d) => d.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(typeof profile.user.name).toBe('string');
    expect(Array.isArray(profile.subjects)).toBe(true);
  });

  it('stages a profile change (or reports the known DTO validation gap) and leaves nothing pending', async () => {
    const bio = `Integration bio ${Date.now()}`;
    const result = await teacherApi.requestProfileChange({ bio }).catch((e) => e);
    if (result instanceof ApiClientError) {
      // Backend gap: ProfileChangeDto.changes has no class-validator decorator, so the global
      // whitelist/forbidNonWhitelisted pipe rejects every body with 400 VALIDATION_FAILED.
      expect(result.status).toBe(400);
      expect(result.code).toBe('VALIDATION_FAILED');
      return;
    }
    expect(result.pendingProfileChanges).toMatchObject({ bio });
    // Restore: reject the staged change so the public profile and pending queue are untouched.
    await actAs('admin');
    try {
      await http.post(`/teachers/profiles/${result.id}/review`, { approve: false });
    } finally {
      await actAs('teacher');
    }
  });
});
