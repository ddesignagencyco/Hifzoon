import { describe, it, expect } from 'vitest';
import { enrolmentsApi, isLiveEnrolment, objectivesList } from '@/lib/api/modules/enrolments';
import {
  familySchedulingApi,
  isLateCancellation,
  canReschedule,
  canCancel,
  classDurationMinutes,
  slotsInWindow,
  groupSlotsByDay,
  validateCancelReason,
  OpenSlot,
} from '@/lib/api/modules/scheduling-family';
import { admissionsGuardianApi, validateTeacherChangeReason } from '@/lib/api/modules/admissions-guardian';
import { qualityRatingApi, validateRating } from '@/lib/api/modules/quality-rating';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

describe('enrolments API module', () => {
  it('lists enrolments filtered by student', async () => {
    const api = mockApi({ 'GET /courses/enrolments/list': { body: envelope([{ id: 'e1', status: 'ACTIVE', teacher: { id: 't1', user: { name: 'T' } } }]) } });
    const rows = await enrolmentsApi.list({ studentId: 's1' });
    expect(api.calls[0].url).toContain('/courses/enrolments/list?studentId=s1');
    expect(rows[0].teacher?.id).toBe('t1');
  });

  it('reads the next lesson', async () => {
    mockApi({ 'GET /courses/enrolments/e1/next-lesson': { body: envelope({ enrolmentId: 'e1', lesson: { title: 'Lesson 1' } }) } });
    expect((await enrolmentsApi.nextLesson('e1')).lesson?.title).toBe('Lesson 1');
  });

  it('patches status, omitting empty optional fields', async () => {
    const api = mockApi({ 'PATCH /courses/enrolments/e1/status': (call) => ({ body: envelope({ id: 'e1', ...(call.body as object), pausedUntil: null }) }) });
    await enrolmentsApi.updateStatus('e1', { status: 'CANCELLED', reason: '' });
    await enrolmentsApi.updateStatus('e1', { status: 'PAUSED', pausedUntil: '2026-12-01T00:00:00.000Z', reason: 'Holiday' });
    expect(api.calls[0].body).toEqual({ status: 'CANCELLED' });
    expect(api.calls[1].body).toEqual({ status: 'PAUSED', pausedUntil: '2026-12-01T00:00:00.000Z', reason: 'Holiday' });
  });

  it('creates an enrolment and maps the 409 conflict', async () => {
    const api = mockApi({ 'POST /courses/enrolments': { status: 201, body: envelope({ id: 'e2', status: 'TRIAL', course: { id: 'c', code: 'HIFZ', name: 'Hifz' } }) } });
    const res = await enrolmentsApi.create({ studentId: 's1', courseId: 'c' });
    expect(api.calls[0].body).toEqual({ studentId: 's1', courseId: 'c' });
    expect(res.status).toBe('TRIAL');
    api.spy.mockRestore();
    mockApi({ 'POST /courses/enrolments': apiError(409, 'CONFLICT', 'This student already has a live enrolment in that course') });
    await expect(enrolmentsApi.create({ studentId: 's1', courseId: 'c' })).rejects.toMatchObject({ status: 409 });
  });

  it('maps the public catalogue to the fields the portal uses', async () => {
    const api = mockApi({ 'GET /courses': { body: envelope([{ id: 'c1', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: 'd', levels: [{ id: 'l' }] }]) } });
    const rows = await enrolmentsApi.catalogue();
    expect(api.calls[0].url).toContain('/courses?locale=en');
    expect(rows).toEqual([{ id: 'c1', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: 'd' }]);
  });

  it('helpers', () => {
    expect(isLiveEnrolment('PAUSED')).toBe(true);
    expect(isLiveEnrolment('CANCELLED')).toBe(false);
    expect(objectivesList(['a', 2, 'b'])).toEqual(['a', 'b']);
    expect(objectivesList({})).toEqual([]);
  });
});

