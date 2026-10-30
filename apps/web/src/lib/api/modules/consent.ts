import { http } from '../http';

/**
 * Parental consent ledger, guardian verification and data requests
 * (apps/api/src/modules/consent — FR-AUTH-04/05, CR-01, CR-05, CR-06, CR-10).
 */

export type ConsentPurpose = 'DATA_COLLECTION' | 'CLASS_RECORDING' | 'AI_VOICE' | 'AI_TRAINING' | 'MARKETING';
export type ConsentStatus = 'GRANTED' | 'WITHDRAWN';
export type ConsentMethod = 'CARD_CHECK' | 'SIGNED_FORM' | 'ID_CHECK' | 'OTHER';
export type DataRequestType = 'EXPORT' | 'DELETE';
export type DataRequestStatus = 'REQUESTED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

/** Order and copy shown to guardians. AI_TRAINING is a separate, specific opt-in (CR-06). */
export const CONSENT_PURPOSES: Array<{
  purpose: ConsentPurpose;
  label: string;
  description: string;
  required?: boolean;
}> = [
  {
    purpose: 'DATA_COLLECTION',
    label: 'Lesson records',
    description:
      'Store the information needed to teach your child: lesson cards, progress and attendance. Required before any class can be booked.',
    required: true,
  },
  {
    purpose: 'CLASS_RECORDING',
    label: 'Class recordings',
    description: 'Record live classes for quality and safeguarding review. Withdrawing stops future recordings.',
  },
  {
    purpose: 'AI_VOICE',
    label: 'AI recitation feedback',
    description: 'Let the practice tools listen to recitation to suggest corrections. Practice audio is deleted when withdrawn.',
  },
  {
    purpose: 'AI_TRAINING',
    label: 'Improving AI models',
    description: 'Allow anonymised practice audio to help improve recitation models. Entirely optional and independent of classes.',
  },
  {
    purpose: 'MARKETING',
    label: 'News and offers',
    description: 'Occasional academy news and offers about your child’s learning.',
  },
];


/**
 * How the consent was captured. An in-portal tick-box is not a card/ID check, so it
 * is recorded honestly as OTHER.
 */
export const PORTAL_CONSENT_METHOD: ConsentMethod = 'OTHER';

/** `GET /consent/students/:studentId` (getForStudent). */
export interface StudentConsentState {
  studentId: string;
  purposes: Array<{
    purpose: ConsentPurpose;
    status: ConsentStatus;
    grantedAt: string | null;
    withdrawnAt: string | null;
    policyVersion: string | null;
  }>;
}

/** Raw `consent` row returned by grant/withdraw and inside the privacy summary. */
export interface ConsentRecord {
  id: string;
  familyId: string;
  studentId: string | null;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  method: ConsentMethod;
  policyVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
  grantedByUserId: string;
  ip: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentEvent {
  id: string;
  consentId: string;
  fromStatus: ConsentStatus;
  toStatus: ConsentStatus;
  actorId: string;
  reason: string | null;
  createdAt: string;
}

export interface GrantConsentInput {
  purposes: ConsentPurpose[];
  method?: ConsentMethod;
  policyVersion?: string;
}

export interface WithdrawConsentInput {
  purposes: ConsentPurpose[];
  reason?: string;
}

export interface VerificationChallenge {
  challengeId: string;
  expiresInSeconds: number;
}

/** `GET /consent/families/:familyId/data-requests` (listDataRequests select). */
export interface DataRequestRecord {
  id: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requestedAt: string;
  dueAt: string;
  completedAt: string | null;
  fileUrl: string | null;
}

/** `POST /consent/families/:familyId/data-requests`. */
export interface CreatedDataRequest {
  id: string;
  type: DataRequestType;
  status: DataRequestStatus;
  dueAt: string;
}

/** `GET /consent/families/:familyId/privacy-summary`. */
export interface PrivacySummary {
  familyId: string;
  students: Array<{ id: string; displayName: string; birthYear: number }>;
  consents: Array<ConsentRecord & { events: ConsentEvent[] }>;
  requests: Array<DataRequestRecord & { familyId: string; studentId: string | null }>;
  openCases: number;
  generatedAt: string;
  exportAvailable: boolean;
}

const enc = encodeURIComponent;

export const consentApi = {
  /** Privacy notice version a guardian accepts now (M9). Signed-in only. */
  policyVersion: () => http.get<{ version: string }>('/consent/policy-version'),
  forStudent: (studentId: string) => http.get<StudentConsentState>(`/consent/students/${enc(studentId)}`),
  grant: (studentId: string, input: GrantConsentInput) =>
    http.post<ConsentRecord[]>(`/consent/students/${enc(studentId)}/grant`, {
      purposes: input.purposes,
      method: input.method ?? PORTAL_CONSENT_METHOD,
      // Omitted, the API records the current notice version itself.
      ...(input.policyVersion ? { policyVersion: input.policyVersion } : {}),
    }),
  withdraw: (studentId: string, input: WithdrawConsentInput) =>
    http.post<ConsentRecord[]>(`/consent/students/${enc(studentId)}/withdraw`, {
      purposes: input.purposes,
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    }),
  startVerification: (familyId: string) =>
    http.post<VerificationChallenge>(`/consent/families/${enc(familyId)}/verify/start`),
  confirmVerification: (familyId: string, code: string) =>
    http.post<{ verifiedAt: string }>(`/consent/families/${enc(familyId)}/verify/confirm`, { code: code.trim() }),
  createDataRequest: (familyId: string, input: { type: DataRequestType; studentId?: string }) =>
    http.post<CreatedDataRequest>(`/consent/families/${enc(familyId)}/data-requests`, {
      type: input.type,
      ...(input.studentId ? { studentId: input.studentId } : {}),
    }),
  listDataRequests: (familyId: string) =>
    http.get<DataRequestRecord[]>(`/consent/families/${enc(familyId)}/data-requests`),
  privacySummary: (familyId: string) =>
    http.get<PrivacySummary>(`/consent/families/${enc(familyId)}/privacy-summary`),
};

export function consentLabel(purpose: string): string {
  return CONSENT_PURPOSES.find((p) => p.purpose === purpose)?.label ?? purpose;
}

/** True when the student can be booked into classes (CR-01). */
export function hasRequiredConsent(state: StudentConsentState | undefined): boolean {
  if (!state) return false;
  return state.purposes.some((p) => p.purpose === 'DATA_COLLECTION' && p.status === 'GRANTED');
}

/** GuardianVerifyDto allows up to 16 chars; the service issues 6-digit codes. */
export function validateVerificationCode(code: string): string | null {
  const v = code.trim();
  if (!v) return 'Enter the code from the email.';
  if (v.length > 16) return 'That code is too long.';
  if (!/^\d{6}$/.test(v)) return 'The code is the 6 digits from the email.';
  return null;
}
