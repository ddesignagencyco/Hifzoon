import { describe, it, expect } from 'vitest';
import {
  bookingApi,
  buildIcs,
  bookingPath,
  parseBookingSelection,
  groupSlotsByDay,
  validateChild,
  validateFamily,
  hasDataCollectionConsent,
  isValidTimeZone,
  searchWindow,
  dayKey,
  OpenSlot,
} from '@/lib/api/modules/public-booking';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const FAMILY = '01a13f96-aaaa-7000-8000-000000000001';
const STUDENT = '01a13f96-bbbb-7000-8000-000000000002';
const TEACHER = '01a13f96-7bbb-7950-9fad-72b04b7541d3';

const slot = (startsAt: string, teacherId = TEACHER): OpenSlot => ({
  teacherId,
  teacherName: 'Ustadh Bilal',
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
  localTime: '',
  visitorZone: 'UTC',
  teacherZone: 'UTC',
});

describe('public booking API module', () => {
  it('queries open slots with the visitor zone and filters', async () => {
    const api = mockApi({ 'GET /scheduling/open-slots': { body: envelope([slot('2026-10-16T16:00:00.000Z')]) } });
    const slots = await bookingApi.openSlots({ from: '2026-10-16', to: '2026-10-30', visitorZone: 'Asia/Karachi', durationMinutes: 30, gender: 'FEMALE', language: 'ur' });
    expect(api.calls[0].url).toContain('from=2026-10-16&to=2026-10-30&visitorZone=Asia%2FKarachi&durationMinutes=30&gender=FEMALE&language=ur');
    expect(slots).toHaveLength(1);
  });

  it('surfaces an invalid zone error verbatim', async () => {
    mockApi({ 'GET /scheduling/open-slots': apiError(400, 'VALIDATION_FAILED', '"Bad/Zone" is not a valid IANA time zone') });
    await expect(bookingApi.openSlots({ from: 'a', to: 'b', visitorZone: 'Bad/Zone' })).rejects.toThrow('not a valid IANA time zone');
  });

  it('lists and creates families, children and consent', async () => {
    const api = mockApi({
      'GET /families': { body: envelope([]) },
      'POST /families': (call) => ({ status: 201, body: envelope({ id: FAMILY, ...(call.body as object) }) }),
      [`GET /families/${FAMILY}/students`]: { body: envelope([]) },
      [`POST /families/${FAMILY}/students`]: { status: 201, body: envelope({ id: STUDENT, requiresConsent: true, nextStep: 'GRANT_DATA_COLLECTION_CONSENT' }) },
      [`GET /consent/students/${STUDENT}`]: { body: envelope({ studentId: STUDENT, purposes: [{ purpose: 'DATA_COLLECTION', status: 'WITHDRAWN' }] }) },
      [`POST /consent/students/${STUDENT}/grant`]: { status: 201, body: envelope([]) },
    });
    expect(await bookingApi.myFamilies()).toEqual([]);
    await bookingApi.createFamily({ name: 'Rahman family', country: 'GB', timeZone: 'Europe/London' });
    await bookingApi.students(FAMILY);
    const child = await bookingApi.addChild(FAMILY, { displayName: 'Maryam', birthYear: 2018, gender: 'FEMALE' });
    const consent = await bookingApi.consent(STUDENT);
    await bookingApi.grantDataCollection(STUDENT);

    expect(api.calls[1].body).toEqual({ name: 'Rahman family', country: 'GB', timeZone: 'Europe/London' });
    expect(child.requiresConsent).toBe(true);
    expect(hasDataCollectionConsent(consent)).toBe(false);
    expect(api.calls[5].body).toEqual({ purposes: ['DATA_COLLECTION'], method: 'OTHER', policyVersion: '1.0' });
  });

  it('books a TRIAL class and maps DOUBLE_BOOKED to a 409 error', async () => {
    const body = {
      teacherId: TEACHER,
      courseId: '01a13f96-725f-7ba3-babc-66dc3d2f2bff',
      studentId: STUDENT,
      startsAt: '2026-10-16T16:00:00.000Z',
      durationMinutes: 30,
      roomType: 'ONE_TO_ONE' as const,
      type: 'TRIAL' as const,
    };
    const api = mockApi({ 'POST /scheduling/book': { status: 201, body: envelope({ id: 'cls-1', startsAt: body.startsAt, endsAt: '2026-10-16T16:30:00.000Z' }) } });
    const booked = await bookingApi.book(body);
    expect(api.calls[0].body).toEqual(body);
    expect(booked.id).toBe('cls-1');

    mockApi({ 'POST /scheduling/book': apiError(409, 'DOUBLE_BOOKED', 'That slot is no longer free') });
    await expect(bookingApi.book(body)).rejects.toMatchObject({ status: 409, code: 'DOUBLE_BOOKED' });
  });

  it('lists teachers for a course subject', async () => {
    const api = mockApi({ 'GET /teachers/public': { body: envelope([{ id: TEACHER }]) } });
    await bookingApi.teachers({ subject: 'HIFZ' });
    expect(api.calls[0].url).toContain('subject=HIFZ');
  });
});

