import { describe, it, expect, afterAll } from 'vitest';
import { crmApi } from '@/lib/api/modules/crm';
import { teacherHiringApi } from '@/lib/api/modules/teacher-hiring';
import { admissionsAdminApi } from '@/lib/api/modules/admissions-admin';
import { schedulingAdminApi } from '@/lib/api/modules/scheduling-admin';
import { adminConsoleApi } from '@/lib/api/modules/admin-console';
import { ApiClientError } from '@/lib/api/http';
import { actAs, actAsAnonymous, SEED, uniq } from '../helpers/live';

/** Live admin-operations flows against the running, seeded API. */
describe('live API — admin operations', () => {
  afterAll(() => actAsAnonymous());

  it('admin: creates a lead, moves it, and works its follow-up tasks', async () => {
    await actAs('admin');
    const name = `Lead ${uniq('crm')}`;
    const lead = await crmApi.createLead({ contactName: name, source: 'integration', childAge: 8, courseInterest: 'HIFZ', country: 'GB' });
    expect(lead.status).toBe('NEW');
    expect(lead.contactName).toBe(name);

    const found = await crmApi.listLeads({ search: name, limit: 5 });
    expect(found.items.map((l) => l.id)).toContain(lead.id);
    // The first follow-up task is created with the lead.
    expect(found.items.find((l) => l.id === lead.id)?.tasks.length).toBeGreaterThanOrEqual(1);

    const moved = await crmApi.updateLeadStatus(lead.id, { status: 'TRIAL_BOOKED' });
    expect(moved.status).toBe('TRIAL_BOOKED');

    const task = await crmApi.createTask({ leadId: lead.id, type: 'OTHER', dueAt: new Date(Date.now() + 3600_000).toISOString(), note: 'Integration follow-up' });
    expect(task.status).toBe('OPEN');
    const open = await crmApi.listTasks({ status: 'OPEN', limit: 100 });
    expect(open.items.some((t) => t.id === task.id || t.lead?.id === lead.id)).toBe(true);

    const done = await crmApi.completeTask(task.id);
    expect(done.status).toBe('DONE');
    await expect(crmApi.completeTask(task.id)).rejects.toMatchObject({ status: 409 });

    const lost = await crmApi.updateLeadStatus(lead.id, { status: 'LOST', lostReason: 'Integration test cleanup' });
    expect(lost.status).toBe('LOST');
    const reopen = await crmApi.updateLeadStatus(lead.id, { status: 'NEW' }).catch((e) => e);
    expect(reopen).toBeInstanceOf(ApiClientError);
    expect((reopen as ApiClientError).status).toBe(409);

    const pipeline = await crmApi.pipeline();
    expect(pipeline.counts.map((c) => c.status)).toEqual(['NEW', 'TRIAL_BOOKED', 'TRIAL_DONE', 'WON', 'LOST']);
    expect(pipeline.total).toBeGreaterThanOrEqual(1);
  });

  it('admin: lists hiring applications and reads one with its steps', async () => {
    await actAs('admin');
    const apps = await teacherHiringApi.listApplications();
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThan(0);
    const detail = await teacherHiringApi.getApplication(apps[0].id);
    expect(detail.id).toBe(apps[0].id);
    expect(detail.steps.length).toBeGreaterThan(0);
    expect(detail.steps.every((s) => ['PENDING', 'PASSED', 'FAILED'].includes(s.status))).toBe(true);

    const filtered = await teacherHiringApi.listApplications(apps[0].status);
    expect(filtered.every((a) => a.status === apps[0].status)).toBe(true);
  });

  it('admin: lists teacher change requests', async () => {
    await actAs('admin');
    const all = await admissionsAdminApi.listTeacherChanges();
    expect(Array.isArray(all)).toBe(true);
    const open = await admissionsAdminApi.listTeacherChanges('OPEN');
    expect(open.every((r) => r.status === 'OPEN')).toBe(true);
  });

  it('admin: gets explained matching suggestions for a seeded student', async () => {
    await actAs('admin');
    const courses = await schedulingAdminApi.listCourses();
    const qaida = courses.find((c) => c.code === 'QAIDA');
    expect(qaida).toBeTruthy();
    const result = await schedulingAdminApi.matching(SEED.students.maryam, qaida!.id);
    expect(result.studentId).toBe(SEED.students.maryam);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.every((s) => s.reasons.length > 0)).toBe(true);

    const enrolments = await schedulingAdminApi.listEnrolments({ studentId: SEED.students.maryam });
    expect(enrolments.some((e) => e.id === SEED.enrolments.maryamQaida)).toBe(true);
  });

  it('admin: is refused by the super-admin console', async () => {
    await actAs('admin');
    await expect(adminConsoleApi.overview()).rejects.toMatchObject({ status: 403 });
  });

  it('super admin: reads the overview and searches across entities', async () => {
    await actAs('superAdmin');
    const overview = await adminConsoleApi.overview();
    for (const key of ['students', 'families', 'teachers', 'activeClasses', 'openCases', 'overdueTasks'] as const) {
      expect(typeof overview[key]).toBe('number');
    }
    expect(overview.students).toBeGreaterThanOrEqual(2);

    const families = await adminConsoleApi.search({ q: 'khan', entity: 'families', limit: 5 });
    expect(families.entity).toBe('families');
    expect(families.items.some((f) => f.id === SEED.familyId)).toBe(true);

    const students = await adminConsoleApi.search({ q: 'Maryam', entity: 'students', limit: 5 });
    expect(students.items.some((s) => s.id === SEED.students.maryam)).toBe(true);
  });
});
