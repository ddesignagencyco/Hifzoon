/**
 * A teacher's qualification/credential entry, stored in `TeacherProfile.qualifications`
 * (plan item #7). Teachers stage these through the profile-change flow; an admin's
 * approval of that change is what sets `verified: true`, never the teacher themself.
 */

import type { TeacherCredentialType } from '../enums/academic.enum';

export interface TeacherCredential {
  type: TeacherCredentialType;
  title: string;
  issuer: string;
  documentUrl: string;
  verified: boolean;
  verifiedById?: string;
  /** ISO date string. */
  verifiedAt?: string;
}
