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

export interface Course {
    id: string;
    code: CourseType;
    title: string;
    tagline: string;
    description: string;
    levelCount: number;
    durationMonths: string;
    targetAudience: string;
    features: string[];
    prerequisites: string;
    category: 'Foundation' | 'Recitation' | 'Memorization' | 'Islamic Knowledge' | 'Certification';
    badge?: string;
    iconName: string;
}

export interface TeacherProfile {
    id: string;
    name: string;
    title: string;
    gender: 'MALE' | 'FEMALE';
    photoUrl: string;
    videoUrl?: string;
    audioSampleUrl?: string;
    experienceYears: number;
    studentsTaught: number;
    rating: number;
    reviewCount: number;
    languages: string[];
    qualifications: string[];
    specializations: string[];
    bio: string;
    country: string;
    isAvailableForTrial: boolean;
    featured?: boolean;
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
