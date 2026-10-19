'use client';

import { useAuth } from './useAuth';
import { Role } from '@/lib/types';

/** Role flags for gating admin-operations UI (the backend still enforces every rule). */
export function useAdminRoles() {
  const { currentUser } = useAuth();
  const roles = (currentUser?.roles ?? []) as Role[];
  const has = (role: Role) => roles.includes(role);
  return {
    userId: currentUser?.id ?? null,
    roles,
    isSuperAdmin: has(Role.SUPER_ADMIN),
    /** ADMIN or SUPER_ADMIN — CRM, trials, teacher changes, schedules, profile review. */
    isStaffAdmin: has(Role.ADMIN) || has(Role.SUPER_ADMIN),
    /** Roles allowed on the hiring pipeline routes. */
    canManageHiring: has(Role.ADMIN) || has(Role.SUPER_ADMIN) || has(Role.SUPERVISOR),
    /** Roles allowed on `GET /scheduling/matching/:studentId` (TEACHER too, not relevant here). */
    canMatch: has(Role.ADMIN) || has(Role.SUPER_ADMIN) || has(Role.SUPERVISOR),
  };
}
