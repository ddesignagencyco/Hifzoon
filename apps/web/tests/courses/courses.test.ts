import { describe, it, expect } from 'vitest';
import { fetchCourses } from '@/lib/api/client';
import { BASELINE_COURSES } from '@/lib/data/baseline-catalog';
import { CourseType } from '@/lib/types';
import { mockApi, envelope } from '../helpers/fetch-mock';

describe('fetchCourses', () => {
  it('returns the baseline catalogue when the API is unreachable', async () => {
    mockApi({ 'GET /courses': { status: 500, body: {} } });
    const courses = await fetchCourses();
    expect(courses).toHaveLength(BASELINE_COURSES.length);
    expect(courses[0].code).toBe(CourseType.QAIDA);
    expect(courses.every((c) => c.source === 'baseline')).toBe(true);
  });

  it('uses real levels and merges curated copy only for a matching code', async () => {
    mockApi({
      'GET /courses': {
        body: envelope([
          {
            id: '01a13f17-5a93-75b1-999b-71dea3458ede',
            code: 'QAIDA',
            name: 'Noorani Qaida Live',
            type: 'QAIDA',
            description: 'Live foundational recitation. Second sentence.',
            levels: [{ id: 'lvl-1', name: 'Single Letters', position: 1, lessonCount: 5, lessons: [] }],
          },
        ]),
      },
    });
    const [course] = await fetchCourses();
    expect(course).toMatchObject({
      id: '01a13f17-5a93-75b1-999b-71dea3458ede',
      title: 'Noorani Qaida Live',
      levelCount: 1,
      levels: [{ id: 'lvl-1', name: 'Single Letters', position: 1, lessonCount: 5 }],
      badge: 'Beginner Essential',
      source: 'api',
    });
  });

  it('invents nothing for a course without curated copy', async () => {
    mockApi({
      'GET /courses': {
        body: envelope([
          { id: 'c-2', code: 'PROBE1', name: 'Probe course', type: 'HIFZ', description: 'Real description. More.', levels: [] },
        ]),
      },
    });
    const [course] = await fetchCourses();
    expect(course.levelCount).toBe(0);
    expect(course.features).toEqual([]);
    expect(course.durationMonths).toBeUndefined();
    expect(course.targetAudience).toBeUndefined();
    expect(course.prerequisites).toBeUndefined();
    expect(course.badge).toBeUndefined();
    expect(course.category).toBe('Memorization');
    expect(course.tagline).toBe('Real description.');
  });

  it('keeps curated baseline copy complete for the offline fallback', () => {
    for (const course of BASELINE_COURSES) {
      expect(course.title).toBeTruthy();
      expect(course.features.length).toBeGreaterThanOrEqual(3);
    }
  });
});
