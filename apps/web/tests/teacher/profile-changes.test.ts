import { describe, it, expect } from 'vitest';
import {
  PROFILE_CHANGE_FIELDS,
  PROFILE_LIST_LIMITS,
  isHttpUrl,
  teacherApi,
  validateProfileChanges,
} from '@/lib/api/modules/teacher';
import { diffProfile, type ProfileFormValues } from '@/components/teacher/ProfileForm';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const BASE: ProfileFormValues = {
  bio: 'Hifz teacher',
  photoUrl: 'https://cdn.test/me.jpg',
  introVideoUrl: '',
  recitationSampleUrl: '',
  languages: ['en', 'ur'],
  subjects: ['HIFZ'],
  ageGroups: ['6-9', '10-13'],
};

describe('profile change contract (B2)', () => {
  it('offers exactly the backend PROFILE_CHANGE_SCHEMA keys the form edits (qualifications is API-only)', () => {
    expect([...PROFILE_CHANGE_FIELDS].sort()).toEqual(
      ['ageGroups', 'bio', 'introVideoUrl', 'languages', 'photoUrl', 'recitationSampleUrl', 'subjects'].sort(),
    );
    expect(PROFILE_LIST_LIMITS).toEqual({
      languages: { max: 10, maxLength: 16 },
      subjects: { max: 20, maxLength: 32 },
      ageGroups: { max: 10, maxLength: 32 },
    });
  });

  it('sends list fields inside { changes } and surfaces the API 400 naming unknown fields', async () => {
    const api = mockApi({
      'PATCH /teachers/me/profile': {
        body: envelope({ id: 'tp-1', pendingProfileChanges: { languages: ['en', 'ar'], subjects: ['HIFZ', 'TAJWEED'] } }),
      },
    });
    const result = await teacherApi.requestProfileChange({ languages: ['en', 'ar'], subjects: ['HIFZ', 'TAJWEED'] });
    expect(api.calls[0].method).toBe('PATCH');
    expect(api.calls[0].body).toEqual({ changes: { languages: ['en', 'ar'], subjects: ['HIFZ', 'TAJWEED'] } });
    expect(result.pendingProfileChanges).toEqual({ languages: ['en', 'ar'], subjects: ['HIFZ', 'TAJWEED'] });

    mockApi({
      'PATCH /teachers/me/profile': apiError(400, 'BAD_REQUEST', 'These profile fields cannot be changed here', {
        unknownFields: ['gender'],
      }),
    });
    await expect(teacherApi.requestProfileChange({ ageGroups: ['6-9'] })).rejects.toThrow(/cannot be changed here/);
  });
});

describe('diffProfile', () => {
  it('returns nothing for an unchanged form, including reordered lists', () => {
    expect(diffProfile(BASE, { ...BASE, languages: ['ur', 'en'], ageGroups: ['10-13', '6-9'] })).toEqual({});
  });

  it('sends only changed fields, lists whole, and a cleared link as null', () => {
    expect(
      diffProfile(BASE, {
        ...BASE,
        photoUrl: '  ',
        recitationSampleUrl: ' https://cdn.test/fatiha.mp3 ',
        subjects: ['HIFZ', 'TAJWEED'],
        ageGroups: [],
      }),
    ).toEqual({
      photoUrl: null,
      recitationSampleUrl: 'https://cdn.test/fatiha.mp3',
      subjects: ['HIFZ', 'TAJWEED'],
      ageGroups: [],
    });
  });
});

describe('validateProfileChanges', () => {
  it('keeps the text and link rules', () => {
    expect(validateProfileChanges({ bio: '  ' }).bio).toMatch(/empty/);
    expect(validateProfileChanges({ recitationSampleUrl: 'javascript:alert(1)' }).recitationSampleUrl).toMatch(/http/);
    expect(validateProfileChanges({ photoUrl: null, introVideoUrl: null })).toEqual({});
  });

  it('applies the backend stringArray limits to languages, subjects and age groups', () => {
    expect(validateProfileChanges({ languages: ['en', 'ur'], subjects: ['HIFZ'], ageGroups: [] })).toEqual({});
    expect(validateProfileChanges({ languages: Array.from({ length: 11 }, (_, i) => `l${i}`) }).languages).toMatch(/at most 10/);
    expect(validateProfileChanges({ subjects: Array.from({ length: 21 }, (_, i) => `S${i}`) }).subjects).toMatch(/at most 20/);
    expect(validateProfileChanges({ ageGroups: ['x'.repeat(33)] }).ageGroups).toMatch(/32 characters/);
    expect(validateProfileChanges({ languages: ['x'.repeat(17)] }).languages).toMatch(/16 characters/);
    expect(validateProfileChanges({ subjects: [''] }).subjects).toBeTruthy();
  });
});

describe('isHttpUrl', () => {
  it('accepts only absolute http(s) links', () => {
    expect(isHttpUrl('https://cdn.test/a.mp3')).toBe(true);
    expect(isHttpUrl('http://cdn.test/a.mp3')).toBe(true);
    expect(isHttpUrl('recitations/abc.webm')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});
