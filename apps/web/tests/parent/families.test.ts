import { describe, it, expect } from 'vitest';
import {
  familiesApi,
  validateStudentInput,
  validateFamilyInput,
  validateGuardianInput,
  isUnder13,
  ageFromBirthYear,
} from '@/lib/api/modules/families';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const F = 'fam-1';
const NOW = new Date('2026-10-15T12:00:00Z');

describe('families API module', () => {
  it('lists the caller’s families', async () => {
    const api = mockApi({
      'GET /families': { body: envelope([{ id: F, name: 'Khan Family', country: 'GB', currency: 'GBP', createdAt: '', members: [{ isPrimary: true, verifiedAt: 'x', relationship: 'PARENT' }] }]) },
    });
    const rows = await familiesApi.list();
    expect(api.calls[0].method).toBe('GET');
    expect(rows[0].members[0].isPrimary).toBe(true);
  });

  it('creates a family with the DTO body', async () => {
    const api = mockApi({ 'POST /families': { status: 201, body: envelope({ id: F, name: 'Khan Family' }) } });
    const res = await familiesApi.create({ name: 'Khan Family', currency: 'GBP', timeZone: 'Europe/London' });
    expect(api.calls[0].body).toEqual({ name: 'Khan Family', currency: 'GBP', timeZone: 'Europe/London' });
    expect(res.id).toBe(F);
  });

  it('reads and updates a family', async () => {
    const api = mockApi({
      [`GET /families/${F}`]: { body: envelope({ id: F, members: [], students: [] }) },
      [`PATCH /families/${F}`]: (call) => ({ body: envelope({ id: F, ...(call.body as object) }) }),
    });
    const detail = await familiesApi.get(F);
    expect(detail.students).toEqual([]);
    const updated = await familiesApi.update(F, { name: 'New name' });
    expect(api.calls[1].method).toBe('PATCH');
    expect(api.calls[1].body).toEqual({ name: 'New name' });
    expect(updated.name).toBe('New name');
  });

  it('lists and adds guardians', async () => {
    const api = mockApi({
      [`GET /families/${F}/guardians`]: { body: envelope([{ id: 'm1', relationship: 'PARENT', isPrimary: true, verifiedAt: null, user: { id: 'u', name: 'A', email: 'a@x.test' } }]) },
      [`POST /families/${F}/guardians`]: { status: 201, body: envelope({ userId: 'u2', email: 'b@x.test', verified: false, needsPasswordSetup: true }) },
    });
    const list = await familiesApi.listGuardians(F);
    expect(list[0].user.email).toBe('a@x.test');
    const added = await familiesApi.addGuardian(F, { email: 'b@x.test', relationship: 'MOTHER' });
    expect(api.calls[1].body).toEqual({ email: 'b@x.test', relationship: 'MOTHER' });
    expect(added.needsPasswordSetup).toBe(true);
  });

  it('lists students, adds one (CR-01 hint) and patches one', async () => {
    const api = mockApi({
      [`GET /families/${F}/students`]: { body: envelope([{ id: 's1', displayName: 'Maryam', userId: null }]) },
      [`POST /families/${F}/students`]: { status: 201, body: envelope({ id: 's2', displayName: 'Zara', birthYear: 2019, requiresConsent: true, nextStep: 'GRANT_DATA_COLLECTION_CONSENT' }) },
      'PATCH /families/students/s2': { body: envelope({ id: 's2', kidsMode: true }) },
    });
    expect((await familiesApi.listStudents(F))[0].displayName).toBe('Maryam');
    const created = await familiesApi.addStudent(F, { displayName: 'Zara', birthYear: 2019, gender: 'FEMALE', kidsMode: true });
    expect(api.calls[1].body).toEqual({ displayName: 'Zara', birthYear: 2019, gender: 'FEMALE', kidsMode: true });
    expect(created.requiresConsent).toBe(true);
    expect(created.nextStep).toBe('GRANT_DATA_COLLECTION_CONSENT');
    const patched = await familiesApi.updateStudent('s2', { kidsMode: true });
    expect(api.calls[2].url).toContain('/families/students/s2');
    expect(patched.kidsMode).toBe(true);
  });

  it('throws the backend message on failure', async () => {
    mockApi({ [`POST /families/${F}/students`]: apiError(400, 'BAD_REQUEST', 'Birth year looks out of range for a learner') });
    await expect(familiesApi.addStudent(F, { displayName: 'X', birthYear: 1990, gender: 'MALE' })).rejects.toMatchObject({
      status: 400,
      message: 'Birth year looks out of range for a learner',
    });
  });

  it('surfaces 403 when the guardian is not in the family', async () => {
    mockApi({ [`GET /families/${F}`]: apiError(403, 'NOT_OWNER', 'Not yours') });
    await expect(familiesApi.get(F)).rejects.toMatchObject({ status: 403 });
  });
});

describe('family validation', () => {
  it('validates the add-child form like AddStudentDto + the 3–25 age rule', () => {
    expect(validateStudentInput({ displayName: '', birthYear: null, gender: '' }, { now: NOW })).toEqual({
      displayName: expect.any(String),
      birthYear: expect.any(String),
      gender: expect.any(String),
    });
    expect(validateStudentInput({ displayName: 'A', birthYear: 2027, gender: 'MALE' }, { now: NOW }).birthYear).toMatch(/future/);
    expect(validateStudentInput({ displayName: 'A', birthYear: 1989, gender: 'MALE' }, { now: NOW }).birthYear).toMatch(/1990/);
    expect(validateStudentInput({ displayName: 'A', birthYear: 2025, gender: 'MALE' }, { now: NOW }).birthYear).toMatch(/aged 3/);
    expect(validateStudentInput({ displayName: 'A'.repeat(121), birthYear: 2015, gender: 'MALE' }, { now: NOW }).displayName).toBeDefined();
    expect(validateStudentInput({ displayName: 'Ali', birthYear: 2015, gender: 'MALE', notes: 'x'.repeat(1001) }, { now: NOW }).notes).toBeDefined();
    expect(validateStudentInput({ displayName: 'Ali', birthYear: 2015, gender: 'MALE', language: 'en' }, { now: NOW })).toEqual({});
  });

  it('computes age and the under-13 flag from the birth year', () => {
    expect(ageFromBirthYear(2017, NOW)).toBe(9);
    expect(isUnder13(2017, NOW)).toBe(true);
    expect(isUnder13(2013, NOW)).toBe(false);
  });

  it('validates family and guardian inputs', () => {
    expect(validateFamilyInput({ name: 'A' }).name).toBeDefined();
    expect(validateFamilyInput({ name: 'Khan', country: 'GBR' }).country).toBeDefined();
    expect(validateFamilyInput({ name: 'Khan', country: 'GB', currency: 'GBP' })).toEqual({});
    expect(validateGuardianInput({ email: 'nope', relationship: 'PARENT' }).email).toBeDefined();
    expect(validateGuardianInput({ email: 'a@b.co', relationship: '' }).relationship).toBeDefined();
    expect(validateGuardianInput({ email: 'a@b.co', relationship: 'PARENT' })).toEqual({});
  });
});
