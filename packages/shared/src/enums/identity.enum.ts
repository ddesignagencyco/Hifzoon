/**
 * Core identity + access enums (ERD section 5).
 * TRD section 3: FE and BE both import enums from here — never duplicate them.
 */

export enum Role {
  CHILD_STUDENT = 'CHILD_STUDENT',
  STUDENT = 'STUDENT',
  GUARDIAN = 'GUARDIAN',
  TEACHER = 'TEACHER',
  EXAMINER = 'EXAMINER',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  SAFEGUARDING_LEAD = 'SAFEGUARDING_LEAD',
}

/** Roles that must hold staff 2FA (FR-AUTH-01). */
export const STAFF_ROLES: readonly Role[] = [
  Role.TEACHER,
  Role.EXAMINER,
  Role.SUPERVISOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.SAFEGUARDING_LEAD,
];

export const PERSONAL_ROLES: readonly Role[] = [Role.CHILD_STUDENT, Role.STUDENT, Role.GUARDIAN];

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  DISABLED = 'DISABLED',
}

export enum OAuthProvider {
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
}

export enum KidsCredentialType {
  PIN = 'PIN',
  PICTURE = 'PICTURE',
}

export enum ConsentPurpose {
  DATA_COLLECTION = 'DATA_COLLECTION',
  CLASS_RECORDING = 'CLASS_RECORDING',
  AI_VOICE = 'AI_VOICE',
  AI_TRAINING = 'AI_TRAINING',
  MARKETING = 'MARKETING',
}

/** Consents that are mandatory before a child may use the platform (CR-01). */
export const REQUIRED_CHILD_CONSENTS: readonly ConsentPurpose[] = [ConsentPurpose.DATA_COLLECTION];

export enum ConsentStatus {
  GRANTED = 'GRANTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum ConsentMethod {
  CARD_CHECK = 'CARD_CHECK',
  SIGNED_FORM = 'SIGNED_FORM',
  ID_CHECK = 'ID_CHECK',
  OTHER = 'OTHER',
}

export enum DataRequestType {
  EXPORT = 'EXPORT',
  DELETE = 'DELETE',
}

export enum DataRequestStatus {
  REQUESTED = 'REQUESTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}