describe('booking helpers', () => {
  it('builds an RFC 5545 calendar file for the real class time', () => {
    const ics = buildIcs({
      classId: 'cls-1',
      startsAt: '2026-10-16T16:00:00.000Z',
      endsAt: '2026-10-16T16:30:00.000Z',
      summary: 'Trial, Hifz; evaluation',
      now: new Date('2026-10-15T10:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261016T160000Z\r\n');
    expect(ics).toContain('DTEND:20261016T163000Z\r\n');
    expect(ics).toContain('UID:cls-1@hifzoon');
    expect(ics).toContain('SUMMARY:Trial\\, Hifz\\; evaluation');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });

  it('round-trips the selection through a safe /book-trial redirect', () => {
    const path = bookingPath({ course: 'HIFZ', tz: 'Asia/Karachi', slotTeacher: TEACHER, slotStart: '2026-10-16T16:00:00.000Z' });
    expect(path.startsWith('/book-trial?')).toBe(true);
    const parsed = parseBookingSelection(new URLSearchParams(path.split('?')[1]));
    expect(parsed).toMatchObject({ course: 'HIFZ', tz: 'Asia/Karachi', slotTeacher: TEACHER, slotStart: '2026-10-16T16:00:00.000Z' });
    expect(parseBookingSelection(new URLSearchParams('tz=Not/AZone&gender=X&slotStart=nope'))).toEqual({});
  });

  it('groups slots by day in the visitor zone', () => {
    // 23:30 UTC on the 16th is already the 17th in Karachi (UTC+5).
    const days = groupSlotsByDay([slot('2026-10-16T23:30:00.000Z'), slot('2026-10-16T10:00:00.000Z')], 'Asia/Karachi');
    expect(days.map((d) => d.key)).toEqual(['2026-10-16', '2026-10-17']);
    expect(dayKey('2026-10-16T23:30:00.000Z', 'UTC')).toBe('2026-10-16');
  });

  it('validates family and child like the DTOs', () => {
    expect(validateFamily({ name: 'R' }).name).toBeTruthy();
    expect(validateFamily({ name: 'Rahman', country: 'Pakistan' }).country).toBeTruthy();
    expect(validateFamily({ name: 'Rahman', country: 'PK' })).toEqual({});
    expect(validateChild({ displayName: 'Maryam', birthYear: 2018, gender: 'FEMALE' }, 2026)).toEqual({});
    expect(validateChild({ displayName: '', birthYear: 2025, gender: 'MALE' }, 2026)).toMatchObject({ displayName: expect.any(String), birthYear: expect.any(String) });
    expect(validateChild({ displayName: 'A', birthYear: 1980, gender: 'MALE' }, 2026).birthYear).toBeTruthy();
  });

  it('validates zones and builds a bounded search window', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(searchWindow(14, new Date('2026-10-15T12:00:00Z'))).toEqual({ from: '2026-10-15', to: '2026-10-29' });
    expect(searchWindow(500, new Date('2026-10-15T12:00:00Z')).to).toBe('2026-12-16');
  });
});
