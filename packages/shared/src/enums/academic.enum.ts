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
