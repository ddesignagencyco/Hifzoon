/**
 * Academic + scheduling + classroom enums (ERD sections 2.4, 2.5, 2.6).
 */

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
  DUAS = 'DUAS',
}

export enum EnrolmentStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum AssessmentType {
  LEVEL = 'LEVEL',
  MILESTONE_JUZ = 'MILESTONE_JUZ',
  IJAZAH = 'IJAZAH',
}

export enum AssessmentResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  PENDING = 'PENDING',
}

export enum TeacherHiringStatus {
  SUBMITTED = 'SUBMITTED',
  RECITATION_REVIEW = 'RECITATION_REVIEW',
  DEMO_CLASS = 'DEMO_CLASS',
  ID_CHECK = 'ID_CHECK',
  REFERENCE_CHECK = 'REFERENCE_CHECK',
  TRAINING = 'TRAINING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** FR-TCH-01 — the ordered hiring pipeline. */
export const HIRING_PIPELINE: readonly TeacherHiringStatus[] = [
  TeacherHiringStatus.SUBMITTED,
  TeacherHiringStatus.RECITATION_REVIEW,
  TeacherHiringStatus.DEMO_CLASS,
  TeacherHiringStatus.ID_CHECK,
  TeacherHiringStatus.REFERENCE_CHECK,
  TeacherHiringStatus.TRAINING,
  TeacherHiringStatus.APPROVED,
];

export enum ApplicationDocumentType {
  ID = 'ID',
  CERTIFICATE = 'CERTIFICATE',
  REFERENCE = 'REFERENCE',
  BACKGROUND_CHECK = 'BACKGROUND_CHECK',
  TRAINING_CERTIFICATE = 'TRAINING_CERTIFICATE',
}

/** A teacher's post-hire credential: a certificate, an association membership, or other proof of qualification. */
export enum TeacherCredentialType {
  CERTIFICATE = 'CERTIFICATE',
  ASSOCIATION = 'ASSOCIATION',
  OTHER = 'OTHER',
}

export enum TrainingStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ClassType {
  TRIAL = 'TRIAL',
  REGULAR = 'REGULAR',
  CIRCLE = 'CIRCLE',
  EXAM = 'EXAM',
  MAKEUP = 'MAKEUP',
}

export enum ClassStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED_FAMILY = 'CANCELLED_FAMILY',
  CANCELLED_TEACHER = 'CANCELLED_TEACHER',
  NO_SHOW_STUDENT = 'NO_SHOW_STUDENT',
  NO_SHOW_TEACHER = 'NO_SHOW_TEACHER',
}

/** Statuses that occupy the teacher calendar for the no-double-booking constraint (FR-SCH-07). */
export const BLOCKING_CLASS_STATUSES: readonly ClassStatus[] = [
  ClassStatus.SCHEDULED,
  ClassStatus.LIVE,
  ClassStatus.COMPLETED,
];

export enum ParticipantRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  GUARDIAN_VIEWER = 'GUARDIAN_VIEWER',
  SUPERVISOR = 'SUPERVISOR',
}

export enum RoomType {
  ONE_TO_ONE = 'ONE_TO_ONE',
  CIRCLE = 'CIRCLE',
}

export enum MushafLayout {
  MADANI_15 = 'MADANI_15',
  INDOPAK_13 = 'INDOPAK_13',
  INDOPAK_16 = 'INDOPAK_16',
}

/** FR-CLS-15 — circles default to women-only until the rule is confirmed (ERD open question 1). */
export enum SubstituteOfferStatus {
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum MakeupCreditStatus {
  AVAILABLE = 'AVAILABLE',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
}

export enum AcademyHolidayType {
  HOLIDAY = 'HOLIDAY',
  RAMADAN_TIMETABLE = 'RAMADAN_TIMETABLE',
}

export enum RecordingMarkerKind {
  PAGE_TURN = 'PAGE_TURN',
  HIGHLIGHT = 'HIGHLIGHT',
  MISTAKE = 'MISTAKE',
}

// ─────────────────────────────────────────────────────────────────────────────
// Hiring interviews (INT) — a live session between an academy interviewer
// (Qari shb) and a teaching applicant, sitting inside the hiring pipeline.
// ─────────────────────────────────────────────────────────────────────────────

export enum InterviewStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW_APPLICANT = 'NO_SHOW_APPLICANT',
  NO_SHOW_INTERVIEWER = 'NO_SHOW_INTERVIEWER',
}

/** Statuses that still occupy the interviewer's calendar (no double-booking). */
export const BLOCKING_INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.LIVE,
];

/** An interview is over once it reaches one of these; it can no longer be joined. */
export const CLOSED_INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  InterviewStatus.COMPLETED,
  InterviewStatus.CANCELLED,
  InterviewStatus.NO_SHOW_APPLICANT,
  InterviewStatus.NO_SHOW_INTERVIEWER,
];

/**
 * The interviewer's verdict. Deliberately separate from the hiring step: recording
 * the step stays a manual admin action, so a verdict here never moves an applicant
 * through the pipeline on its own.
 */
export enum InterviewOutcome {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

export enum InterviewParticipantRole {
  /** Qari shb, or whoever is running the interview. */
  INTERVIEWER = 'INTERVIEWER',
  /** The applicant, who normally has no Hifzoon account yet. */
  APPLICANT = 'APPLICANT',
  /** Another staff member sitting in. */
  OBSERVER = 'OBSERVER',
}

/** The rubric Qari shb scores an applicant against, 1–5 each. */
export const INTERVIEW_SCORE_FIELDS = [
  'recitationScore',
  'tajweedScore',
  'memorisationScore',
  'teachingScore',
  'communicationScore',
] as const;

export type InterviewScoreField = (typeof INTERVIEW_SCORE_FIELDS)[number];

export const INTERVIEW_SCORE_MIN = 1;
export const INTERVIEW_SCORE_MAX = 5;
