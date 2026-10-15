import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  loginUser, 
  logoutUser, 
  registerUser, 
  refreshTokens, 
  fetchCurrentUser, 
  fetchActiveSessions, 
  setupTwoFactor, 
  confirmTwoFactor, 
  disableTwoFactor, 
  requestPasswordReset, 
  completePasswordReset,
  getAccessToken,
  getActiveUser,
  clearAccessToken
} from '@/lib/api/client';
import { Role } from '@/lib/types';

describe('Auth Module - Verification & Session Lifecycle Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAccessToken();
  });

  // ── Login & In-Memory Token Management ─────────────────────────────────────

  it('authenticates credentials and provisions in-memory access token without localStorage', async () => {
    const syntheticServerEnvelope = {
      accessToken: 'hifzoon-access-jwt-token-alpha',
      expiresIn: 900,
      refreshToken: 'hifzoon-refresh-opaque-token-beta',
      user: {
        id: 'usr-parent-01',
        email: 'parent@hifzoon.test',
        name: 'Amina Al-Mansoor',
        roles: [Role.GUARDIAN],
        status: 'ACTIVE',
        twoFactorEnabled: false,
        lastActiveAt: new Date().toISOString(),
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => syntheticServerEnvelope,
    } as Response);

    const result = await loginUser({
      email: 'parent@hifzoon.test',
      password: 'Hifzoon!Dev2026',
    });

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('hifzoon-access-jwt-token-alpha');
    expect(result.user?.email).toBe('parent@hifzoon.test');
    expect(getAccessToken()).toBe('hifzoon-access-jwt-token-alpha');
    expect(getActiveUser()?.id).toBe('usr-parent-01');
  });

  it('handles invalid credentials with appropriate domain error message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      }),
    } as Response);

    const result = await loginUser({
      email: 'unknown@example.com',
      password: 'wrongpassword123',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Email or password is incorrect');
    expect(getAccessToken()).toBeNull();
  });

  it('signals two-factor requirement when account requires staff TOTP challenge', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        statusCode: 401,
        code: 'TWO_FACTOR_REQUIRED',
        message: 'Two-factor code is required for staff access',
      }),
    } as Response);

    const result = await loginUser({
      email: 'staff@hifzoon.test',
      password: 'Staff!Secure2026',
    });

    expect(result.success).toBe(false);
    expect(result.twoFactorRequired).toBe(true);
  });

  // ── Registration (FR-AUTH-01) ──────────────────────────────────────────────

  it('submits registration request for guardian account and returns user record', async () => {
    const syntheticNewUser = {
      id: 'usr-new-001',
      email: 'newparent@example.com',
      name: 'Tariq Jameel',
      language: 'en',
      timeZone: 'Europe/London',
      status: 'ACTIVE' as const,
      twoFactorEnabled: false,
      lastActiveAt: new Date().toISOString(),
      roles: [Role.GUARDIAN],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: syntheticNewUser }),
    } as Response);

    const result = await registerUser({
      email: 'newparent@example.com',
      password: 'StrongSecretPassword123!',
      name: 'Tariq Jameel',
      role: Role.GUARDIAN,
    });

    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('usr-new-001');
    expect(result.user?.email).toBe('newparent@example.com');
  });

  it('gracefully reports duplicate email collision from registration API', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        code: 'EMAIL_TAKEN',
        message: 'That email address is already registered',
      }),
    } as Response);

    const result = await registerUser({
      email: 'existing@example.com',
      password: 'StrongSecretPassword123!',
      name: 'Duplicate User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already registered');
  });

  // ── Silent Token Refresh (FR-AUTH-01) ─────────────────────────────────────

  it('rotates tokens via refresh endpoint and updates in-memory access token', async () => {
    const rotatedEnvelope = {
      accessToken: 'rotated-access-token-gamma',
      expiresIn: 900,
      refreshToken: 'rotated-refresh-token-delta',
      user: {
        id: 'usr-parent-01',
        email: 'parent@hifzoon.test',
        name: 'Amina Al-Mansoor',
        roles: [Role.GUARDIAN],
        status: 'ACTIVE',
        twoFactorEnabled: false,
        lastActiveAt: new Date().toISOString(),
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => rotatedEnvelope,
    } as Response);

    const result = await refreshTokens();

    expect(result.success).toBe(true);
    expect(getAccessToken()).toBe('rotated-access-token-gamma');
  });

  // ── Session Termination / Logout ──────────────────────────────────────────

  it('terminates active session and purges in-memory token state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => null,
    } as Response);

    const result = await logoutUser();

    expect(result.success).toBe(true);
    expect(getAccessToken()).toBeNull();
    expect(getActiveUser()).toBeNull();
  });

  // ── Session Registry & Inspection (FR-AUTH-07) ───────────────────────────

  it('retrieves active device session records', async () => {
    const syntheticSessions = [
      {
        id: 'sess-001',
        ip: '192.168.1.10',
        userAgent: 'Mozilla/5.0 Chrome/128',
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        staff: false,
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: syntheticSessions }),
    } as Response);

    const sessions = await fetchActiveSessions();

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('sess-001');
    expect(sessions[0].ip).toBe('192.168.1.10');
  });

  // ── Two-Factor Authentication (FR-AUTH-01) ───────────────────────────────

  it('initializes 2FA setup and returns otpauth URL with recovery codes', async () => {
    const synthetic2FAPayload = {
      otpauthUrl: 'otpauth://totp/Hifzoon:staff@example.com?secret=JBSWY3DPEHPK3PXP',
      secret: 'JBSWY3DPEHPK3PXP',
      recoveryCodes: ['code-1', 'code-2', 'code-3'],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: synthetic2FAPayload }),
    } as Response);

    const res = await setupTwoFactor('ValidStaffPassword2026!');

    expect(res.success).toBe(true);
    expect(res.data?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(res.data?.recoveryCodes.length).toBe(3);
  });

  it('confirms 2FA enrolment with valid TOTP code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { enabled: true } }),
    } as Response);

    const res = await confirmTwoFactor('123456');

    expect(res.success).toBe(true);
    expect(res.enabled).toBe(true);
  });

  it('disables 2FA enrolment on demand', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => null,
    } as Response);

    const res = await disableTwoFactor();
    expect(res.success).toBe(true);
  });

  // ── Password Recovery (NFR-SEC-04) ────────────────────────────────────────

  it('submits forgot-password email request and acknowledges 202 status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => null,
    } as Response);

    const res = await requestPasswordReset('parent@hifzoon.test');

    expect(res.success).toBe(true);
    expect(res.message).toContain('associated with this email');
  });

  it('executes password reset with valid token and terminates existing sessions', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => null,
    } as Response);

    const res = await completePasswordReset({
      token: 'valid-reset-token-sample',
      password: 'NewStrongPassword123!',
    });

    expect(res.success).toBe(true);
    expect(res.message).toContain('Password successfully updated');
  });

  // ── Open Redirect Defense (CWE-601) ───────────────────────────────────────

  it('sanitizes open redirect attack vectors and preserves safe relative routes', async () => {
    const { getSafeRedirectUrl } = await import('@/lib/api/client');

    // Safe targets
    expect(getSafeRedirectUrl('/portal-preview')).toBe('/portal-preview');
    expect(getSafeRedirectUrl('/account/security')).toBe('/account/security');
    expect(getSafeRedirectUrl('/courses?track=hifz')).toBe('/courses?track=hifz');

    // Malicious open redirect payloads
    expect(getSafeRedirectUrl('https://evil-phishing.com')).toBe('/dashboard');
    expect(getSafeRedirectUrl('http://attacker.org/login')).toBe('/dashboard');
    expect(getSafeRedirectUrl('//evil.com/fake-login')).toBe('/dashboard');
    expect(getSafeRedirectUrl('/\\evil.com')).toBe('/dashboard');
    expect(getSafeRedirectUrl(null)).toBe('/dashboard');
  });

  // ── Concurrency-Safe Token Refresh Mutex (FR-AUTH-01) ─────────────────────

  it('deduplicates concurrent refresh operations to avoid refresh token rotation races', async () => {
    const syntheticRotated = {
      accessToken: 'single-mutex-access-token',
      expiresIn: 900,
      refreshToken: 'single-mutex-refresh-token',
      user: {
        id: 'usr-parent-01',
        email: 'parent@hifzoon.test',
        name: 'Amina Al-Mansoor',
        roles: [Role.GUARDIAN],
        status: 'ACTIVE',
        twoFactorEnabled: false,
        lastActiveAt: new Date().toISOString(),
      },
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ok: true,
        status: 200,
        json: async () => syntheticRotated,
      } as Response;
    });

    // Fire 3 simultaneous refresh calls
    const [res1, res2, res3] = await Promise.all([
      refreshTokens(),
      refreshTokens(),
      refreshTokens(),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res3.success).toBe(true);
    expect(res1.tokens?.accessToken).toBe('single-mutex-access-token');

    // Exactly 1 fetch request should have executed
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ── Guardian Verification & Child Profile (CR-10, FR-AUTH-03) ────────────

  it('initiates guardian verification with 6-digit code dispatch', async () => {
    const { startGuardianVerification, confirmGuardianVerification } = await import('@/lib/api/client');

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => null,
    } as Response);

    const startRes = await startGuardianVerification('fam-001');
    expect(startRes.success).toBe(true);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { verified: true } }),
    } as Response);

    const confirmRes = await confirmGuardianVerification('fam-001', '654321');
    expect(confirmRes.success).toBe(true);
  });

  it('provisions child student without requiring child email address', async () => {
    const { addChildStudent } = await import('@/lib/api/client');

    const syntheticStudent = {
      id: 'stu-child-01',
      displayName: 'Zaid',
      birthYear: 2017,
      gender: 'MALE',
      requiresConsent: true,
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: syntheticStudent }),
    } as Response);

    const res = await addChildStudent('fam-001', {
      displayName: 'Zaid',
      birthYear: 2017,
      gender: 'MALE',
      kidsMode: true,
    });

    expect(res.success).toBe(true);
    expect(res.requiresConsent).toBe(true);
  });

  // ── Guardian Consent & Safeguarding (FR-AUTH-04, CR-01) ────────────────────

  it('records explicit guardian consent for independent purposes', async () => {
    const { grantStudentConsent } = await import('@/lib/api/client');

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { granted: true } }),
    } as Response);

    const res = await grantStudentConsent('stu-child-01', ['DATA_COLLECTION', 'CLASS_RECORDING']);
    expect(res.success).toBe(true);
  });

  // ── Current User Restoration & Reload (FR-AUTH-02) ─────────────────────────

  it('restores current user profile from /auth/me when token is active', async () => {
    const syntheticUser = {
      id: 'usr-parent-01',
      email: 'parent@hifzoon.test',
      name: 'Amina Al-Mansoor',
      roles: [Role.GUARDIAN],
      status: 'ACTIVE' as const,
      twoFactorEnabled: false,
      lastActiveAt: new Date().toISOString(),
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: syntheticUser }),
    } as Response);

    const user = await fetchCurrentUser();
    expect(user?.email).toBe('parent@hifzoon.test');
    expect(user?.roles).toContain(Role.GUARDIAN);
  });

  // ── Expired Session & 401 Handling ─────────────────────────────────────────

  it('clears in-memory token and session state when refresh token is expired/revoked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Refresh token expired or revoked',
      }),
    } as Response);

    const res = await refreshTokens();
    expect(res.success).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(getActiveUser()).toBeNull();
  });

  // ── Network Failure Handling ───────────────────────────────────────────────

  it('handles network drops without throwing unhandled exceptions', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));

    const result = await loginUser({
      email: 'parent@hifzoon.test',
      password: 'Hifzoon!Dev2026',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to fetch');
  });

  // ── Role-Based Routing Resolution (FR-AUTH-02) ─────────────────────────────

  it('maps authenticated roles to authorized portal routes', async () => {
    const { getDefaultRouteForRole } = await import('@/lib/api/client');

    expect(getDefaultRouteForRole([Role.GUARDIAN])).toBe('/parent');
    expect(getDefaultRouteForRole([Role.TEACHER])).toBe('/teacher');
    expect(getDefaultRouteForRole([Role.STUDENT])).toBe('/student');
    expect(getDefaultRouteForRole([Role.CHILD_STUDENT])).toBe('/student');
    expect(getDefaultRouteForRole([Role.ADMIN])).toBe('/admin');
    expect(getDefaultRouteForRole([Role.SUPER_ADMIN])).toBe('/admin');
    expect(getDefaultRouteForRole([Role.SUPERVISOR])).toBe('/supervisor');
    expect(getDefaultRouteForRole([Role.SAFEGUARDING_LEAD])).toBe('/safeguarding');
    // Highest-privilege portal wins for multi-role staff.
    expect(getDefaultRouteForRole([Role.TEACHER, Role.ADMIN])).toBe('/admin');
    expect(getDefaultRouteForRole([])).toBe('/dashboard');
  });
});


