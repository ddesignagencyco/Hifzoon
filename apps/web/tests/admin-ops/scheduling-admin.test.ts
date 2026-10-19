import { describe, it, expect } from 'vitest';
import {
  RecurrenceSpec,
  buildRRule,
  describeRRule,
  isValidTimeZone,
  schedulingAdminApi,
  validateRecurrence,
  validateScheduleInput,
} from '@/lib/api/modules/scheduling-admin';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const STUDENT = '00000000-0000-7000-8000-000000000011';
const COURSE = '01a13f96-7076-7a90-b275-5151d68adb6e';
const TEACHER = '01a13f96-7bbb-7950-9fad-72b04b7541d3';
const SCHEDULE = '01a13fa3-0000-7000-8000-0000000000s1';

const weekly = (byDay: RecurrenceSpec['byDay'], extra: Partial<RecurrenceSpec> = {}): RecurrenceSpec => ({
  freq: 'WEEKLY',
  interval: 1,
  byDay,
  end: { kind: 'never' },
  ...extra,
});

describe('scheduling admin API module', () => {
  it('creates a schedule with the CreateScheduleDto body', async () => {
    const api = mockApi({
      'POST /scheduling/schedules': { status: 201, body: envelope({ scheduleId: SCHEDULE, rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', sessions: [{ id: 'c1', localStart: 'Tue 20 Oct, 16:00' }], skippedConflicts: 0 }) },
    });
    const body = {
      enrolmentId: 'e1',
      teacherId: TEACHER,
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
      localStartTime: '16:00',
      familyTimeZone: 'Europe/London',
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE' as const,
      startsOn: '2026-10-19',
    };
    const res = await schedulingAdminApi.createSchedule(body);
    expect(api.calls[0].body).toEqual(body);
    expect(res.sessions).toHaveLength(1);
  });

  it('reads a schedule, matching, open slots, timetable, availability, enrolments and courses', async () => {
    const api = mockApi({
      [`GET /scheduling/schedules/${SCHEDULE}`]: { body: envelope({ id: SCHEDULE, sessions: [] }) },
      [`GET /scheduling/matching/${STUDENT}`]: { body: envelope({ studentId: STUDENT, courseId: COURSE, suggestions: [{ teacherId: TEACHER, reasons: ['teaches in en'] }] }) },
      'GET /scheduling/open-slots': { body: envelope([{ teacherId: TEACHER, startsAt: '2026-10-20T16:00:00.000Z' }]) },
      [`GET /scheduling/teachers/${TEACHER}/timetable`]: { body: envelope([]) },
      [`GET /scheduling/teachers/${TEACHER}/availability`]: { body: envelope({ teacherId: TEACHER, timeZone: 'UTC', slots: [] }) },
      'GET /courses/enrolments/list': { body: envelope([]) },
      'GET /courses': { body: envelope([{ id: COURSE, code: 'QAIDA', name: 'Noorani Qaida', levels: [] }]) },
    });
    await schedulingAdminApi.getSchedule(SCHEDULE);
    const m = await schedulingAdminApi.matching(STUDENT, COURSE);
    await schedulingAdminApi.openSlots({ from: '2026-10-15T00:00:00.000Z', to: '2026-10-29T00:00:00.000Z', visitorZone: 'Europe/London', durationMinutes: 30 });
    await schedulingAdminApi.teacherTimetable(TEACHER, { from: 'a', to: 'b', tz: 'UTC' });
    await schedulingAdminApi.availability(TEACHER);
    await schedulingAdminApi.listEnrolments({ studentId: STUDENT });
    const courses = await schedulingAdminApi.listCourses();

    expect(m.suggestions[0].reasons).toEqual(['teaches in en']);
    expect(api.calls[1].url).toContain(`/scheduling/matching/${STUDENT}?courseId=${COURSE}`);
    expect(api.calls[2].url).toContain('visitorZone=Europe%2FLondon');
    expect(api.calls[2].url).toContain('durationMinutes=30');
    expect(api.calls[3].url).toContain('?from=a&to=b&tz=UTC');
    expect(api.calls[5].url).toContain(`/courses/enrolments/list?studentId=${STUDENT}`);
    expect(courses[0].code).toBe('QAIDA');
  });

  it('surfaces the uncleared-teacher refusal', async () => {
    mockApi({ 'POST /scheduling/schedules': apiError(403, 'FORBIDDEN', 'FR-TCH-02: teacher has not completed the hiring pipeline and safeguarding training') });
    const err = await schedulingAdminApi
      .createSchedule({ enrolmentId: 'e', teacherId: 't', rrule: 'FREQ=DAILY', localStartTime: '10:00', familyTimeZone: 'UTC', durationMinutes: 30, roomType: 'ONE_TO_ONE', startsOn: '2026-10-19' })
      .catch((e) => e);
    expect((err as { status: number }).status).toBe(403);
  });
});

describe('RRULE serialisation', () => {
  it('serialises weekday picks Monday-first and omits INTERVAL=1', () => {
    expect(buildRRule(weekly(['TH', 'TU']))).toBe('FREQ=WEEKLY;BYDAY=TU,TH');
    expect(buildRRule(weekly(['SU', 'MO']))).toBe('FREQ=WEEKLY;BYDAY=MO,SU');
  });

  it('adds INTERVAL, COUNT and an inclusive local UNTIL', () => {
    expect(buildRRule(weekly(['MO'], { interval: 2, end: { kind: 'count', count: 10 } }))).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=10');
    expect(buildRRule(weekly(['FR'], { end: { kind: 'until', date: '2026-12-31' } }))).toBe('FREQ=WEEKLY;BYDAY=FR;UNTIL=20261231T235959');
    expect(buildRRule({ freq: 'DAILY', interval: 3, byDay: ['MO'], end: { kind: 'never' } })).toBe('FREQ=DAILY;INTERVAL=3');
  });

  it('describes rules for humans', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=TU,TH')).toBe('Every week on Tue, Thu');
    expect(describeRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=10')).toBe('Every 2 weeks on Mon, 10 classes');
    expect(describeRRule('FREQ=MONTHLY')).toBe('FREQ=MONTHLY');
  });

  it('validates against the backend parser limits', () => {
    expect(validateRecurrence(weekly([]))).toMatch(/weekday/);
    expect(validateRecurrence(weekly(['MO'], { interval: 13 }))).toMatch(/1 to 12/);
    expect(validateRecurrence(weekly(['MO'], { end: { kind: 'until', date: '2026-01-01' } }), '2026-02-01')).toMatch(/after the start/);
    expect(validateRecurrence(weekly(['MO']))).toBeNull();
    const errors = validateScheduleInput(
      { enrolmentId: '', teacherId: '', localStartTime: '25:00', familyTimeZone: 'Mars/Base', durationMinutes: 500, roomType: 'ONE_TO_ONE', startsOn: '' },
      weekly([]),
    );
    expect(Object.keys(errors).sort()).toEqual(['durationMinutes', 'enrolmentId', 'familyTimeZone', 'localStartTime', 'recurrence', 'startsOn', 'teacherId']);
    expect(isValidTimeZone('Europe/London')).toBe(true);
  });
});
