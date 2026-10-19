import { http } from '../http';

/**
 * Family accounts, guardians and children (apps/api/src/modules/families).
 * Types mirror `FamiliesService` selects and the class-validator DTOs exactly.
 */

export type Currency = 'USD' | 'GBP' | 'CAD' | 'AUD' | 'AED' | 'PKR';
export const CURRENCIES: Currency[] = ['USD', 'GBP', 'CAD', 'AUD', 'AED', 'PKR'];

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];

/** Row from `GET /families` (listForUser) — `members` holds only the caller's membership. */
export interface FamilySummary {
  id: string;
  name: string;
  country: string | null;
  currency: Currency;
  createdAt: string;
  members: Array<{ isPrimary: boolean; verifiedAt: string | null; relationship: string }>;
}

export interface FamilyMember {
  id: string;
  relationship: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface FamilyStudentSummary {
  id: string;
  displayName: string;
  birthYear: number;
  gender: Gender;
  language: string;
  timeZone: string;
  kidsMode: boolean;
}

/** `GET /families/:familyId` (getFamily). */
export interface FamilyDetail {
  id: string;
  name: string;
  country: string | null;
  currency: Currency;
  billingName: string | null;
  timeZone: string;
  createdAt: string;
  members: FamilyMember[];
  students: FamilyStudentSummary[];
}

/** Raw `family` row returned by `POST /families` and `PATCH /families/:id`. */
export interface FamilyRecord {
  id: string;
  name: string;
  country: string | null;
  currency: Currency;
  billingName: string | null;
  timeZone: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateFamilyInput {
  name: string;
  country?: string;
  currency?: Currency;
  billingName?: string;
  timeZone?: string;
}

export type UpdateFamilyInput = Partial<CreateFamilyInput>;

export interface AddGuardianInput {
  email: string;
  relationship: string;
}

export interface AddGuardianResult {
  userId: string;
  email: string;
  verified: boolean;
  needsPasswordSetup: boolean;
}

/** `GET /families/:familyId/students` (listStudents). */
export interface FamilyStudent extends FamilyStudentSummary {
  userId: string | null;
  createdAt: string;
}

export interface AddStudentInput {
  displayName: string;
  birthYear: number;
  gender: Gender;
  language?: string;
  timeZone?: string;
  kidsMode?: boolean;
  notes?: string;
}

/** `POST /families/:familyId/students` — the student row plus the CR-01 hint. */
export interface AddStudentResult extends FamilyStudentSummary {
  familyId: string;
  notes: string | null;
  requiresConsent: boolean;
  nextStep: 'GRANT_DATA_COLLECTION_CONSENT' | null;
}

export type UpdateStudentInput = Partial<AddStudentInput>;

/** `PATCH /families/students/:studentId` (updateStudent select). */
export interface UpdatedStudent extends FamilyStudentSummary {
  notes: string | null;
}

const enc = encodeURIComponent;

export const familiesApi = {
  list: () => http.get<FamilySummary[]>('/families'),
  create: (body: CreateFamilyInput) => http.post<FamilyRecord>('/families', body),
  get: (familyId: string) => http.get<FamilyDetail>(`/families/${enc(familyId)}`),
  update: (familyId: string, body: UpdateFamilyInput) =>
    http.patch<FamilyRecord>(`/families/${enc(familyId)}`, body),
  listGuardians: (familyId: string) => http.get<FamilyMember[]>(`/families/${enc(familyId)}/guardians`),
  addGuardian: (familyId: string, body: AddGuardianInput) =>
    http.post<AddGuardianResult>(`/families/${enc(familyId)}/guardians`, body),
  listStudents: (familyId: string) => http.get<FamilyStudent[]>(`/families/${enc(familyId)}/students`),
  addStudent: (familyId: string, body: AddStudentInput) =>
    http.post<AddStudentResult>(`/families/${enc(familyId)}/students`, body),
  updateStudent: (studentId: string, body: UpdateStudentInput) =>
    http.patch<UpdatedStudent>(`/families/students/${enc(studentId)}`, body),
};

// ── Client-side validation mirroring the DTOs ───────────────────────────────

/** Age the backend accepts for a learner (FamiliesService.addStudent: 3–25). */
export const MIN_LEARNER_AGE = 3;
export const MAX_LEARNER_AGE = 25;

export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  return now.getUTCFullYear() - birthYear;
}

export function isUnder13(birthYear: number, now = new Date()): boolean {
  return ageFromBirthYear(birthYear, now) < 13;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Validates the add/edit child form to AddStudentDto + the service's 3–25 age rule. */
export function validateStudentInput(
  input: { displayName?: string; birthYear?: number | null; gender?: string; language?: string; timeZone?: string; notes?: string },
  opts: { partial?: boolean; now?: Date } = {},
): FieldErrors<'displayName' | 'birthYear' | 'gender' | 'language' | 'timeZone' | 'notes'> {
  const errors: FieldErrors<'displayName' | 'birthYear' | 'gender' | 'language' | 'timeZone' | 'notes'> = {};
  const now = opts.now ?? new Date();
  const year = now.getUTCFullYear();
  const name = (input.displayName ?? '').trim();
  if (!opts.partial || input.displayName !== undefined) {
    if (name.length < 1) errors.displayName = 'Enter the child’s name.';
    else if (name.length > 120) errors.displayName = 'Name must be 120 characters or fewer.';
  }
  if (!opts.partial || input.birthYear !== undefined) {
    const by = input.birthYear;
    if (by === null || by === undefined || !Number.isInteger(by)) errors.birthYear = 'Enter a birth year.';
    else if (by < 1990) errors.birthYear = 'Birth year must be between 1990 and the current year.';
    else if (by > year) errors.birthYear = 'Birth year cannot be in the future.';
    else {
      const age = year - by;
      if (age < MIN_LEARNER_AGE || age > MAX_LEARNER_AGE) {
        errors.birthYear = `Learners must be aged ${MIN_LEARNER_AGE}–${MAX_LEARNER_AGE}.`;
      }
    }
  }
  if (!opts.partial || input.gender !== undefined) {
    if (!input.gender || !GENDERS.includes(input.gender as Gender)) errors.gender = 'Choose a gender.';
  }
  if (input.language && input.language.length > 5) errors.language = 'Use a language code of up to 5 characters.';
  if (input.timeZone && input.timeZone.length > 64) errors.timeZone = 'Time zone is too long.';
  if (input.notes && input.notes.length > 1000) errors.notes = 'Notes must be 1000 characters or fewer.';
  return errors;
}

/** Validates CreateFamilyDto / UpdateFamilyDto. */
export function validateFamilyInput(
  input: CreateFamilyInput,
): FieldErrors<'name' | 'country' | 'billingName' | 'timeZone' | 'currency'> {
  const errors: FieldErrors<'name' | 'country' | 'billingName' | 'timeZone' | 'currency'> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = 'Family name must be at least 2 characters.';
  else if (name.length > 160) errors.name = 'Family name must be 160 characters or fewer.';
  if (input.country && !/^[A-Za-z]{2}$/.test(input.country)) errors.country = 'Use a 2-letter country code, e.g. GB.';
  if (input.billingName && input.billingName.length > 160) errors.billingName = 'Billing name must be 160 characters or fewer.';
  if (input.timeZone && input.timeZone.length > 64) errors.timeZone = 'Time zone is too long.';
  if (input.currency && !CURRENCIES.includes(input.currency)) errors.currency = 'Choose a supported currency.';
  return errors;
}

/** Validates AddGuardianDto (plus a basic email shape, which the backend does not check). */
export function validateGuardianInput(input: AddGuardianInput): FieldErrors<'email' | 'relationship'> {
  const errors: FieldErrors<'email' | 'relationship'> = {};
  const email = input.email.trim();
  if (!email) errors.email = 'Enter an email address.';
  else if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  const rel = input.relationship.trim();
  if (!rel) errors.relationship = 'Choose a relationship.';
  else if (rel.length > 40) errors.relationship = 'Relationship must be 40 characters or fewer.';
  return errors;
}

/** The viewer's IANA zone, used as the default for new families and children. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** IANA zones offered in pickers (falls back to a short list on older engines). */
export function timeZoneOptions(current?: string): string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) {
    zones = ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Toronto', 'Asia/Dubai', 'Asia/Karachi', 'Australia/Sydney'];
  }
  const set = new Set(zones);
  if (current) set.add(current);
  set.add('UTC');
  return [...set].sort();
}

export const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ur', label: 'Urdu' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ms', label: 'Malay' },
  { value: 'id', label: 'Indonesian' },
  { value: 'bn', label: 'Bengali' },
  { value: 'so', label: 'Somali' },
];
