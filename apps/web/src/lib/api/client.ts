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
import { COURSE_EDITORIAL, TuitionPlanTier } from '@/lib/data/course-editorial';

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

/**
 * Set by an explicit sign-out so the route guard sends the user to a plain `/login`
 * (no `?redirect=` back to the page they left, which the next account may not be allowed
 * to open). An *expired* session still gets the redirect.
 */
let explicitSignOut = false;

let activeAccessToken: string | null = null;
let activeUser: AuthUserRecord | null = null;

export function getAccessToken(): string | null {
  return activeAccessToken;
}

export function setAccessToken(token: string | null): void {
  activeAccessToken = token;
  // A live session again: any earlier sign-out has been handled.
  if (token) explicitSignOut = false;
  // A new token can belong to a different account (sign out → sign in in the same tab).
  // The M42 restriction is per account, so forget it; a still-restricted session answers
  // the next call with TWO_FACTOR_ENROLMENT_REQUIRED and sets it again.
  twoFactorEnrolmentRequired = false;
}

export function clearAccessToken(): void {
  activeAccessToken = null;
  activeUser = null;
  twoFactorEnrolmentRequired = false;
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

/**
 * Staff without 2FA get a restricted session (backend M42): every route except a few auth
 * ones answers 403 `TWO_FACTOR_ENROLMENT_REQUIRED`. The portal listens for this event and
 * sends the user to Account security; the flag clears once enrolment is confirmed.
 */
export const TWO_FACTOR_ENROLMENT_EVENT = 'hifzoon:two-factor-enrolment-required';
let twoFactorEnrolmentRequired = false;

export function isTwoFactorEnrolmentRequired(): boolean {
  return twoFactorEnrolmentRequired;
}

function flagTwoFactorEnrolment(required: boolean): void {
  twoFactorEnrolmentRequired = required;
  if (required && typeof window !== 'undefined') window.dispatchEvent(new Event(TWO_FACTOR_ENROLMENT_EVENT));
}

/** 401 codes that mean "wrong secret", not "expired session". */
const CREDENTIAL_ERROR_CODES = new Set(['INVALID_CREDENTIALS', 'INVALID_TWO_FACTOR_CODE', 'TWO_FACTOR_REQUIRED', 'REAUTH_REQUIRED']);

/**
 * Validation details as text. Zod routes send `[{ path, message }]`; others send strings.
 */
function detailsText(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const parts = details
    .map((d) => {
      if (typeof d === 'string') return d;
      // class-validator routes (backend M6): `{ field, messages: string[] }`.
      if (Array.isArray(d?.messages)) return d.messages.filter((m: unknown) => typeof m === 'string').join(', ');
      return typeof d?.message === 'string' ? d.message : null;
    })
    .filter((d): d is string => Boolean(d));
  return parts.length ? parts.join(', ') : null;
}

/** "Request validation failed" says nothing; prefer the field messages when present. */
const GENERIC_VALIDATION_MESSAGES = new Set(['Request validation failed', 'Validation failed']);

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

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const code = typeof errJson?.code === 'string' ? errJson.code : undefined;

      // 401 → silent concurrency-safe refresh and one retry, unless the 401 is a wrong
      // password / code on a re-auth step (2FA setup/disable): a fresh token won't fix that.
      if (
        response.status === 401 &&
        allowRetryOnUnauthorized &&
        shouldRefreshOnUnauthorized(endpoint) &&
        !(code && CREDENTIAL_ERROR_CODES.has(code))
      ) {
        const refreshResult = await refreshTokens();
        if (refreshResult.success && refreshResult.tokens?.accessToken) {
          return apiRequest<T>(endpoint, options, false);
        }
      }

      if (code === 'TWO_FACTOR_ENROLMENT_REQUIRED') flagTwoFactorEnrolment(true);

      const fieldMessages = detailsText(errJson?.details);
      const errorMessage =
        (GENERIC_VALIDATION_MESSAGES.has(errJson?.message) && fieldMessages) ||
        errJson?.message ||
        (typeof errJson?.error === 'string' ? errJson.error : null) ||
        fieldMessages ||
        `Request failed with status ${response.status}`;
      return {
        data: null,
        error: errorMessage,
        code,
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

/** Public fetchers throw so React Query reports a real error instead of showing nothing. */
function publicListOrThrow<T>(response: ApiRequestResult<T[]>, what: string): T[] {
  if (response.error && response.data === null) {
    throw new Error(response.status === 0 ? `Cannot reach the server to load ${what}.` : response.error);
  }
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Public course catalogue (`GET /courses`). Real fields come from the API; editorial copy
 * is merged only for a course whose code matches `COURSE_EDITORIAL`. No API data → no courses.
 */
export async function fetchCourses(): Promise<Course[]> {
  const remoteCourses = publicListOrThrow(await apiRequest<ServerCoursePayload[]>('/courses'), 'courses');

  return remoteCourses.map((serverCourse) => {
    const curated = COURSE_EDITORIAL.find((b) => b.code.toUpperCase() === serverCourse.code.toUpperCase());
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
  userId?: string;
  bio?: string;
  photoUrl?: string | null;
  introVideoUrl?: string | null;
  /** §7.4 — an absolute URL (teacher-proposed, admin-approved), not a storage key. */
  recitationSampleUrl?: string | null;
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
 * returns — no invented people, media, experience, review counts or qualifications.
 */
export async function fetchTeachers(): Promise<TeacherProfile[]> {
  const serverFaculty = publicListOrThrow(await apiRequest<ServerTeacherProfile[]>('/teachers/public'), 'teachers');

  return serverFaculty.map((profile) => {
    const parsedRating = profile.publicRatingAvg != null ? Number(profile.publicRatingAvg) : NaN;
    // The API accepts any absolute URL here; only an http(s) one can be played.
    const sample = profile.recitationSampleUrl;
    const audioSampleUrl = sample && /^https?:\/\//i.test(sample) ? sample : undefined;
    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.user?.name ?? 'Hifzoon teacher',
      gender: profile.gender ?? null,
      photoUrl: profile.photoUrl ?? null,
      bio: profile.bio ?? null,
      languages: (profile.languages ?? []).map(languageName),
      specializations: profile.subjects ?? [],
      ageGroups: profile.ageGroups ?? [],
      rating: Number.isFinite(parsedRating) ? parsedRating : null,
      ...(audioSampleUrl ? { audioSampleUrl } : {}),
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
 * Features are described from the plan's own fields only; prices are never invented.
 */
export async function fetchPlans(): Promise<PlanConfig[]> {
  const serverPlans = publicListOrThrow(await apiRequest<ServerPlanPayload[]>('/billing/plans'), 'plans');

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

/** Approved FAQs (`GET /faq`), managed in Admin → Content. */
export async function fetchFaqs(): Promise<Array<{ q: string; a: string }>> {
  const serverFaqs = publicListOrThrow(await apiRequest<ServerFaqEntry[]>('/faq'), 'questions');

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
  /** Machine-readable backend error code, e.g. `ACCOUNT_LOCKED`. */
  code?: string;
  /** The account has 2FA on and no code was sent: ask for one and retry (`TWO_FACTOR_REQUIRED`). */
  twoFactorRequired?: boolean;
  /** A code was sent and it was wrong (`INVALID_TWO_FACTOR_CODE`). */
  twoFactorInvalid?: boolean;
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

  // Branch on the error code, never on the status or message text (FRONTEND-DIRECTION §2).
  if (response.code === 'TWO_FACTOR_REQUIRED') {
    return { success: false, twoFactorRequired: true, code: response.code, error: response.error };
  }
  if (response.code === 'INVALID_TWO_FACTOR_CODE') {
    return {
      success: false,
      twoFactorInvalid: true,
      code: response.code,
      error: 'That code is not valid. Check the time on your phone, or use a recovery code.',
    };
  }

  return {
    success: false,
    code: response.code,
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
 * True after an explicit sign-out until the next session starts. Not consumed on read:
 * a page can mount more than one route guard while signing out (e.g. /account swaps
 * its portal shell), and every one of them must see it.
 */
export function wasExplicitSignOut(): boolean {
  return explicitSignOut;
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

  explicitSignOut = true;
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
  return {
    success: false,
    error:
      response.code === 'INVALID_CREDENTIALS'
        ? 'That password is not correct.'
        : response.error || 'Failed to initialize two-factor authentication',
  };
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
    if (response.data.enabled) flagTwoFactorEnrolment(false);
    return { success: true, enabled: response.data.enabled };
  }
  return { success: false, error: response.error || 'Invalid verification code' };
}

/** Re-authentication the backend requires before 2FA can be turned off (NFR-SEC-01). */
export interface TwoFactorReauth {
  password?: string;
  /** A current TOTP code or an unused recovery code. */
  code?: string;
}

/**
 * Disable two-factor authentication for the active account. The backend re-checks the
 * password (or a TOTP / recovery code) in the same request.
 */
export async function disableTwoFactor(
  reauth: TwoFactorReauth = {},
): Promise<{ success: boolean; error?: string; code?: string }> {
  const body: TwoFactorReauth = {};
  if (reauth.password) body.password = reauth.password;
  if (reauth.code) body.code = reauth.code.trim();
  const response = await apiRequest('/auth/two-factor/disable', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (response.status < 400) return { success: true };
  return {
    success: false,
    code: response.code,
    error:
      response.code === 'INVALID_TWO_FACTOR_CODE'
        ? 'That code is not valid.'
        : response.code === 'INVALID_CREDENTIALS'
          ? 'That password is not correct.'
          : response.code === 'REAUTH_REQUIRED'
            ? 'Enter your password or a code from your authenticator app to continue.'
            : response.error,
  };
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

// ── Google / Apple sign-in (FR-AUTH-01) ──────────────────────────────────────

export type OAuthProviderName = 'google' | 'apple';

export interface OAuthProviderStatus {
  name: OAuthProviderName;
  configured: boolean;
}

/** Which providers this deployment has credentials for; unconfigured ones are hidden. */
export async function fetchOAuthProviders(): Promise<OAuthProviderStatus[]> {
  const response = await apiRequest<OAuthProviderStatus[]>('/auth/oauth/providers');
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * The URI the provider redirects back to. It is a Next route handler (Apple posts the
 * callback as a form), must be registered with the provider, and its origin must be in
 * the API's CORS_ORIGINS. The same string is sent to `/start` and `/callback`.
 */
export function oauthRedirectUri(provider: OAuthProviderName): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/auth/oauth/${provider}`;
}

/**
 * Step 1: get the provider URL. Signed in → the identity is linked to this account;
 * signed out → it signs in (or creates a guardian account).
 */
export async function startOAuth(
  provider: OAuthProviderName,
): Promise<{ success: boolean; authorizationUrl?: string; error?: string; code?: string }> {
  const query = new URLSearchParams({ redirectUri: oauthRedirectUri(provider) });
  const response = await apiRequest<{ authorizationUrl: string; state: string }>(
    `/auth/oauth/${provider}/start?${query.toString()}`,
  );
  if (response.data?.authorizationUrl) {
    return { success: true, authorizationUrl: response.data.authorizationUrl };
  }
  return { success: false, code: response.code, error: response.error || `Sign in with ${provider} is unavailable.` };
}

const OAUTH_RETURN_KEY = 'hifzoon.oauthReturn';

/** Remembers where to land after the provider round-trip (a relative path only, never a token). */
export function rememberOAuthReturnPath(path: string): void {
  try {
    sessionStorage.setItem(OAUTH_RETURN_KEY, path);
  } catch {
    /* storage unavailable: fall back to the role's portal */
  }
}

export function consumeOAuthReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(OAUTH_RETURN_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_KEY);
    return path ? getSafeRedirectUrl(path, '') || null : null;
  } catch {
    return null;
  }
}

/** Step 2: exchange the provider's `code` + our `state` for a session (refresh token → cookie). */
export async function completeOAuth(
  provider: OAuthProviderName,
  payload: { code: string; state: string },
): Promise<LoginResult> {
  // The provider round-trip reloads the page and drops the in-memory token. When the user
  // started from a signed-in page (linking), restore it from the refresh cookie so the
  // callback links to this account instead of treating it as an anonymous sign-in.
  if (!activeAccessToken) await refreshTokens();

  const response = await apiRequest<AuthTokensResponse>(
    `/auth/oauth/${provider}/callback`,
    {
      method: 'POST',
      body: JSON.stringify({ code: payload.code, state: payload.state, redirectUri: oauthRedirectUri(provider) }),
    },
    false,
  );

  if (response.data?.accessToken) {
    setAccessToken(response.data.accessToken);
    if (response.data.user) setActiveUser(response.data.user as unknown as AuthUserRecord);
    return { success: true, user: response.data.user, accessToken: response.data.accessToken };
  }

  const messages: Record<string, string> = {
    OAUTH_LINK_REQUIRED:
      'An account with this email already exists. Sign in with your password, then link this sign-in method from Account security.',
    OAUTH_ACCOUNT_LINKED: 'That account already uses this sign-in method. Sign in with the method already linked.',
    OAUTH_STATE_INVALID: 'This sign-in link has expired or was already used. Please start again.',
    OAUTH_EMAIL_UNVERIFIED: 'Your provider has not verified this email address, so it cannot be used to sign in.',
    TWO_FACTOR_REQUIRED: 'This account uses two-factor authentication. Sign in with your password and code instead.',
    NOT_IMPLEMENTED: 'This sign-in method is not set up on this site yet.',
    PROVIDER_ERROR: 'The sign-in provider rejected the request. Please try again.',
    DEPENDENCY_UNAVAILABLE: 'The sign-in provider could not be reached. Please try again shortly.',
    ACCOUNT_LOCKED: 'This account is temporarily locked. Please try again later.',
  };
  return {
    success: false,
    code: response.code,
    twoFactorRequired: response.code === 'TWO_FACTOR_REQUIRED',
    error: (response.code && messages[response.code]) || response.error || 'Sign-in could not be completed.',
  };
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
  /** Storage key from `POST /uploads/presign` (kind RECITATION_AUDIO). */
  recitationAudioKey?: string;
  /**
   * `ApplicationDocumentType` → storage key (kind APPLICATION_DOCUMENT). Any other type
   * is refused with a 400 (teachers.controller.ts `apply`).
   */
  documents?: Partial<Record<'ID' | 'CERTIFICATE' | 'REFERENCE' | 'BACKGROUND_CHECK', string>>;
}

export async function submitTeacherApplication(payload: TeacherApplicationPayload): Promise<{ success: boolean; message: string }> {
  const documents = Object.fromEntries(
    Object.entries(payload.documents ?? {}).filter(([, key]) => Boolean(key)),
  );
  const body: TeacherApplicationPayload = { ...payload };
  if (Object.keys(documents).length > 0) body.documents = documents;
  else delete body.documents;

  const response = await apiRequest('/teachers/applications', {
    method: 'POST',
    body: JSON.stringify(body),
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
  method = 'OTHER', // the API records web grants as OTHER (backend S15)
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

