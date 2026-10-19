// Core Domain Enums and Types for Hifzoon Platform

export enum Role {
    CHILD_STUDENT = 'CHILD_STUDENT',
    STUDENT = 'STUDENT',
    GUARDIAN = 'GUARDIAN',
    TEACHER = 'TEACHER',
    EXAMINER = 'EXAMINER',
    SUPERVISOR = 'SUPERVISOR',
    ADMIN = 'ADMIN',
    SUPER_ADMIN = 'SUPER_ADMIN',
    SAFEGUARDING_LEAD = 'SAFEGUARDING_LEAD',
}

export enum Currency {
    USD = 'USD',
    GBP = 'GBP',
    CAD = 'CAD',
    AUD = 'AUD',
    AED = 'AED',
    PKR = 'PKR',
}

export enum CourseType {
    QAIDA = 'QAIDA',
    NAZRA = 'NAZRA',
    TAJWEED = 'TAJWEED',
    HIFZ = 'HIFZ',
    MURAJAAH = 'MURAJAAH',
    IJAZAH = 'IJAZAH',
    ARABIC = 'ARABIC',
    TAFSIR = 'TAFSIR',
    ISLAMIC_STUDIES = 'ISLAMIC_STUDIES',
    NEW_MUSLIM = 'NEW_MUSLIM',
    INTENSIVE = 'INTENSIVE',
}

export enum MushafLayout {
    MADANI_15 = 'MADANI_15',
    INDOPAK_13 = 'INDOPAK_13',
    INDOPAK_16 = 'INDOPAK_16',
}

export enum MistakeType {
    LETTER_MAKHRAJ = 'LETTER_MAKHRAJ',
    VOWEL_HARAKAH = 'VOWEL_HARAKAH',
    TAJWEED_RULE = 'TAJWEED_RULE',
    SKIPPED_WORD = 'SKIPPED_WORD',
    ADDED_WORD = 'ADDED_WORD',
    STOP_WAQF = 'STOP_WAQF',
}

export enum Grade {
    EXCELLENT = 'EXCELLENT',
    GOOD = 'GOOD',
    NEEDS_WORK = 'NEEDS_WORK',
    REPEAT = 'REPEAT',
}

export enum PortionKind {
    SABAQ = 'SABAQ',
    SABQI = 'SABQI',
    MANZIL = 'MANZIL',
}

export enum PageState {
    NOT_STARTED = 'NOT_STARTED',
    IN_PROGRESS = 'IN_PROGRESS',
    FRAGILE = 'FRAGILE',
    SOLID = 'SOLID',
}

export enum LeadStatus {
    NEW = 'NEW',
    TRIAL_BOOKED = 'TRIAL_BOOKED',
    TRIAL_DONE = 'TRIAL_DONE',
    WON = 'WON',
    LOST = 'LOST',
}

export enum ConsentPurpose {
    DATA_COLLECTION = 'DATA_COLLECTION',
    CLASS_RECORDING = 'CLASS_RECORDING',
    AI_VOICE = 'AI_VOICE',
    AI_TRAINING = 'AI_TRAINING',
    MARKETING = 'MARKETING',
}

export interface CourseLevelSummary {
    id: string;
    name: string;
    position: number;
    lessonCount: number;
}

/**
 * Catalogue course. `id`, `code`, `title`, `description`, `levelCount` and `levels` come
 * from `GET /courses`; the editorial fields (tagline, duration, audience, features…) come
 * from the curated copy in `lib/data/baseline-catalog.ts` only when a course code matches,
 * and are otherwise absent rather than invented.
 */
export interface Course {
    id: string;
    code: CourseType;
    title: string;
    tagline?: string;
    description: string;
    levelCount: number;
    levels?: CourseLevelSummary[];
    durationMonths?: string;
    targetAudience?: string;
    features: string[];
    prerequisites?: string;
    category: 'Foundation' | 'Recitation' | 'Memorization' | 'Islamic Knowledge' | 'Certification';
    badge?: string;
    iconName: string;
    /** `api` = from the backend; `baseline` = offline fallback catalogue. */
    source?: 'api';
}

/**
 * Teacher card. API teachers (`GET /teachers/public`) carry only id, name, gender, photo,
 * bio, languages, subjects, age groups and the public rating average. The remaining
 * optional fields exist only on the offline baseline profiles and are never invented
 * for real teachers.
 */
export interface TeacherProfile {
    /** Teacher **profile** id (scheduling, ratings, `?teacher=` booking). */
    id: string;
    /** Account id — the key for `GET /teachers/public/:userId` and `/teachers/[userId]`. */
    userId?: string;
    name: string;
    gender: 'MALE' | 'FEMALE' | null;
    photoUrl?: string | null;
    bio?: string | null;
    languages: string[];
    specializations: string[];
    ageGroups?: string[];
    /** Public rating average, or null when the teacher has no ratings yet. */
    rating?: number | null;
    title?: string;
    videoUrl?: string;
    audioSampleUrl?: string;
    experienceYears?: number;
    studentsTaught?: number;
    reviewCount?: number;
    qualifications?: string[];
    country?: string;
    isAvailableForTrial?: boolean;
    featured?: boolean;
    source?: 'api';
}

export interface PlanPrice {
    currency: Currency;
    monthlyAmount: number;
    quarterlyAmount: number;
    classesPerWeek: number;
    classDurationMins: number;
    type: 'ONE_TO_ONE' | 'CIRCLE';
}

export interface TrialBookingRequest {
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    studentName: string;
    studentAge: number;
    courseCode: CourseType;
    preferredTeacherGender: 'MALE' | 'FEMALE' | 'ANY';
    timeZone: string;
    selectedDate: string;
    selectedSlot: string; // e.g. "14:00"
    learningGoals?: string;
    languagePreference: string;
}

// ── Auth Module Domain Types (FR-AUTH-01 to FR-AUTH-07, NFR-SEC-04) ──────────

export const AUTH_PASSWORD_MIN_LENGTH = 12;

export interface AuthUserRecord {
    id: string;
    email: string | null;
    name: string;
    language: string;
    timeZone: string;
    status: 'ACTIVE' | 'DISABLED' | 'LOCKED';
    twoFactorEnabled: boolean;
    lastActiveAt: string | null;
    roles: Role[];
}

export interface AuthTokensResponse {
    accessToken: string;
    expiresIn: number;
    refreshToken?: string;
    user: {
        id: string;
        email: string | null;
        name: string;
        roles: Role[];
        status: string;
        twoFactorEnabled: boolean;
        lastActiveAt: string | null;
    };
}

export interface RegisterRequest {
    email: string;
    password: string;
    name: string;
    phone?: string;
    timeZone?: string;
    language?: 'en' | 'ur' | 'ar' | 'fr';
    role?: Role.GUARDIAN | Role.STUDENT;
}

export interface LoginRequest {
    email: string;
    password: string;
    twoFactorCode?: string;
    deviceId?: string;
}

export interface RefreshRequest {
    refreshToken?: string;
}

export interface LogoutRequest {
    refreshToken?: string;
    allSessions?: boolean;
}

export interface UserSessionRecord {
    id: string;
    ip: string | null;
    userAgent: string | null;
    lastActiveAt: string;
    expiresAt: string;
    createdAt: string;
    staff: boolean;
}

export interface TwoFactorSetupResponse {
    otpauthUrl: string;
    secret: string;
    recoveryCodes: string[];
    required?: boolean;
    message?: string;
}

export interface TwoFactorConfirmRequest {
    code: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface ResetPasswordRequest {
    token: string;
    password: string;
}

