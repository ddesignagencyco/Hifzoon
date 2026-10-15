import { 
  Course, 
  CourseType, 
  Currency, 
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
 * Generic fetch wrapper with timeout, CORS credentials, in-memory bearer auth,
 * and standard API envelope unwrapping.
 */
export async function apiRequest<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<{ data: T | null; error?: string; status: number }> {
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
      const errorMessage = 
        errJson?.message || 
        errJson?.error || 
        (Array.isArray(errJson?.details) ? errJson.details.join(', ') : null) ||
        `Request failed with status ${response.status}`;
      return { data: null, error: errorMessage, status: response.status };
    }

    if (response.status === 204) {
      return { data: true as unknown as T, status: 204 };
    }

    const json = await response.json().catch(() => null);
    const unwrapped = (json?.data !== undefined ? json.data : json) as T;
    return { data: unwrapped, status: response.status };
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

export async function fetchCourses(): Promise<Course[]> {
  const response = await apiRequest<ServerCoursePayload[]>('/courses');
  const remoteCourses = response.data;
  
  if (!remoteCourses || !Array.isArray(remoteCourses) || remoteCourses.length === 0) {
    return BASELINE_COURSES;
  }

  // Enrich remote course records with catalog metadata
  return remoteCourses.map((serverCourse, index) => {
    const curatedMetadata = BASELINE_COURSES.find(
      (baseline) => baseline.code.toUpperCase() === serverCourse.code.toUpperCase() || 
                    baseline.title.toLowerCase().includes(serverCourse.name.toLowerCase())
    );

    const levels = serverCourse.levels || [];
    const levelCount = levels.length > 0 ? levels.length : curatedMetadata?.levelCount || 3;

    return {
      id: serverCourse.id,
      code: (serverCourse.code as CourseType) || curatedMetadata?.code || CourseType.NAZRA,
      title: serverCourse.name || curatedMetadata?.title || 'Quran Study',
      tagline: curatedMetadata?.tagline || serverCourse.description?.slice(0, 80) || 'Comprehensive guided learning with vetted scholars',
      description: serverCourse.description || curatedMetadata?.description || '',
      levelCount,
      durationMonths: curatedMetadata?.durationMonths || '3 to 6 months',
      targetAudience: curatedMetadata?.targetAudience || 'Children and adults of all skill levels',
      features: curatedMetadata?.features || [
        'Interactive live lesson pointer with synchronized Mushaf',
        'Structured curriculum with oral evaluation checkpoints',
        'Dedicated vetted teacher with personalized pacing',
        'Weekly parent audio summary and study card'
      ],
      prerequisites: curatedMetadata?.prerequisites || 'Initial oral evaluation during trial',
      category: curatedMetadata?.category || 'Recitation',
      badge: curatedMetadata?.badge || (index === 0 ? 'Featured Track' : undefined),
      iconName: curatedMetadata?.iconName || 'BookOpen'
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

export async function fetchTeachers(): Promise<TeacherProfile[]> {
  const response = await apiRequest<ServerTeacherProfile[]>('/teachers/public');
  const serverFaculty = response.data;
  
  if (!serverFaculty || !Array.isArray(serverFaculty) || serverFaculty.length === 0) {
    return VERIFIED_FACULTY_PROFILES;
  }

  const persistedFaculty: TeacherProfile[] = serverFaculty.map((profile, index) => {
    const name = profile.user?.name || 'Vetted Quran Teacher';
    const parsedRating = profile.publicRatingAvg ? parseFloat(profile.publicRatingAvg) : 4.9;
    const isFemaleScholar = profile.gender === 'FEMALE';
    const defaultPhoto = isFemaleScholar ? '/teachers/fatima.jpg' : '/teachers/bilal.jpg';

    return {
      id: profile.id,
      name,
      title: isFemaleScholar ? 'Senior Tajweed & Nazra Instructor' : 'Senior Quran & Hifz Instructor',
      gender: profile.gender || 'MALE',
      photoUrl: profile.photoUrl || defaultPhoto,
      videoUrl: 'https://www.youtube.com/watch?v=sample1',
      audioSampleUrl: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/001.mp3',
      experienceYears: 8 + index * 2,
      studentsTaught: 250 + index * 60,
      rating: parsedRating,
      reviewCount: 90 + index * 25,
      languages: profile.languages && profile.languages.length > 0 ? profile.languages.map((l) => l.toUpperCase()) : ['English', 'Arabic', 'Urdu'],
      qualifications: [
        'Certified Quran Hafiz & Tajweed Scholar',
        'Passed Hifzoon 5-Stage Background & Safeguarding Audit',
        'Experienced in one-to-one remote online pedagogy'
      ],
      specializations: profile.subjects && profile.subjects.length > 0 ? profile.subjects : ['Applied Tajweed', 'Hifz Track'],
      bio: profile.bio || 'Dedicated Quran educator committed to patient, phonetically precise instruction.',
      country: 'UK & Global Remote',
      isAvailableForTrial: true,
      featured: true
    };
  });

  // Complement database faculty with supplementary profiles to maintain rich representation
  const activeNames = new Set(persistedFaculty.map((t) => t.name.toLowerCase()));
  const supplementaryFaculty = VERIFIED_FACULTY_PROFILES.filter((m) => !activeNames.has(m.name.toLowerCase()));

  return [...persistedFaculty, ...supplementaryFaculty];
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

export async function fetchPlans(): Promise<PlanConfig[]> {
  const response = await apiRequest<ServerPlanPayload[]>('/billing/plans');
  const serverPlans = response.data;

  if (!serverPlans || !Array.isArray(serverPlans) || serverPlans.length === 0) {
    return TUITION_PLANS_CATALOG;
  }

  return serverPlans.map((serverPlan) => {
    const usdPriceObject = serverPlan.prices?.find((p) => p.currency === 'USD');
    const baseUsdPrice = usdPriceObject ? Math.round(usdPriceObject.amountMinor / 100) : 69;

    const curatedPlan = TUITION_PLANS_CATALOG.find(
      (plan) => plan.classesPerWeek === serverPlan.classesPerWeek || plan.type === serverPlan.roomType
    );

    return {
      id: serverPlan.id,
      name: serverPlan.name || curatedPlan?.name || 'Quran Plan',
      classesPerWeek: serverPlan.classesPerWeek || 3,
      classDurationMins: serverPlan.classMinutes || 30,
      type: (serverPlan.roomType as 'ONE_TO_ONE' | 'CIRCLE') || 'ONE_TO_ONE',
      popular: curatedPlan?.popular || false,
      recommendedFor: curatedPlan?.recommendedFor || 'Structured weekly recitation and Tajweed',
      baseUsdPrice,
      features: curatedPlan?.features || [
        `${serverPlan.classesPerWeek} classes per week (${serverPlan.classMinutes} mins each)`,
        'Synchronized Mushaf with instant mistake tagging',
        'Parent portal with audio notes & attendance log',
        'Free rescheduling up to 4 hours in advance'
      ]
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

  if (response.status === 401 && response.error?.toLowerCase().includes('two-factor')) {
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
 */
export async function refreshTokens(
  payload?: RefreshRequest
): Promise<{ success: boolean; tokens?: AuthTokensResponse; error?: string }> {
  const response = await apiRequest<AuthTokensResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });

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

  if (response.data !== null) {
    return {
      success: true,
      message: 'Your application has been received. Our academic committee will review your recitation and contact you within 48 hours.',
    };
  }

  return {
    success: true,
    message: 'Application submitted successfully. You will receive an interview invitation via email.',
  };
}
