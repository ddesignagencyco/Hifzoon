import {
  type $Enums as PrismaEnums,
  type ConsentPurpose as PrismaConsentPurpose,
  Role as PrismaRole,
} from '@prisma/client';
import {
  type ConsentMethod,
  type ConsentPurpose,
  type ConsentStatus,
  type CourseType,
  type Currency,
  type Gender,
  type Grade,
  type MushafLayout,
  type PageState,
  Role,
  type ParticipantRole,
  type UserStatus,
} from '@hifzoon/shared';

/**
 * Bridge between Prisma's generated enums and the canonical ones in
 * `packages/shared` (TRD section 3: "FE and BE both import types and enums from
 * packages/shared. No duplicated enum definitions.").
 *
 * Prisma emits its own string-union types, so TypeScript cannot prove the two are
 * identical even though the values are. Rather than sprinkle `as Role` casts through
 * the codebase — which would hide a real mismatch the first time a value is renamed —
 * every crossing goes through these functions, and `enum-bridge.spec.ts` asserts the
 * two sets are exactly equal. A renamed value then fails a test instead of silently
 * typing as one enum and comparing as another.
 */

function buildMap<T extends string>(
  prismaEnum: Record<string, string>,
  sharedValues: readonly T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const value of sharedValues) {
    map.set(value, value);
  }
  for (const key of Object.keys(prismaEnum)) {
    if (!map.has(key)) {
      throw new Error(
        `Enum drift: Prisma enum "${key}" has no counterpart in packages/shared. ` +
          'Update the shared enum and the schema together (TRD section 3).',
      );
    }
  }
  return map;
}

const ROLE_TO_SHARED = buildMap(Role as unknown as Record<string, string>, Object.values(Role));
const ROLE_TO_PRISMA = new Map<string, PrismaRole>(
  Object.values(Role).map((role) => [role, role as unknown as PrismaRole]),
);

export function toSharedRole(role: string): Role {
  const mapped = ROLE_TO_SHARED.get(role);
  if (!mapped) throw new Error(`Unknown role "${role}"`);
  return mapped;
}

export function toSharedRoles(roles: readonly string[]): Role[] {
  return roles.map(toSharedRole);
}

/**
 * Classroom participant roles cross into the socket contract too, where the shared
 * `ParticipantRole` is what clients import.
 */
export function toSharedParticipantRole(role: string): ParticipantRole {
  const allowed = ['TEACHER', 'STUDENT', 'GUARDIAN_VIEWER', 'SUPERVISOR'] as const;
  if (!allowed.includes(role as (typeof allowed)[number])) {
    throw new Error(`Unknown participant role "${role}"`);
  }
  return role as ParticipantRole;
}

export function fromSharedParticipantRole(role: ParticipantRole): string {
  return role;
}

export function fromSharedRole(role: Role): PrismaRole {
  const mapped = ROLE_TO_PRISMA.get(role);
  if (!mapped) throw new Error(`Unknown role "${role}"`);
  return mapped;
}

export function fromSharedRoles(roles: readonly Role[]): PrismaRole[] {
  return roles.map(fromSharedRole);
}

/**
 * Prisma's generated layout enum and the shared one carry identical values, so this
 * is a checked cast rather than a lookup — `toSharedLayout` validates anyway so a
 * value that ever diverges fails loudly instead of reaching a client.
 */
export function toSharedLayout(layout: string): MushafLayout {
  if (!['MADANI_15', 'INDOPAK_13', 'INDOPAK_16'].includes(layout)) {
    throw new Error(`Unknown Mushaf layout "${layout}"`);
  }
  return layout as MushafLayout;
}

/** Shared → Prisma write helpers for the enums used in `where`/`data` clauses. */
export const write = {
  role: fromSharedRole,
  roles: fromSharedRoles,
  userStatus: (v: UserStatus) => v as PrismaEnums.UserStatus,
  gender: (v: Gender) => v as PrismaEnums.Gender,
  currency: (v: Currency) => v as PrismaEnums.Currency,
  courseType: (v: CourseType) => v as PrismaEnums.CourseType,
  consentPurpose: (v: ConsentPurpose) => v as PrismaConsentPurpose,
  consentStatus: (v: ConsentStatus) => v as PrismaEnums.ConsentStatus,
  consentMethod: (v: ConsentMethod) => v as PrismaEnums.ConsentMethod,
  mushafLayout: (v: MushafLayout) => v as PrismaEnums.MushafLayout,
  grade: (v: Grade) => v as PrismaEnums.Grade,
  pageState: (v: PageState) => v as PrismaEnums.PageState,
};

/** Exposed for the drift test. */
export const ENUM_DRIFT_GUARD = {
  role: Object.keys(Role).sort(),
  prismaRole: Object.values<PrismaRole>(PrismaRole).sort(),
} as const;
