import { describe, it, expect } from 'vitest';
import {
  consentApi,
  CONSENT_POLICY_VERSION,
  hasRequiredConsent,
  validateVerificationCode,
  StudentConsentState,
} from '@/lib/api/modules/consent';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const S = 'stu-1';
const F = 'fam-1';

describe('consent API module', () => {
  it('reads consent state per purpose', async () => {
    const api = mockApi({
      [`GET /consent/students/${S}`]: {
        body: envelope({ studentId: S, purposes: [{ purpose: 'DATA_COLLECTION', status: 'GRANTED', grantedAt: 'x', withdrawnAt: null, policyVersion: 'v1' }] }),
      },
    });
    const state = await consentApi.forStudent(S);
    expect(api.calls[0].url).toContain(`/consent/students/${S}`);
    expect(state.purposes[0].status).toBe('GRANTED');
  });

  it('grants with method + policy version defaults', async () => {
    const api = mockApi({ [`POST /consent/students/${S}/grant`]: { status: 201, body: envelope([{ id: 'c1', purpose: 'AI_VOICE', status: 'GRANTED' }]) } });
    const rows = await consentApi.grant(S, { purposes: ['AI_VOICE'] });
    expect(api.calls[0].body).toEqual({ purposes: ['AI_VOICE'], method: 'OTHER', policyVersion: CONSENT_POLICY_VERSION });
    expect(rows[0].purpose).toBe('AI_VOICE');
  });

  it('withdraws, sending a reason only when given', async () => {
    const api = mockApi({ [`POST /consent/students/${S}/withdraw`]: { status: 201, body: envelope([]) } });
    await consentApi.withdraw(S, { purposes: ['MARKETING'], reason: '  ' });
    await consentApi.withdraw(S, { purposes: ['MARKETING'], reason: 'No longer wanted' });
    expect(api.calls[0].body).toEqual({ purposes: ['MARKETING'] });
    expect(api.calls[1].body).toEqual({ purposes: ['MARKETING'], reason: 'No longer wanted' });
  });

  it('starts and confirms guardian verification', async () => {
    const api = mockApi({
      [`POST /consent/families/${F}/verify/start`]: { status: 202, body: envelope({ challengeId: 'ch', expiresInSeconds: 900 }) },
      [`POST /consent/families/${F}/verify/confirm`]: { body: envelope({ verifiedAt: '2026-10-15T10:00:00Z' }) },
    });
    expect((await consentApi.startVerification(F)).expiresInSeconds).toBe(900);
    const res = await consentApi.confirmVerification(F, ' 123456 ');
    expect(api.calls[1].body).toEqual({ code: '123456' });
    expect(res.verifiedAt).toContain('2026');
  });

  it('surfaces a wrong verification code', async () => {
    mockApi({ [`POST /consent/families/${F}/verify/confirm`]: apiError(400, 'BAD_REQUEST', 'That code is not correct') });
    await expect(consentApi.confirmVerification(F, '000000')).rejects.toThrow('That code is not correct');
  });

  it('creates and lists data requests', async () => {
    const api = mockApi({
      [`POST /consent/families/${F}/data-requests`]: { status: 202, body: envelope({ id: 'd1', type: 'EXPORT', status: 'REQUESTED', dueAt: 'x' }) },
      [`GET /consent/families/${F}/data-requests`]: { body: envelope([{ id: 'd1', type: 'EXPORT', status: 'REQUESTED', requestedAt: 'x', dueAt: 'y', completedAt: null, fileUrl: null }]) },
    });
    await consentApi.createDataRequest(F, { type: 'EXPORT' });
    await consentApi.createDataRequest(F, { type: 'DELETE', studentId: S });
    expect(api.calls[0].body).toEqual({ type: 'EXPORT' });
    expect(api.calls[1].body).toEqual({ type: 'DELETE', studentId: S });
    const list = await consentApi.listDataRequests(F);
    expect(list[0].status).toBe('REQUESTED');
  });

  it('reads the privacy summary', async () => {
    mockApi({
      [`GET /consent/families/${F}/privacy-summary`]: {
        body: envelope({ familyId: F, students: [], consents: [], requests: [], openCases: 0, generatedAt: 'x', exportAvailable: true }),
      },
    });
    const s = await consentApi.privacySummary(F);
    expect(s.exportAvailable).toBe(true);
  });

  it('maps a role error', async () => {
    mockApi({ [`POST /consent/students/${S}/grant`]: apiError(403, 'ROLE_REQUIRED', 'Guardian only') });
    await expect(consentApi.grant(S, { purposes: ['DATA_COLLECTION'] })).rejects.toMatchObject({ status: 403, code: 'ROLE_REQUIRED' });
  });
});

describe('consent helpers', () => {
  const state = (status: 'GRANTED' | 'WITHDRAWN'): StudentConsentState => ({
    studentId: S,
    purposes: [{ purpose: 'DATA_COLLECTION', status, grantedAt: null, withdrawnAt: null, policyVersion: null }],
  });
  it('detects the CR-01 required consent', () => {
    expect(hasRequiredConsent(state('GRANTED'))).toBe(true);
    expect(hasRequiredConsent(state('WITHDRAWN'))).toBe(false);
    expect(hasRequiredConsent(undefined)).toBe(false);
  });
  it('validates 6-digit codes', () => {
    expect(validateVerificationCode('')).toBeTruthy();
    expect(validateVerificationCode('12ab56')).toBeTruthy();
    expect(validateVerificationCode('123456')).toBeNull();
  });
});
