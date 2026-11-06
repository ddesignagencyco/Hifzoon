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

/**
 * Kids PIN sign-in (FR-AUTH-03). A short PIN is only acceptable because guessing is capped:
 * five wrong PINs lock that child's PIN for fifteen minutes, on top of the per-IP sign-in
 * throttle. The PIN is hashed like a password and never shown again.
 */
export const KIDS_PIN = {
  MIN_LENGTH: 4,
  MAX_LENGTH: 6,
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
} as const;

/** Why a PIN cannot be used, or null. Refuses the PINs a sibling would try first. */
export function kidsPinProblem(pin: string): string | null {
  if (!new RegExp(`^[0-9]{${KIDS_PIN.MIN_LENGTH},${KIDS_PIN.MAX_LENGTH}}$`).test(pin)) {
    return `The PIN must be ${KIDS_PIN.MIN_LENGTH} to ${KIDS_PIN.MAX_LENGTH} digits`;
  }
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  if (steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1)) {
    return 'Choose a PIN that is harder to guess than repeated or counting digits';
  }
  return null;
}
