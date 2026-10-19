import { describe, it, expect } from 'vitest';
import {
  casesApi,
  allowedTransitions,
  validateOpenCase,
  isCaseOverdue,
  formatMinutes,
  caseReference,
} from '@/lib/api/modules/cases';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const CASE = '01a13f96-1111-7000-8000-000000000001';
const USER = '01a13f96-2222-7000-8000-000000000002';

describe('cases API module', () => {
  it('lists cases with filters and only sends overdueOnly when true', async () => {
    const api = mockApi({ 'GET /cases': { body: envelope([]) } });
    await casesApi.list({ type: 'SAFEGUARDING', status: 'OPEN', overdueOnly: true });
    expect(api.calls[0].url).toContain('/cases?type=SAFEGUARDING&status=OPEN&overdueOnly=true');
    await casesApi.list({ overdueOnly: false });
    // z.coerce.boolean() turns "false" into true on the API, so false must be omitted.
    expect(api.calls[1].url).not.toContain('overdueOnly');
  });

  it('opens a case', async () => {
    const api = mockApi({ 'POST /cases': (call) => ({ status: 201, body: envelope({ id: CASE, status: 'OPEN', ...(call.body as object) }) }) });
    const created = await casesApi.open({ type: 'COMPLAINT', summary: 'Teacher joined 20 minutes late.', slaMinutes: 60 });
    expect(api.calls[0].body).toEqual({ type: 'COMPLAINT', summary: 'Teacher joined 20 minutes late.', slaMinutes: 60 });
    expect(created.status).toBe('OPEN');
  });

  it('reads one case, adds a note, transitions and assigns', async () => {
    const api = mockApi({
      [`GET /cases/${CASE}`]: { body: envelope({ id: CASE, notes: [], sla: { breached: false, minutesRemaining: 5 } }) },
      [`POST /cases/${CASE}/notes`]: { status: 201, body: envelope({ id: 'n1', note: 'Called parent' }) },
      [`POST /cases/${CASE}/transition`]: { body: envelope({ id: CASE, status: 'INVESTIGATING' }) },
      [`POST /cases/${CASE}/assign`]: { body: envelope({ id: CASE, ownerId: USER }) },
    });
    expect((await casesApi.get(CASE)).sla.minutesRemaining).toBe(5);
    await casesApi.addNote(CASE, 'Called parent');
    await casesApi.transition(CASE, 'INVESTIGATING');
    await casesApi.assign(CASE, USER);
    expect(api.calls[1].body).toEqual({ note: 'Called parent' });
    expect(api.calls[2].body).toEqual({ status: 'INVESTIGATING' });
    expect(api.calls[3].body).toEqual({ ownerId: USER });
  });

  it('reads the SLA report and surfaces closing-without-note errors', async () => {
    mockApi({
      'GET /cases/sla': { body: envelope({ open: 2, breached: 1, breachedDetail: [{ id: CASE, minutesOverdue: 30 }], openDetail: [] }) },
      [`POST /cases/${CASE}/transition`]: apiError(400, 'VALIDATION_FAILED', 'A case cannot be closed without at least one note'),
    });
    expect((await casesApi.sla()).breached).toBe(1);
    await expect(casesApi.transition(CASE, 'CLOSED')).rejects.toThrow('cannot be closed without at least one note');
  });
});

describe('case workflow helpers', () => {
  it('offers only forward states and gates closing on a note', () => {
    expect(allowedTransitions('OPEN', 0).map((o) => o.status)).toEqual(['INVESTIGATING', 'ACTIONED', 'CLOSED']);
    expect(allowedTransitions('OPEN', 0).find((o) => o.status === 'CLOSED')?.disabled).toBe(true);
    expect(allowedTransitions('INVESTIGATING', 2).map((o) => o.status)).toEqual(['ACTIONED', 'CLOSED']);
    expect(allowedTransitions('INVESTIGATING', 2).every((o) => !o.disabled)).toBe(true);
    expect(allowedTransitions('ACTIONED', 1).map((o) => o.status)).toEqual(['INVESTIGATING', 'CLOSED']);
    expect(allowedTransitions('CLOSED', 3)).toEqual([]);
  });

  it('validates the open-case form like the zod schema and service', () => {
    expect(validateOpenCase({ type: 'SAFEGUARDING', summary: 'A concern worth recording.' })).toEqual({});
    expect(validateOpenCase({ type: 'SAFEGUARDING', summary: 'short' }).summary).toBeTruthy();
    expect(validateOpenCase({ type: 'COMPLAINT', summary: 'A concern worth recording.', classId: 'x' }).classId).toBeTruthy();
    expect(validateOpenCase({ type: 'COMPLAINT', summary: 'A concern worth recording.', slaMinutes: 20000 }).slaMinutes).toBeTruthy();
    expect(validateOpenCase({ type: 'COMPLAINT', summary: 'A concern worth recording.', slaMinutes: 0 }).slaMinutes).toBeTruthy();
  });

  it('computes overdue, durations and references', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    expect(isCaseOverdue({ status: 'OPEN', dueAt: '2026-10-15T11:00:00Z' }, now)).toBe(true);
    expect(isCaseOverdue({ status: 'CLOSED', dueAt: '2026-10-15T11:00:00Z' }, now)).toBe(false);
    expect(formatMinutes(125)).toBe('2h 5m');
    expect(formatMinutes(-45)).toBe('45m');
    expect(formatMinutes(1500)).toBe('1d 1h');
    expect(caseReference(CASE)).toBe('01A13F96');
  });
});
