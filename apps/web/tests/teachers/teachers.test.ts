import { describe, it, expect } from 'vitest';
import { fetchTeachers } from '@/lib/api/client';
import { VERIFIED_FACULTY_PROFILES } from '@/lib/data/baseline-catalog';
import { mockApi, envelope } from '../helpers/fetch-mock';

const LIVE = {
  id: 'tch-live-1',
  bio: 'Specialist in Quran Tajweed and Hafs recitation.',
  photoUrl: null,
  gender: 'MALE',
  languages: ['en', 'ur'],
  subjects: ['TAJWEED', 'HIFZ'],
  ageGroups: ['6-9'],
  publicRatingAvg: '4.85',
  user: { name: 'Ustadh Bilal Rahman' },
};

describe('fetchTeachers', () => {
  it('falls back to the baseline profiles only when the API fails', async () => {
    mockApi({ 'GET /teachers/public': { status: 500, body: { message: 'boom' } } });
    const faculty = await fetchTeachers();
    expect(faculty).toHaveLength(VERIFIED_FACULTY_PROFILES.length);
    expect(faculty.every((t) => t.source === 'baseline')).toBe(true);
  });

  it('falls back when the API has no teachers', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([]) } });
    const faculty = await fetchTeachers();
    expect(faculty.every((t) => t.source === 'baseline')).toBe(true);
  });

  it('returns only real teachers with only real fields when the API has data', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([LIVE]) } });
    const faculty = await fetchTeachers();

    // No baseline teachers are merged in.
    expect(faculty).toHaveLength(1);
    const [t] = faculty;
    expect(t).toMatchObject({
      id: 'tch-live-1',
      name: 'Ustadh Bilal Rahman',
      gender: 'MALE',
      photoUrl: null,
      rating: 4.85,
      specializations: ['TAJWEED', 'HIFZ'],
      ageGroups: ['6-9'],
      source: 'api',
    });
    expect(t.languages).toEqual(['English', 'Urdu']);
    // Nothing fabricated.
    expect(t.audioSampleUrl).toBeUndefined();
    expect(t.videoUrl).toBeUndefined();
    expect(t.experienceYears).toBeUndefined();
    expect(t.reviewCount).toBeUndefined();
    expect(t.studentsTaught).toBeUndefined();
    expect(t.qualifications).toBeUndefined();
    expect(t.country).toBeUndefined();
  });

  it('keeps a null rating when the teacher has none', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([{ ...LIVE, publicRatingAvg: null, bio: null }]) } });
    const [t] = await fetchTeachers();
    expect(t.rating).toBeNull();
    expect(t.bio).toBeNull();
  });
});
