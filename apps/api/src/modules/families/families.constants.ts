/**
 * Age rules for learners in a family (FR-AUTH-03, CR-01).
 *
 * Only the birth *year* is stored (data minimisation, CR-04), so every age here is
 * "current UTC year minus birth year". That over-counts by up to a year for a child
 * whose birthday has not come round yet, which is the accepted trade-off of not
 * collecting a full date of birth.
 */

/** FamiliesService.addStudent rejects a learner outside this range. */
export const LEARNER_MIN_AGE = 3;
export const LEARNER_MAX_AGE = 25;

/** CR-01 — below this age a child needs verifiable parental consent before use. */
export const PARENTAL_CONSENT_UNDER_AGE = 13;

/**
 * FR-AUTH-03 — the youngest age at which a guardian may give a child their own
 * email-and-password login. Younger children stay on the guardian's account.
 */
export const OWN_LOGIN_MIN_AGE = 13;

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getUTCFullYear() - birthYear;
}
