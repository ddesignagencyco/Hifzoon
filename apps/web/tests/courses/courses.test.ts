import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCourses } from '@/lib/api/client';
import { BASELINE_COURSES } from '@/lib/data/baseline-catalog';
import { CourseType } from '@/lib/types';

describe('Courses Module Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return baseline courses when backend is unavailable or returns an error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const courses = await fetchCourses();

    expect(courses).toBeDefined();
    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0].code).toBe(CourseType.QAIDA);
    expect(courses[0].title).toContain('Qaida');
  });

  it('should correctly format and enrich remote course records from backend API', async () => {
    const persistedCoursesEnvelope = {
      data: [
        {
          id: '01a13f17-5a93-75b1-999b-71dea3458ede',
          code: 'QAIDA',
          name: 'Noorani Qaida Live',
          type: 'QAIDA',
          description: 'Live foundational recitation from Postgres database.',
          levels: [
            {
              id: 'lvl-1',
              name: 'Single Letters',
              position: 1,
              lessonCount: 5,
            },
          ],
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => persistedCoursesEnvelope,
    } as Response);

    const courses = await fetchCourses();

    expect(courses).toHaveLength(1);
    expect(courses[0].id).toBe('01a13f17-5a93-75b1-999b-71dea3458ede');
    expect(courses[0].title).toBe('Noorani Qaida Live');
    expect(courses[0].levelCount).toBe(1);
    expect(courses[0].badge).toBe('Beginner Essential');
  });

  it('should have valid prerequisite criteria and duration for all baseline courses', () => {
    for (const course of BASELINE_COURSES) {
      expect(course.title).toBeTruthy();
      expect(course.durationMonths).toBeTruthy();
      expect(course.features.length).toBeGreaterThanOrEqual(3);
      expect(course.prerequisites).toBeTruthy();
    }
  });
});
