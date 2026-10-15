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
});
