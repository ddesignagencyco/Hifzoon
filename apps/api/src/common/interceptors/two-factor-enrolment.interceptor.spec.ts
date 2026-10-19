import { ErrorCode } from '@hifzoon/shared';

import { TwoFactorEnrolmentInterceptor } from './two-factor-enrolment.interceptor';
import type { AppConfigService } from '../../config/app-config.service';

type Ctx = Parameters<TwoFactorEnrolmentInterceptor['intercept']>[0];

function contextFor(path: string, user: unknown) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ path, user }) }),
  } as unknown as Ctx;
}

function build(enforced = true) {
  const config = {
    value: { TWO_FACTOR_ENROLMENT_ENFORCED: enforced },
  } as unknown as AppConfigService;
  const interceptor = new TwoFactorEnrolmentInterceptor(config);
  const next = { handle: () => 'next' } as never;
  const call = (path: string, user: unknown) => interceptor.intercept(contextFor(path, user), next);
  return { call };
}

const STAFF_WITHOUT_2FA = { id: 'u1', staff: true, twoFactorEnrolmentRequired: true };
const STAFF_WITH_2FA = { id: 'u2', staff: true, twoFactorEnrolmentRequired: false };
const GUARDIAN = { id: 'g1', staff: false, twoFactorEnrolmentRequired: false };

describe('TwoFactorEnrolmentInterceptor (FR-AUTH-01, M42)', () => {
  it('refuses any other route to a staff account that has not enrolled', () => {
    const { call } = build();

    expect(() => call('/api/v1/families', STAFF_WITHOUT_2FA)).toThrow();
    try {
      call('/api/v1/admin/users', STAFF_WITHOUT_2FA);
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.TWO_FACTOR_ENROLMENT_REQUIRED });
    }
  });

  it('lets them enrol and read their own identity', () => {
    const { call } = build();

    expect(call('/api/v1/auth/two-factor/setup', STAFF_WITHOUT_2FA)).toBe('next');
    expect(call('/api/v1/auth/two-factor/confirm', STAFF_WITHOUT_2FA)).toBe('next');
    expect(call('/api/v1/auth/me', STAFF_WITHOUT_2FA)).toBe('next');
    expect(call('/api/v1/auth/refresh', STAFF_WITHOUT_2FA)).toBe('next');
    expect(call('/api/v1/auth/logout', STAFF_WITHOUT_2FA)).toBe('next');
  });

  it('does not restrict a staff account that has already enrolled', () => {
    const { call } = build();

    expect(call('/api/v1/families', STAFF_WITH_2FA)).toBe('next');
  });

  it('never restricts a family or student account', () => {
    const { call } = build();

    expect(call('/api/v1/families', GUARDIAN)).toBe('next');
    expect(call('/api/v1/billing/invoices', undefined)).toBe('next');
  });

  it('is switchable off for the fixture suites, and then allows everything', () => {
    const { call } = build(false);

    expect(call('/api/v1/families', STAFF_WITHOUT_2FA)).toBe('next');
  });
});
