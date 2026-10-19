import { describe, it, expect } from 'vitest';
import {
  qaApi,
  validateReview,
  reviewableClasses,
  parseRating,
  isUuid,
  STANDARD_RUBRIC,
  TeacherTimetableEntry,
} from '@/lib/api/modules/qa';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const TEACHER = '01a13f96-7bbb-7950-9fad-72b04b7541d3';
const CLASS = '01a13f96-0000-7000-8000-000000000999';
const fullScores = Object.fromEntries(STANDARD_RUBRIC.items.map((i) => [i.key, 4]));

describe('qa API module', () => {
  it('lists bookable teachers from /teachers/public with filters', async () => {
    const api = mockApi({ 'GET /teachers/public': { body: envelope([{ id: TEACHER, user: { name: 'Bilal' } }]) } });
    const teachers = await qaApi.teachers({ subject: 'HIFZ' });
    expect(api.calls[0].url).toContain('/teachers/public?subject=HIFZ');
    expect(teachers[0].user.name).toBe('Bilal');
  });

  it('reads the public rating summary', async () => {
    const api = mockApi({
      [`GET /quality/teachers/${TEACHER}/rating`]: {
        body: envelope({ teacherId: TEACHER, average: 4.5, count: 2, distribution: [{ stars: 5, count: 1 }] }),
      },
    });
    const rating = await qaApi.teacherRating(TEACHER);
    expect(api.calls[0].method).toBe('GET');
    expect(rating.average).toBe(4.5);
  });

  it('requests the scorecard with the months window', async () => {
    const api = mockApi({
      [`GET /qa/teachers/${TEACHER}/scorecard`]: {
        body: envelope({ teacherId: TEACHER, windowMonths: 6, reviewsCount: 0, overallAverage: null, criteria: [], awaitingReply: 0, sampled: 0 }),
      },
    });
    const card = await qaApi.scorecard(TEACHER, 6);
    expect(api.calls[0].url).toContain('/scorecard?months=6');
    expect(card.overallAverage).toBeNull();
  });

  it('posts a rubric review and surfaces the duplicate-review conflict', async () => {
    const api = mockApi({
      [`POST /qa/classes/${CLASS}/review`]: (call) => ({ body: envelope({ id: 'r1', classId: CLASS, ...(call.body as object) }) }),
    });
    const review = await qaApi.submitReview(CLASS, { scores: fullScores, feedback: 'Good', source: 'MANUAL' });
    expect(api.calls[0].body).toEqual({ scores: fullScores, feedback: 'Good', source: 'MANUAL' });
    expect(review.id).toBe('r1');

    mockApi({ [`POST /qa/classes/${CLASS}/review`]: apiError(409, 'CONFLICT', 'You have already reviewed this class') });
    await expect(qaApi.submitReview(CLASS, { scores: fullScores })).rejects.toMatchObject({ status: 409 });
  });

  it('draws the monthly sample (SUPER_ADMIN) with a POST', async () => {
    const api = mockApi({
      [`POST /qa/teachers/${TEACHER}/sample`]: { body: envelope({ period: '2026-10', sampled: [], created: 0, alreadySampled: false }) },
    });
    const result = await qaApi.drawSample(TEACHER);
    expect(api.calls[0].method).toBe('POST');
    expect(result.period).toBe('2026-10');
  });

  it('reads the teacher timetable with from/to/tz', async () => {
    const api = mockApi({ [`GET /scheduling/teachers/${TEACHER}/timetable`]: { body: envelope([]) } });
    await qaApi.teacherTimetable(TEACHER, { from: '2026-10-01', to: '2026-10-15', tz: 'Europe/London' });
    expect(api.calls[0].url).toContain('from=2026-10-01&to=2026-10-15&tz=Europe%2FLondon');
  });

  it('surfaces 403 for roles without QA access', async () => {
    mockApi({ [`GET /qa/teachers/${TEACHER}/scorecard`]: apiError(403, 'ROLE_REQUIRED', 'This action requires one of the following roles: SUPERVISOR') });
    await expect(qaApi.scorecard(TEACHER)).rejects.toMatchObject({ status: 403 });
  });
});

describe('qa helpers', () => {
  it('requires every rubric criterion scored 0–5 and a UUID class id', () => {
    expect(validateReview(CLASS, { scores: fullScores })).toEqual({});
    const missing = validateReview(CLASS, { scores: { opening: 3 } });
    expect(Object.keys(missing)).toContain('score.portion');
    expect(validateReview(CLASS, { scores: { ...fullScores, tajweed: 6 } })['score.tajweed']).toBeTruthy();
    expect(validateReview('nope', { scores: fullScores }).classId).toBeTruthy();
    expect(validateReview(CLASS, { scores: fullScores, feedback: 'x'.repeat(4001) }).feedback).toBeTruthy();
  });

  it('offers only taught or past classes for review, newest first', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    const mk = (id: string, startsAt: string, status: string) =>
      ({ id, startsAt, status, endsAt: startsAt, type: 'REGULAR', roomId: null, course: null, students: [], localStart: null, localEnd: null, viewerZone: 'UTC' }) as TeacherTimetableEntry;
    const list = reviewableClasses(
      [mk('future', '2026-10-20T10:00:00Z', 'SCHEDULED'), mk('old', '2026-10-01T10:00:00Z', 'COMPLETED'), mk('recent', '2026-10-14T10:00:00Z', 'COMPLETED')],
      now,
    );
    expect(list.map((e) => e.id)).toEqual(['recent', 'old']);
  });

  it('parses Decimal-string ratings and UUIDs', () => {
    expect(parseRating('4.85')).toBe(4.9);
    expect(parseRating(null)).toBeNull();
    expect(isUuid(CLASS)).toBe(true);
    expect(isUuid('abc')).toBe(false);
  });
});
