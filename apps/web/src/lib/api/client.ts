import { 
  Course, 
  CourseType, 
  Currency, 
  Role,
  TeacherProfile,
  AuthUserRecord,
  AuthTokensResponse,
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
  LogoutRequest,
  UserSessionRecord,
  TwoFactorSetupResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest
} from '@/lib/types';
import { 
  BASELINE_COURSES, 
  VERIFIED_FACULTY_PROFILES, 
  TUITION_PLANS_CATALOG, 
  KNOWLEDGE_BASE_FAQS,
  TuitionPlanTier 
} from '@/lib/data/baseline-catalog';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export interface ApiResponse<T> {
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

// ── In-Memory Auth Session Management (Zero LocalStorage Persistence) ─────────

let activeAccessToken: string | null = null;
let activeUser: AuthUserRecord | null = null;

export function getAccessToken(): string | null {
  return activeAccessToken;
}

export function setAccessToken(token: string | null): void {
  activeAccessToken = token;
}

export function clearAccessToken(): void {
  activeAccessToken = null;
  activeUser = null;
}

export function getActiveUser(): AuthUserRecord | null {
  return activeUser;
}

export function setActiveUser(user: AuthUserRecord | null): void {
  activeUser = user;
}

/**
 * Validates and sanitizes a post-login or post-auth return destination,
 * guarding against open redirect vulnerabilities (CWE-601).
 * Only allows relative paths starting with a single '/' and rejects protocol-relative '//'.
 */
export function getSafeRedirectUrl(target: string | null | undefined, fallback = '/dashboard'): string {
  if (!target) return fallback;
  const decoded = decodeURIComponent(target).trim();
  if (
    decoded.startsWith('/') && 
    !decoded.startsWith('//') && 
    !decoded.startsWith('/\\') && 
    !decoded.includes('://')
  ) {
    return decoded;
  }
  return fallback;
}

// In-flight refresh promise mutex to prevent concurrent refresh races (FR-AUTH-01)
let activeRefreshPromise: Promise<{ success: boolean; tokens?: AuthTokensResponse; error?: string }> | null = null;

/**
 * Credential-exchange endpoints that must never trigger a silent refresh-and-retry.
 * Every other route — including protected `/auth/me`, `/auth/sessions`, `/auth/logout`
 * and `/auth/two-factor/*` — retries once after rotating the refresh cookie.
 */
const NO_REFRESH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function shouldRefreshOnUnauthorized(endpoint: string): boolean {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return !NO_REFRESH_ENDPOINTS.some((prefix) => path.startsWith(prefix));
}

export interface ApiRequestResult<T> {
  data: T | null;
  error?: string;
  /** Machine-readable backend error code, e.g. `INVALID_TWO_FACTOR_CODE`. */
  code?: string;
  details?: unknown;
  /** Envelope `meta` (request id, pagination) for successful responses. */
  meta?: ApiResponse<unknown>['meta'] & Record<string, unknown>;
  status: number;
}

/**
 * Generic fetch wrapper with timeout, CORS credentials, in-memory bearer auth,
 * concurrency-locked silent refresh, and standard API envelope unwrapping.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  allowRetryOnUnauthorized = true
): Promise<ApiRequestResult<T>> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (activeAccessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${activeAccessToken}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: options.credentials ?? 'include', // Automatically passes httpOnly cookie hifzoon_refresh
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle 401 Unauthorized with automatic concurrency-safe silent refresh
    if (response.status === 401 && allowRetryOnUnauthorized && shouldRefreshOnUnauthorized(endpoint)) {
      const refreshResult = await refreshTokens();
      if (refreshResult.success && refreshResult.tokens?.accessToken) {
        // Retry the original request with the fresh in-memory access token
        return apiRequest<T>(endpoint, options, false);
      }
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const errorMessage = 
        errJson?.message || 
        errJson?.error || 
        (Array.isArray(errJson?.details) ? errJson.details.join(', ') : null) ||
        `Request failed with status ${response.status}`;
      return {
        data: null,
        error: errorMessage,
        code: typeof errJson?.code === 'string' ? errJson.code : undefined,
        details: errJson?.details,
        status: response.status,
      };
    }

    if (response.status === 204) {
      return { data: true as unknown as T, status: 204 };
    }

    const json = await response.json().catch(() => null);
    const unwrapped = (json?.data !== undefined ? json.data : json) as T;
    return { data: unwrapped, meta: json?.data !== undefined ? json?.meta : undefined, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : 'Network error occurred';
    return { data: null, error: message, status: 0 };
  }
}

// ── Course API ─────────────────────────────────────────────────────────────

interface ServerCourseLevel {
  id: string;
  name: string;
  position: number;
  lessonCount: number;
  lessons?: Array<{
    id: string;
    title: string;
    position: number;
    objectives?: string[];
  }>;
}

interface ServerCoursePayload {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
  levels?: ServerCourseLevel[];
}

const COURSE_CATEGORY_BY_TYPE: Record<string, Course['category']> = {
  QAIDA: 'Foundation',
  NAZRA: 'Recitation',
  TAJWEED: 'Recitation',
  HIFZ: 'Memorization',
  MURAJAAH: 'Memorization',
  IJAZAH: 'Certification',
  ARABIC: 'Islamic Knowledge',
  TAFSIR: 'Islamic Knowledge',
  ISLAMIC_STUDIES: 'Islamic Knowledge',
  NEW_MUSLIM: 'Islamic Knowledge',
  INTENSIVE: 'Memorization',
};

/**
 * Public course catalogue (`GET /courses`). Real fields come from the API; curated
 * editorial copy is merged only for a course whose code matches the baseline catalogue.
 * The baseline catalogue is returned only when the API is unreachable or empty.
 */
export async function fetchCourses(): Promise<Course[]> {
  const response = await apiRequest<ServerCoursePayload[]>('/courses');
  const remoteCourses = response.data;

  if (!remoteCourses || !Array.isArray(remoteCourses) || remoteCourses.length === 0) {
    return BASELINE_COURSES.map((course) => ({ ...course, source: 'baseline' as const }));
  }

  return remoteCourses.map((serverCourse) => {
    const curated = BASELINE_COURSES.find((b) => b.code.toUpperCase() === serverCourse.code.toUpperCase());
    const levels = (serverCourse.levels ?? []).map((level) => ({
      id: level.id,
      name: level.name,
      position: level.position,
      lessonCount: level.lessonCount ?? level.lessons?.length ?? 0,
    }));
    const firstSentence = serverCourse.description?.split(/(?<=[.!?])\s/)[0];

    return {
      id: serverCourse.id,
      code: serverCourse.code as CourseType,
      title: serverCourse.name,
      tagline: curated?.tagline ?? firstSentence ?? undefined,
      description: serverCourse.description ?? '',
      levelCount: levels.length,
      levels,
      durationMonths: curated?.durationMonths,
      targetAudience: curated?.targetAudience,
      features: curated?.features ?? [],
      prerequisites: curated?.prerequisites,
      category: curated?.category ?? COURSE_CATEGORY_BY_TYPE[serverCourse.type] ?? 'Recitation',
      badge: curated?.badge,
      iconName: curated?.iconName ?? 'BookOpen',
      source: 'api' as const,
    };
  });
}

// ── Faculty / Teachers API ───────────────────────────────────────────────────

interface ServerTeacherProfile {
  id: string;
  bio?: string;
  photoUrl?: string | null;
  gender?: 'MALE' | 'FEMALE';
  languages?: string[];
  subjects?: string[];
  ageGroups?: string[];
  publicRatingAvg?: string;
  user?: {
    name?: string;
  };
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Approved, bookable teachers (`GET /teachers/public`) with only the fields the API
 * returns — no invented media, experience, review counts or qualifications. Baseline
 * profiles are returned only when the API is unreachable or has no teachers.
 */
export async function fetchTeachers(): Promise<TeacherProfile[]> {
  const response = await apiRequest<ServerTeacherProfile[]>('/teachers/public');
  const serverFaculty = response.data;

  if (!serverFaculty || !Array.isArray(serverFaculty) || serverFaculty.length === 0) {
    return VERIFIED_FACULTY_PROFILES.map((teacher) => ({ ...teacher, source: 'baseline' as const }));
  }

  return serverFaculty.map((profile) => {
    const parsedRating = profile.publicRatingAvg != null ? Number(profile.publicRatingAvg) : NaN;
    return {
      id: profile.id,
      name: profile.user?.name ?? 'Hifzoon teacher',
      gender: profile.gender ?? null,
      photoUrl: profile.photoUrl ?? null,
      bio: profile.bio ?? null,
      languages: (profile.languages ?? []).map(languageName),
      specializations: profile.subjects ?? [],
      ageGroups: profile.ageGroups ?? [],
      rating: Number.isFinite(parsedRating) ? parsedRating : null,
      source: 'api' as const,
    };
  });
}

// ── Plans & Pricing API ───────────────────────────────────────────────────

interface ServerPriceTier {
  id: string;
  planId: string;
  currency: string;
  amountMinor: number;
}

interface ServerPlanPayload {
  id: string;
  code: string;
  name: string;
  classesPerWeek: number;
  classMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod: string;
  active: boolean;
  prices?: ServerPriceTier[];
}

export type PlanConfig = TuitionPlanTier;

/**
 * Plan catalogue (`GET /billing/plans`) with the stored price for every currency.
 * Features are described from the plan's own fields only. Baseline plans are returned
 * only when the API is unreachable or has no active plans.
 */
export async function fetchPlans(): Promise<PlanConfig[]> {
  const response = await apiRequest<ServerPlanPayload[]>('/billing/plans');
  const serverPlans = response.data;

  if (!serverPlans || !Array.isArray(serverPlans) || serverPlans.length === 0) {
    return TUITION_PLANS_CATALOG;
  }

  return serverPlans.map((serverPlan) => {
    const pricesMinor: PlanConfig['pricesMinor'] = {};
    for (const price of serverPlan.prices ?? []) {
      if ((Object.values(Currency) as string[]).includes(price.currency) && Number.isFinite(price.amountMinor)) {
        pricesMinor[price.currency as Currency] = price.amountMinor;
      }
    }
    const roomLabel = serverPlan.roomType === 'CIRCLE' ? 'Small group circle' : 'Private 1-on-1 classes';
    return {
      id: serverPlan.id,
      code: serverPlan.code,
      name: serverPlan.name,
      classesPerWeek: serverPlan.classesPerWeek,
      classDurationMins: serverPlan.classMinutes,
      type: serverPlan.roomType,
      billingPeriod: serverPlan.billingPeriod,
      pricesMinor,
      features: [
        `${serverPlan.classesPerWeek} live class${serverPlan.classesPerWeek === 1 ? '' : 'es'} per week`,
        `${serverPlan.classMinutes} minutes per class`,
        roomLabel,
        `Billed ${serverPlan.billingPeriod.toLowerCase()}`,
      ],
      source: 'api' as const,
    };
  });
}

// ── FAQ Knowledge Base API ────────────────────────────────────────────────

interface ServerFaqEntry {
  id: string;
  locale: string;
  question: string;
  answer: string;
  approved: boolean;
  sort: number;
}

export async function fetchFaqs(): Promise<Array<{ q: string; a: string }>> {
  const response = await apiRequest<ServerFaqEntry[]>('/faq');
  const serverFaqs = response.data;

  if (!serverFaqs || !Array.isArray(serverFaqs) || serverFaqs.length === 0) {
    return KNOWLEDGE_BASE_FAQS;
  }

  return serverFaqs
    .filter((entry) => entry.approved !== false)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((entry) => ({
      q: entry.question,
      a: entry.answer
    }));
}

// ── Authentication API Module (FR-AUTH-01 to FR-AUTH-07, NFR-SEC-04) ─────────

export interface LoginResult {
  success: boolean;
  user?: AuthTokensResponse['user'];
  accessToken?: string;
  error?: string;
  twoFactorRequired?: boolean;
}

/**
 * Register a new guardian or student account (FR-AUTH-01).
 * Self-registration is strictly restricted to personal roles.
 */
export async function registerUser(
  payload: RegisterRequest
): Promise<{ success: boolean; user?: AuthUserRecord; error?: string }> {
  const response = await apiRequest<AuthUserRecord>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (response.data) {
    return { success: true, user: response.data };
  }

  return {
    success: false,
    error: response.error || 'Registration failed. Please check the details provided.',
  };
}

/**
 * Sign in with email and password (FR-AUTH-01, NFR-SEC-04).
 * Handles TOTP 2FA code challenge and in-memory access token storage.
 */
export async function loginUser(
  emailOrPayload: string | LoginRequest,
  password?: string
): Promise<LoginResult> {
  const payload: LoginRequest = 
    typeof emailOrPayload === 'string'
      ? { email: emailOrPayload, password: password || '' }
      : emailOrPayload;

  const response = await apiRequest<AuthTokensResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (response.data && response.data.accessToken) {
    setAccessToken(response.data.accessToken);
    if (response.data.user) {
      setActiveUser(response.data.user as unknown as AuthUserRecord);
    }
    return {
      success: true,
      user: response.data.user,
      accessToken: response.data.accessToken,
    };
  }

  const isTwoFactorChallenge =
    response.code === 'TWO_FACTOR_REQUIRED' ||
    response.code === 'INVALID_TWO_FACTOR_CODE' ||
    (!response.code && response.status === 401 && !!response.error?.toLowerCase().includes('two-factor'));

  if (isTwoFactorChallenge) {
    return {
      success: false,
      twoFactorRequired: true,
      error: response.error,
    };
  }

  return {
    success: false,
    error: response.error || 'Invalid credentials or account temporarily locked.',
  };
}

/**
 * Rotate the refresh token and mint a new access token (FR-AUTH-01).
 * Can be called silently on app boot using httpOnly cookie or payload.
 * Protected by an in-flight promise mutex to prevent concurrent refresh token rotation races.
 */
export async function refreshTokens(
  payload?: RefreshRequest
): Promise<{ success: boolean; tokens?: AuthTokensResponse; error?: string }> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await apiRequest<AuthTokensResponse>(
        '/auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify(payload || {}),
        },
        false // Prevent recursive 401 retry loop on refresh endpoint
      );

      if (response.data && response.data.accessToken) {
        setAccessToken(response.data.accessToken);
        if (response.data.user) {
          setActiveUser(response.data.user as unknown as AuthUserRecord);
        }
        return { success: true, tokens: response.data };
      }

      clearAccessToken();
      return {
        success: false,
        error: response.error || 'Session could not be refreshed. Please sign in again.',
      };
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Revoke the current session, or every session for this account.
 */
export async function logoutUser(
  payload?: LogoutRequest
): Promise<{ success: boolean; error?: string }> {
  const response = await apiRequest('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: payload?.refreshToken,
      allSessions: payload?.allSessions ?? false,
    }),
  });

  clearAccessToken();
  return { success: response.status < 400, error: response.error };
}

