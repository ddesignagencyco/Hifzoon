/**
 * Business constants sourced from the SRS/TRD/ERD so limits live in one place and
 * are covered by tests referencing the requirement ID.
 */

/** FR-AUTH-07 — refresh token lifetime in days, by account class. */
export const SESSION = {
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60,
  PERSONAL_REFRESH_TTL_DAYS: 30,
  STAFF_REFRESH_TTL_HOURS: 12,
  INACTIVITY_TIMEOUT_SECONDS: 30 * 60,
} as const;

/** NFR-SEC-04 — lockout policy. */
export const LOGIN_SECURITY = {
  MAX_FAILED_ATTEMPTS: 10,
  LOCKOUT_MINUTES: 15,
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_RESET_TTL_MINUTES: 30,
} as const;

/** NFR-SEC-04 — throttler defaults, tightened on auth routes. */
export const RATE_LIMITS = {
  GLOBAL_PER_MINUTE: 300,
  AUTH_LOGIN_PER_15_MIN: 10,
  AUTH_REGISTER_PER_HOUR: 5,
  PASSWORD_RESET_PER_HOUR: 3,
  TRIAL_BOOKING_PER_HOUR: 10,
} as const;

/** FR-CLS-01 — the classroom room opens this many minutes before the class starts. */
export const CLASSROOM_EARLY_OPEN_MINUTES = 10;

/** FR-CLS-10 — circle capacity. */
export const CIRCLE_MAX_STUDENTS = 8;

/** FR-REC-08 — lesson cards lock 48 hours after submission; supervisor edits are logged. */
export const LESSON_CARD_LOCK_HOURS = 48;

/** FR-CLS-12 / CR-02 — retention windows in days. */
export const RETENTION_DAYS = {
  RECORDING: 90,
  AI_AUDIO: 30,
  LEAD: 365,
  AUDIT_LOG: 365 * 3,
  DATA_REQUEST_SLA: 30,
} as const;

/** FR-SCH-04 — default cancellation notice. */
export const DEFAULT_CANCELLATION_NOTICE_HOURS = 4;

/** FR-SCH-06 / SRS 7 — max subscription pause. */
export const MAX_SUBSCRIPTION_PAUSE_DAYS = 30;

/** FR-BIL-03 — dunning schedule: retries on day 1, 3 and 7, then classes pause. */
export const DUNNING_RETRY_DAYS = [1, 3, 7] as const;

/** FR-QA-01 — default number of recordings sampled per teacher per month. */
export const QA_SAMPLING_PER_TEACHER_PER_MONTH = 2;

/** FR-REC-07 — maximum clip length in milliseconds. */
export const MAX_CLIP_LENGTH_MS = 60_000;

/** FR-REC-06 — lesson card must reach the family within 15 minutes of class end. */
export const LESSON_CARD_SHARE_SLA_MINUTES = 15;

/** NFR-PERF-02 / NFR-PERF-03 — realtime and media latency budgets in milliseconds. */
export const LATENCY_BUDGETS_MS = {
  MUSHAF_SYNC_P95: 500,
  AUDIO_P95: 400,
  AI_FEEDBACK_P95: 3000,
  RECONNECT_P95: 10_000,
} as const;

/** CR-08 — safeguarding reports must alert the lead within 15 minutes. */
export const SAFEGUARDING_ALERT_SLA_MINUTES = 15;

/** FR-ADM-04 — booking confirmation must be delivered within 1 minute. */
export const BOOKING_CONFIRMATION_SLA_SECONDS = 60;

/** CR-11 — licensed Quran content cache lifetime (Quran Foundation terms: 1 week). */
export const QURAN_CONTENT_CACHE_TTL_DAYS = 7;

/** CR-09 — training course whose completion is required before a teacher is matchable. */
export const CR09_SAFEGUARDING_TRAINING_CODE = 'SAFEGUARDING_CORE';

/** FR-TCH-02 — what "fully cleared" means, in one place. */
export const TEACHER_MATCHABILITY = {
  REQUIRED_TRAINING_CODES: [CR09_SAFEGUARDING_TRAINING_CODE],
  /** Below this many ratings a score is not shown publicly (too easy to game). */
  PUBLIC_RATING_MIN_COUNT: 5,
} as const;

/** FR-SCH-02 — timezone handling defaults. */
export const TIMEZONE = {
  /** Times are stored UTC and rendered in the viewer's zone (FR-SCH-01). */
  STORAGE: 'UTC',
  /** Times come back rendered in this zone when the caller does not say. */
  DEFAULT_DISPLAY: 'UTC',
} as const;

/** TRD section 4.3 — recurring sessions are materialised this far ahead. */
export const SCHEDULE_MATERIALISE_DAYS = 60;

/** TRD section 4.3 — DST clash detection lead time in days. */
export const DST_WARNING_LEAD_DAYS = 14;

/** TRD section 8 — recording can only start when every enrolled student has consent. */
export const RECORDING_REQUIRES_CONSENT = true;
