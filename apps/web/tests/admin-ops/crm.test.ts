import { describe, it, expect } from 'vitest';
import {
  EMPTY_LEAD_FORM,
  crmApi,
  formatRate,
  nextLeadStatuses,
  toCreateLeadInput,
  validateLeadForm,
} from '@/lib/api/modules/crm';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const LEAD = '01a13fa3-0000-7000-8000-000000000001';
const TASK = '01a13fa3-0000-7000-8000-000000000002';

describe('CRM API module', () => {
  it('lists leads with filters and keeps the {items,total,page,limit} payload', async () => {
    const api = mockApi({
      'GET /admin/crm/leads': { body: envelope({ items: [{ id: LEAD, contactName: 'Amina', status: 'NEW', tasks: [], owner: null }], total: 1, page: 2, limit: 10 }) },
    });
    const res = await crmApi.listLeads({ page: 2, limit: 10, status: 'NEW', search: 'ami' });
    expect(api.calls[0].url).toContain('/admin/crm/leads?page=2&limit=10&status=NEW&search=ami');
    expect(res.total).toBe(1);
    expect(res.items[0].contactName).toBe('Amina');
  });

  it('creates a lead with the given body', async () => {
    const api = mockApi({ 'POST /admin/crm/leads': (call) => ({ status: 201, body: envelope({ id: LEAD, status: 'NEW', ...(call.body as object) }) }) });
    const lead = await crmApi.createLead({ contactName: 'Amina', childAge: 7 });
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].body).toEqual({ contactName: 'Amina', childAge: 7 });
    expect(lead.status).toBe('NEW');
  });

  it('moves a lead and surfaces the closed-lead conflict verbatim', async () => {
    const api = mockApi({ [`PATCH /admin/crm/leads/${LEAD}/status`]: { body: envelope({ id: LEAD, status: 'LOST', lostReason: 'Price' }) } });
    const res = await crmApi.updateLeadStatus(LEAD, { status: 'LOST', lostReason: 'Price' });
    expect(api.calls[0].body).toEqual({ status: 'LOST', lostReason: 'Price' });
    expect(res.lostReason).toBe('Price');

    mockApi({ [`PATCH /admin/crm/leads/${LEAD}/status`]: apiError(409, 'CONFLICT', 'Lead is already closed as LOST; closed leads are immutable') });
    await expect(crmApi.updateLeadStatus(LEAD, { status: 'NEW' })).rejects.toThrow('closed leads are immutable');
  });

  it('reads the pipeline summary', async () => {
    mockApi({
      'GET /admin/crm/pipeline': {
        body: envelope({ counts: [{ status: 'NEW', count: 3 }], total: 3, won: 0, trialToWonRate: null, bookingToDoneRate: 0.5, openTasks: 2, overdueTasks: 1 }),
      },
    });
    const p = await crmApi.pipeline();
    expect(p.counts[0]).toEqual({ status: 'NEW', count: 3 });
    expect(formatRate(p.bookingToDoneRate)).toBe('50%');
    expect(formatRate(p.trialToWonRate)).toBe('—');
  });

  it('lists tasks and only sends overdueOnly when true', async () => {
    const api = mockApi({ 'GET /admin/crm/tasks': { body: envelope({ items: [], total: 0, page: 1, limit: 25 }) } });
    await crmApi.listTasks({ status: 'OPEN', overdueOnly: false });
    await crmApi.listTasks({ overdueOnly: true });
    expect(api.calls[0].url).toContain('/admin/crm/tasks?status=OPEN');
    expect(api.calls[0].url).not.toContain('overdueOnly');
    expect(api.calls[1].url).toContain('overdueOnly=true');
  });

  it('creates and completes tasks', async () => {
    const api = mockApi({
      'POST /admin/crm/tasks': { status: 201, body: envelope({ id: TASK, status: 'OPEN', type: 'OTHER' }) },
      [`POST /admin/crm/tasks/${TASK}/complete`]: { body: envelope({ id: TASK, status: 'DONE', completedAt: '2026-10-15T10:00:00Z' }) },
    });
    await crmApi.createTask({ leadId: LEAD, type: 'OTHER', dueAt: '2026-10-16T10:00:00.000Z', note: 'Call back' });
    expect(api.calls[0].body).toEqual({ leadId: LEAD, type: 'OTHER', dueAt: '2026-10-16T10:00:00.000Z', note: 'Call back' });
    const done = await crmApi.completeTask(TASK);
    expect(api.calls[1].method).toBe('POST');
    expect(done.status).toBe('DONE');
  });

  it('validates the lead form to createLeadBody rules', () => {
    expect(validateLeadForm(EMPTY_LEAD_FORM)).toEqual({ contactName: 'Contact name is required.' });
    const errors = validateLeadForm({ ...EMPTY_LEAD_FORM, contactName: 'A', email: 'nope', phone: '123', country: 'GBR', childAge: '2' });
    expect(Object.keys(errors).sort()).toEqual(['childAge', 'country', 'email', 'phone']);
    expect(toCreateLeadInput({ ...EMPTY_LEAD_FORM, contactName: ' Amina ', country: 'gb', childAge: '7' })).toEqual({
      contactName: 'Amina',
      source: undefined,
      email: undefined,
      phone: undefined,
      country: 'GB',
      childAge: 7,
      courseInterest: undefined,
      notes: undefined,
    });
  });

  it('offers no next stage for closed leads', () => {
    expect(nextLeadStatuses('WON')).toEqual([]);
    expect(nextLeadStatuses('LOST')).toEqual([]);
    expect(nextLeadStatuses('NEW')).toEqual(['TRIAL_BOOKED', 'TRIAL_DONE', 'WON', 'LOST']);
  });
});
