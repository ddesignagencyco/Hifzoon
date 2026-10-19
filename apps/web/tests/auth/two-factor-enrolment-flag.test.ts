import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, clearAccessToken, isTwoFactorEnrolmentRequired, setAccessToken } from '@/lib/api/client';
import { apiError, mockApi } from '../helpers/fetch-mock';

afterEach(() => {
  vi.restoreAllMocks();
  clearAccessToken();
});

const restricted = () =>
  mockApi({ 'GET /teachers/me': apiError(403, 'TWO_FACTOR_ENROLMENT_REQUIRED', '2FA required') });

describe('M42 restricted-session flag', () => {
  it('is set by a TWO_FACTOR_ENROLMENT_REQUIRED answer', async () => {
    setAccessToken('staff-token');
    restricted();
    await apiRequest('/teachers/me');
    expect(isTwoFactorEnrolmentRequired()).toBe(true);
  });

  it('does not follow the user into the next account after sign-out (staff → parent in one tab)', async () => {
    setAccessToken('staff-token');
    restricted();
    await apiRequest('/teachers/me');
    expect(isTwoFactorEnrolmentRequired()).toBe(true);

    clearAccessToken();
    expect(isTwoFactorEnrolmentRequired()).toBe(false);
  });

  it('is cleared when a new session token arrives', async () => {
    setAccessToken('staff-token');
    restricted();
    await apiRequest('/teachers/me');
    setAccessToken('parent-token');
    expect(isTwoFactorEnrolmentRequired()).toBe(false);
  });
});
