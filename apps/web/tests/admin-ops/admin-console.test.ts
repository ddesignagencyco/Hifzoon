import { describe, it, expect } from 'vitest';
import {
  adminConsoleApi,
  splitList,
  validateProvisionTeacher,
  validateSearchTerm,
} from '@/lib/api/modules/admin-console';
import { ApiClientError } from '@/lib/api/http';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const USER = '01a13f96-7bf4-7d11-a894-e2c24d985e19';
const TEACHER = '01a13f96-7bbb-7950-9fad-72b04b7541d3';

describe('admin console API module', () => {
  it('reads the overview counters', async () => {
    const api = mockApi({
      'GET /admin/console/overview': {
        body: envelope({ students: 4, families: 3, teachers: 2, activeClasses: 15, openCases: 0, overdueTasks: 1 }),
      },
    });
    const data = await adminConsoleApi.overview();
    expect(api.calls[0].method).toBe('GET');
    expect(data.activeClasses).toBe(15);
    expect(data.overdueTasks).toBe(1);
  });

  it('searches with q, entity and limit as query params', async () => {
    const api = mockApi({
      'GET /admin/console/search': {
        body: envelope({ entity: 'families', items: [{ id: 'f1', name: 'Khan Family', members: [], students: [] }], total: 1, tookAt: 'x' }),
      },
    });
    const res = await adminConsoleApi.search({ q: 'khan', entity: 'families', limit: 5 });
    expect(api.calls[0].url).toContain('/admin/console/search?q=khan&entity=families&limit=5');
    expect(res.entity).toBe('families');
    expect(res.items[0].name).toBe('Khan Family');
  });

  it('patches user status with only the status field', async () => {
    const api = mockApi({
      [`PATCH /admin/console/users/${USER}/status`]: (call) => ({
        body: envelope({ id: USER, email: 'parent@hifzoon.test', name: 'A', ...(call.body as object) }),
      }),
    });
    const res = await adminConsoleApi.setUserStatus(USER, 'LOCKED');
    expect(api.calls[0].method).toBe('PATCH');
    expect(api.calls[0].body).toEqual({ status: 'LOCKED' });
    expect(res.status).toBe('LOCKED');
  });

  it('replaces roles and returns the new role rows', async () => {
    const api = mockApi({
      [`PATCH /admin/console/users/${USER}/roles`]: {
        body: envelope({ id: USER, email: null, name: 'A', status: 'ACTIVE', roles: [{ role: 'GUARDIAN' }, { role: 'TEACHER' }] }),
      },
    });
    const res = await adminConsoleApi.setUserRoles(USER, ['GUARDIAN', 'TEACHER']);
    expect(api.calls[0].body).toEqual({ roles: ['GUARDIAN', 'TEACHER'] });
    expect(res.roles.map((r) => r.role)).toEqual(['GUARDIAN', 'TEACHER']);
  });

  it('reads teacher readiness and encodes the id', async () => {
    const api = mockApi({
      [`GET /admin/console/teachers/${TEACHER}/readiness`]: {
        body: envelope({ teacherId: TEACHER, readyToMatch: false, hiringStatus: 'SUBMITTED', safeguardingTrainingCompleted: false, outstandingSteps: ['ID_CHECK'], blockers: ['safeguarding training not recorded'] }),
      },
    });
    const res = await adminConsoleApi.teacherReadiness(TEACHER);
    expect(api.calls[0].url).toContain(`/admin/console/teachers/${TEACHER}/readiness`);
    expect(res.blockers).toHaveLength(1);
  });

  it('provisions a teacher and surfaces the 403 for non-super-admins', async () => {
    const api = mockApi({
      'POST /admin/console/teachers': { status: 201, body: envelope({ id: TEACHER, userId: USER, readyToMatch: false, applicationId: 'app1', languages: ['en'], subjects: ['HIFZ'], ageGroups: ['10-13'], hiringStatus: 'SUBMITTED' }) },
    });
    const body = { email: 't@x.test', name: 'T Name', password: 'a-long-password!', languages: ['en'], subjects: ['HIFZ'], ageGroups: ['10-13'] };
    const res = await adminConsoleApi.provisionTeacher(body);
    expect(api.calls[0].body).toEqual(body);
    expect(res.applicationId).toBe('app1');

    mockApi({ 'POST /admin/console/teachers': apiError(403, 'ROLE_REQUIRED', 'This action requires one of the following roles: SUPER_ADMIN') });
    const err = await adminConsoleApi.provisionTeacher(body).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).status).toBe(403);
  });

  it('validates search terms and provisioning input like the zod schemas', () => {
    expect(validateSearchTerm('a')).toMatch(/at least 2/);
    expect(validateSearchTerm('x'.repeat(121))).toMatch(/120/);
    expect(validateSearchTerm(' ab ')).toBeNull();
    expect(splitList('en, ur,en,, ar')).toEqual(['en', 'ur', 'ar']);
    const errors = validateProvisionTeacher({ email: 'bad', name: 'A', password: 'short', languages: ['english'], subjects: [], ageGroups: [] });
    expect(Object.keys(errors).sort()).toEqual(['ageGroups', 'email', 'languages', 'name', 'password', 'subjects']);
    expect(
      validateProvisionTeacher({ email: 'ok@x.test', name: 'Ok', password: '123456789012', languages: ['en'], subjects: ['HIFZ'], ageGroups: ['4-6'] }),
    ).toEqual({});
  });
});