/**
 * Retrieve current user profile with assigned roles (FR-AUTH-02).
 */
export async function fetchCurrentUser(): Promise<AuthUserRecord | null> {
  const response = await apiRequest<AuthUserRecord>('/auth/me');
  if (response.data) {
    setActiveUser(response.data);
    return response.data;
  }
  return null;
}

/**
 * Retrieve active sessions for this account (FR-AUTH-07).
 */
export async function fetchActiveSessions(): Promise<UserSessionRecord[]> {
  const response = await apiRequest<UserSessionRecord[]>('/auth/sessions');
  return response.data || [];
}

/**
 * Begin staff 2FA enrolment (FR-AUTH-01).
 * Requires account password re-verification.
 */
export async function setupTwoFactor(
  password: string
): Promise<{ success: boolean; data?: TwoFactorSetupResponse; error?: string }> {
  const response = await apiRequest<TwoFactorSetupResponse>('/auth/two-factor/setup', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

  if (response.data) {
    return { success: true, data: response.data };
  }
  return { success: false, error: response.error || 'Failed to initialize two-factor authentication' };
}

/**
 * Confirm 2FA enrolment with the first valid TOTP code (FR-AUTH-01).
 */
export async function confirmTwoFactor(
  code: string
): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
  const response = await apiRequest<{ enabled: boolean }>('/auth/two-factor/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

  if (response.data) {
    return { success: true, enabled: response.data.enabled };
  }
  return { success: false, error: response.error || 'Invalid verification code' };
}

/**
 * Disable two-factor authentication for the active account.
 */
export async function disableTwoFactor(): Promise<{ success: boolean; error?: string }> {
  const response = await apiRequest('/auth/two-factor/disable', {
    method: 'POST',
  });
  return { success: response.status < 400, error: response.error };
}

/**
 * Request a password reset email (NFR-SEC-04).
 * Anti-enumeration: returns 202 whether email exists or not.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const response = await apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  if (response.status === 202 || response.status < 400) {
    return {
      success: true,
      message: 'If an account is associated with this email, instructions have been dispatched.',
    };
  }

  return {
    success: false,
    message: response.error || 'Unable to request password reset. Please try again later.',
    error: response.error,
  };
}

/**
 * Complete a password reset; ends every existing session (NFR-SEC-04).
 */
export async function completePasswordReset(
  payload: ResetPasswordRequest
): Promise<{ success: boolean; message: string; error?: string }> {
  const response = await apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (response.status === 204 || response.status < 400) {
    return {
      success: true,
      message: 'Password successfully updated. All active sessions have been terminated for security.',
    };
  }

  return {
    success: false,
    message: response.error || 'This reset link is invalid or has expired.',
    error: response.error,
  };
}

/**
 * Re-verifies the signed-in user's password (and TOTP code when 2FA is on) before a
 * sensitive change such as enrolling or disabling 2FA.
 *
 * The backend's 2FA endpoints do not check the password themselves (see
 * apps/web/docs/backendrequirement.md S16), so this performs a real credential check:
 * a sign-in with `credentials: 'omit'` (the current session's refresh cookie is not
 * touched) whose throwaway session is revoked immediately.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  twoFactorCode?: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const check = await apiRequest<AuthTokensResponse>(
    '/auth/login',
    {
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify({ email, password, deviceId: 'reauth-check', ...(twoFactorCode ? { twoFactorCode } : {}) }),
    },
    false,
  );

  if (check.data?.accessToken) {
    await apiRequest(
      '/auth/logout',
      {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${check.data.accessToken}` },
        body: JSON.stringify({ allSessions: false }),
      },
      false,
    );
    return { ok: true };
  }

  const wrongCode = check.code === 'INVALID_TWO_FACTOR_CODE' || check.code === 'TWO_FACTOR_REQUIRED';
  return {
    ok: false,
    code: check.code,
    error: wrongCode
      ? 'That authenticator code is not valid.'
      : check.status === 401
        ? 'That password is not correct.'
        : check.error || 'Could not verify your credentials.',
  };
}

/** Staff roles must hold TOTP 2FA (FR-AUTH-01); mirrors STAFF_ROLES in packages/shared. */
export const STAFF_ROLES: readonly Role[] = [
  Role.TEACHER,
  Role.EXAMINER,
  Role.SUPERVISOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.SAFEGUARDING_LEAD,
];

export function isStaffUser(roles: Role[] = []): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

/**
 * Backward-compatible helper to retrieve current in-memory authenticated user.
 */
export function getCurrentUser(): AuthUserRecord | null {
  return getActiveUser();
}

// ── Teacher Application Intake API ─────────────────────────────────────────

export interface TeacherApplicationPayload {
  applicantName: string;
  email: string;
  phone?: string;
  country?: string;
  qualifications?: Record<string, unknown>;
  recitationAudioKey?: string;
}

export async function submitTeacherApplication(payload: TeacherApplicationPayload): Promise<{ success: boolean; message: string }> {
  const response = await apiRequest('/teachers/applications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (response.status < 400 && response.data !== null) {
    return {
      success: true,
      message: 'Your application has been received. Our academic committee will review your recitation and contact you within 48 hours.',
    };
  }

  return {
    success: false,
    message:
      response.status === 409
        ? 'An application with this email address is already in review.'
        : response.error || 'We could not submit your application. Please check your details and try again.',
  };
}

// ── Family & Guardian Verification API Module (CR-01, CR-10, FR-AUTH-03) ───

export interface FamilyRecord {
  id: string;
  name: string;
  country?: string;
  currency?: Currency;
  verified?: boolean;
}

export interface AddChildStudentPayload {
  displayName: string;
  birthYear: number;
  gender: 'MALE' | 'FEMALE';
  language?: string;
  timeZone?: string;
  kidsMode?: boolean;
  notes?: string;
}

export async function createFamily(payload: { name: string; country?: string; currency?: Currency }): Promise<{ success: boolean; family?: FamilyRecord; error?: string }> {
  const response = await apiRequest<FamilyRecord>('/families', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (response.data) {
    return { success: true, family: response.data };
  }
  return { success: false, error: response.error || 'Could not create family' };
}

export async function fetchMyFamilies(): Promise<FamilyRecord[]> {
  const response = await apiRequest<FamilyRecord[]>('/families');
  return response.data || [];
}

export async function addChildStudent(
  familyId: string, 
  payload: AddChildStudentPayload
): Promise<{ success: boolean; student?: unknown; requiresConsent?: boolean; error?: string }> {
  const response = await apiRequest<{ id: string; requiresConsent?: boolean } & Record<string, unknown>>(`/families/${familyId}/students`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (response.data) {
    return { success: true, student: response.data, requiresConsent: response.data.requiresConsent };
  }
  return { success: false, error: response.error || 'Could not add student' };
}

export async function startGuardianVerification(
  familyId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const response = await apiRequest(`/consent/families/${familyId}/verify/start`, {
    method: 'POST',
  });
  if (response.status === 202 || response.status < 400) {
    return { success: true, message: 'Verification code sent to primary guardian email.' };
  }
  return { success: false, message: response.error || 'Failed to start verification', error: response.error };
}

export async function confirmGuardianVerification(
  familyId: string, 
  code: string
): Promise<{ success: boolean; error?: string }> {
  const response = await apiRequest(`/consent/families/${familyId}/verify/confirm`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return { success: response.status < 400, error: response.error };
}

export async function grantStudentConsent(
  studentId: string, 
  purposes: string[],
  method = 'SIGNED_FORM',
  policyVersion = '1.0'
): Promise<{ success: boolean; error?: string }> {
  const response = await apiRequest(`/consent/students/${studentId}/grant`, {
    method: 'POST',
    body: JSON.stringify({ purposes, method, policyVersion }),
  });
  return { success: response.status < 400, error: response.error };
}

/**
 * Resolves the authorized landing destination based on authenticated user roles (FR-AUTH-02).
 */
export function getDefaultRouteForRole(roles: Role[] = []): string {
  if (roles.includes(Role.SUPER_ADMIN) || roles.includes(Role.ADMIN)) return '/admin';
  if (roles.includes(Role.SAFEGUARDING_LEAD)) return '/safeguarding';
  if (roles.includes(Role.SUPERVISOR) || roles.includes(Role.EXAMINER)) return '/supervisor';
  if (roles.includes(Role.TEACHER)) return '/teacher';
  if (roles.includes(Role.GUARDIAN)) return '/parent';
  if (roles.includes(Role.STUDENT) || roles.includes(Role.CHILD_STUDENT)) return '/student';
  return '/dashboard';
}

