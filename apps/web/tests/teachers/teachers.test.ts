import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTeachers } from '@/lib/api/client';
import { VERIFIED_FACULTY_PROFILES } from '@/lib/data/baseline-catalog';

describe('Teachers / Faculty Module Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return verified faculty profiles when backend returns empty or fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const faculty = await fetchTeachers();

    expect(faculty).toBeDefined();
    expect(faculty.length).toBeGreaterThanOrEqual(4);
    expect(faculty.some((t) => t.gender === 'FEMALE')).toBe(true);
    expect(faculty.some((t) => t.gender === 'MALE')).toBe(true);
  });

  it('should parse live teacher data and merge with female faculty if database is unseeded', async () => {
    const persistedFacultyEnvelope = {
      data: [
        {
          id: 'tch-live-1',
          bio: 'Specialist in Quran Tajweed and Hafs recitation.',
          photoUrl: null,
          gender: 'MALE',
          languages: ['en', 'ur'],
          subjects: ['TAJWEED', 'HIFZ'],
          publicRatingAvg: '4.85',
          user: {
            name: 'Ustadh Bilal Rahman',
          },
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => persistedFacultyEnvelope,
    } as Response);

    const faculty = await fetchTeachers();

    expect(faculty.length).toBeGreaterThan(1);
    expect(faculty[0].name).toBe('Ustadh Bilal Rahman');
    expect(faculty[0].rating).toBe(4.85);
    expect(faculty.some((t) => t.gender === 'FEMALE')).toBe(true);
  });

  it('should ensure all verified faculty have audio recitation samples and credentials', () => {
    for (const teacher of VERIFIED_FACULTY_PROFILES) {
      expect(teacher.name).toBeTruthy();
      expect(teacher.audioSampleUrl).toContain('.mp3');
      expect(teacher.rating).toBeGreaterThanOrEqual(4.5);
      expect(teacher.qualifications.length).toBeGreaterThan(0);
    }
  });
});
