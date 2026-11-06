/**
 * The trial rules both booking paths obey: the office's (AdmissionsService.bookTrial) and a
 * family's own (SchedulingService.bookSlot). Kept in a file with no imports so the
 * scheduling side can read them without pulling in the admissions service and its graph.
 */

/** A trial "package" is 3 x 30-minute sessions per calendar week, not a single class. */
export const TRIAL_SESSIONS_PER_WEEK = 3;
export const CANCELLED_CLASS_STATUSES = new Set(['CANCELLED_FAMILY', 'CANCELLED_TEACHER']);