describe('family scheduling API module', () => {
  it('reads the family timetable with the viewer zone', async () => {
    const api = mockApi({ 'GET /scheduling/families/f1/timetable': { body: envelope([{ id: 'c1', status: 'SCHEDULED' }]) } });
    const rows = await familySchedulingApi.timetable('f1', { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', tz: 'Europe/London' });
    expect(api.calls[0].url).toContain('tz=Europe%2FLondon');
    expect(rows).toHaveLength(1);
  });

  it('always cancels as FAMILY and returns the charge outcome', async () => {
    const api = mockApi({ 'POST /scheduling/classes/c1/cancel': { body: envelope({ classId: 'c1', status: 'CANCELLED_FAMILY', charged: true, makeUpCredits: 0, noticeHours: 4 }) } });
    const res = await familySchedulingApi.cancel('c1', '  Ill  ');
    expect(api.calls[0].body).toEqual({ reason: 'Ill' }); // `by` is derived by the API (S7)
    expect(res.charged).toBe(true);
  });

  it('reschedules and maps DOUBLE_BOOKED', async () => {
    const api = mockApi({ 'POST /scheduling/classes/c1/reschedule': { body: envelope({ id: 'c1', startsAt: 'a', endsAt: 'b' }) } });
    await familySchedulingApi.reschedule('c1', '2026-10-20T16:00:00.000Z');
    expect(api.calls[0].body).toEqual({ newStartsAt: '2026-10-20T16:00:00.000Z' });
    api.spy.mockRestore();
    mockApi({ 'POST /scheduling/classes/c1/reschedule': apiError(409, 'DOUBLE_BOOKED', 'The new time collides with another booking') });
    await expect(familySchedulingApi.reschedule('c1', 'x')).rejects.toMatchObject({ code: 'DOUBLE_BOOKED' });
  });

  it('searches open slots', async () => {
    const api = mockApi({ 'GET /scheduling/open-slots': { body: envelope([{ teacherId: 't', startsAt: 'x' }]) } });
    await familySchedulingApi.openSlots({ from: 'a', to: 'b', visitorZone: 'UTC', durationMinutes: 30, limit: 10 });
    expect(api.calls[0].url).toContain('visitorZone=UTC');
    expect(api.calls[0].url).toContain('durationMinutes=30');
  });

  it('books a one-to-one class and surfaces CONSENT_REQUIRED', async () => {
    const api = mockApi({ 'POST /scheduling/book': { status: 201, body: envelope({ id: 'c9', startsAt: 'a', endsAt: 'b' }) } });
    await familySchedulingApi.book({ teacherId: 't', courseId: 'c', studentId: 's', enrolmentId: 'e', startsAt: 'z', durationMinutes: 30 });
    expect(api.calls[0].body).toEqual({ teacherId: 't', courseId: 'c', studentId: 's', enrolmentId: 'e', startsAt: 'z', durationMinutes: 30, roomType: 'ONE_TO_ONE', type: 'REGULAR' });
    api.spy.mockRestore();
    mockApi({ 'POST /scheduling/book': apiError(403, 'CONSENT_REQUIRED', 'Guardian consent required') });
    await expect(familySchedulingApi.book({ teacherId: 't', courseId: 'c', studentId: 's', startsAt: 'z', durationMinutes: 30 })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('policy helpers', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    expect(isLateCancellation('2026-10-15T15:00:00Z', now)).toBe(true);
    expect(isLateCancellation('2026-10-15T17:00:00Z', now)).toBe(false);
    expect(canReschedule({ status: 'SCHEDULED', startsAt: '2026-10-16T00:00:00Z' }, now)).toBe(true);
    expect(canReschedule({ status: 'COMPLETED', startsAt: '2026-10-16T00:00:00Z' }, now)).toBe(false);
    expect(canCancel({ status: 'CANCELLED_FAMILY', startsAt: '' })).toBe(false);
    expect(classDurationMinutes({ startsAt: '2026-10-15T12:00:00Z', endsAt: '2026-10-15T12:45:00Z' })).toBe(45);
    expect(validateCancelReason('')).toBeTruthy();
    expect(validateCancelReason('x'.repeat(501))).toBeTruthy();
    expect(validateCancelReason('Sick')).toBeNull();
  });

  it('filters slots to the window and groups them by day', () => {
    const slot = (startsAt: string): OpenSlot => ({ teacherId: 't', teacherName: 'T', startsAt, endsAt: startsAt, localTime: '', visitorZone: 'UTC', teacherZone: 'UTC' });
    const slots = [slot('2026-10-15T09:00:00Z'), slot('2026-10-16T09:00:00Z'), slot('2026-10-16T10:00:00Z')];
    const inWindow = slotsInWindow(slots, new Date('2026-10-16T00:00:00Z'), new Date('2026-10-17T00:00:00Z'));
    expect(inWindow).toHaveLength(2);
    const groups = groupSlotsByDay(inWindow, 'UTC');
    expect(groups).toHaveLength(1);
    expect(groups[0].slots).toHaveLength(2);
  });
});

describe('guardian admissions + quality modules', () => {
  it('requests a teacher change', async () => {
    const api = mockApi({ 'POST /teacher-changes': { status: 201, body: envelope({ id: 'r1', status: 'OPEN', enrolmentId: 'e1' }) } });
    const res = await admissionsGuardianApi.requestTeacherChange({ familyId: 'f', studentId: 's', reason: '  Schedule clash every week  ' });
    expect(api.calls[0].body).toEqual({ familyId: 'f', studentId: 's', reason: 'Schedule clash every week' });
    expect(res.status).toBe('OPEN');
  });

  it('maps an already-open request conflict', async () => {
    mockApi({ 'POST /teacher-changes': apiError(409, 'CONFLICT', 'A teacher change request is already open for this student') });
    await expect(admissionsGuardianApi.requestTeacherChange({ familyId: 'f', studentId: 's', reason: '0123456789' })).rejects.toThrow(/already open/);
  });

  it('rates a class and reads a teacher summary', async () => {
    const api = mockApi({
      'POST /quality/classes/c1/rating': { status: 201, body: envelope({ id: 'rv', stars: 5 }) },
      'GET /quality/teachers/t1/rating': { body: envelope({ teacherId: 't1', average: 4.5, count: 2, distribution: [] }) },
    });
    await qualityRatingApi.rateClass('c1', { stars: 5, comment: ' ', studentId: 's' });
    expect(api.calls[0].body).toEqual({ stars: 5, studentId: 's' });
    expect((await qualityRatingApi.teacherRating('t1')).average).toBe(4.5);
  });

  it('maps the 403 for guardians who did not attend', async () => {
    mockApi({ 'POST /quality/classes/c1/rating': apiError(403, 'FORBIDDEN', 'Only a guardian who attended this class can rate it') });
    await expect(qualityRatingApi.rateClass('c1', { stars: 3 })).rejects.toMatchObject({ status: 403 });
  });

  it('validators', () => {
    expect(validateTeacherChangeReason('short')).toBeTruthy();
    expect(validateTeacherChangeReason('long enough reason')).toBeNull();
    expect(validateRating({ stars: 0 }).stars).toBeDefined();
    expect(validateRating({ stars: 4, comment: 'x'.repeat(2001) }).comment).toBeDefined();
    expect(validateRating({ stars: 4 })).toEqual({});
  });
});

describe('guardian teacher-change history (backend M15)', () => {
  it("lists the family's own teacher-change requests", async () => {
    const api = mockApi({
      'GET /teacher-changes': {
        body: envelope([
          { id: 'r1', enrolmentId: 'e1', studentId: 's1', status: 'OPEN', studentName: 'Maryam', family: { id: 'f1', name: 'Khan' }, resolvedBy: null, createdAt: '2026-10-17T10:00:00.000Z' },
        ]),
      },
    });
    const rows = await admissionsGuardianApi.myTeacherChanges();
    expect(api.calls[0].method).toBe('GET');
    expect(rows[0].studentName).toBe('Maryam');
    expect(rows[0].status).toBe('OPEN');
  });
});
