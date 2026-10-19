import { describe, it, expect } from 'vitest';
import { fetchTeachers } from '@/lib/api/client';
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
  it('throws when the API fails — never shows invented teachers', async () => {
    mockApi({ 'GET /teachers/public': { status: 500, body: { message: 'boom' } } });
    await expect(fetchTeachers()).rejects.toThrow('boom');
  });

  it('returns an empty directory when the API has no teachers', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([]) } });
    await expect(fetchTeachers()).resolves.toEqual([]);
  });

  it('keeps the account id so a card can link to the public profile', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([{ ...LIVE, userId: 'u-77' }]) } });
    const [t] = await fetchTeachers();
    expect(t.userId).toBe('u-77');
  });

  it('returns only real teachers with only real fields when the API has data', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([LIVE]) } });
    const faculty = await fetchTeachers();

    // Nothing is merged in.
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
