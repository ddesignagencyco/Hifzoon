/**
 * SRS requirement IDs referenced by the tracker. Used by the audit-log actions,
 * test names and OpenAPI descriptions so traceability stays mechanical.
 * Source: Hifzoon-TRACKER.md "SRS" column + Hifzoon-TRD.md section 19.
 */

export const SrsId = {
  // AUTH
  AUTH_01: 'FR-AUTH-01',
  AUTH_02: 'FR-AUTH-02',
  AUTH_03: 'FR-AUTH-03',
  AUTH_04: 'FR-AUTH-04',
  AUTH_05: 'FR-AUTH-05',
  AUTH_06: 'FR-AUTH-06',
  AUTH_07: 'FR-AUTH-07',

  // Compliance
  CR_01: 'CR-01',
  CR_02: 'CR-02',
  CR_04: 'CR-04',
  CR_05: 'CR-05',
  CR_06: 'CR-06',
  CR_07: 'CR-07',
  CR_08: 'CR-08',
  CR_09: 'CR-09',
  CR_10: 'CR-10',
  CR_11: 'CR-11',

  // Non-functional
  NFR_SEC_01: 'NFR-SEC-01',
  NFR_SEC_02: 'NFR-SEC-02',
  NFR_SEC_03: 'NFR-SEC-03',
  NFR_SEC_04: 'NFR-SEC-04',
  NFR_MNT_01: 'NFR-MNT-01',
  NFR_MNT_02: 'NFR-MNT-02',
  NFR_PORT_01: 'NFR-PORT-01',
  NFR_PERF_02: 'NFR-PERF-02',
  NFR_PERF_03: 'NFR-PERF-03',
  NFR_PERF_04: 'NFR-PERF-04',
  NFR_CAP_01: 'NFR-CAP-01',
  NFR_REL_01: 'NFR-REL-01',
} as const;

export type SrsIdValue = (typeof SrsId)[keyof typeof SrsId];

/**
 * Fields that must never be written to logs, traces or the audit payload (CR-07
 * contact masking, NFR-SEC-01 secret handling).
 */
export const SENSITIVE_FIELDS: readonly string[] = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'refreshToken',
  'accessToken',
  'twoFactorSecret',
  'secretHash',
  'apiKey',
  'authorization',
  'phone',
  'email',
];
