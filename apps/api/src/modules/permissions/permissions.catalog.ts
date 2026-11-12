import { Role } from '@hifzoon/shared';

/**
 * The permissions an administrator can grant or take away per role (FR-OPS role matrix).
 *
 * Each entry has a default set of roles, so nothing changes until someone edits the matrix.
 * `SUPER_ADMIN` always holds every permission and cannot be edited out, so the matrix can
 * never lock everyone out. Only staff roles are configurable; guardians, students and
 * teachers get access through ownership rules, not through this matrix.
 */
export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  defaultRoles: Role[];
}

export const CONFIGURABLE_ROLES = [
  Role.ADMIN,
  Role.SUPERVISOR,
  Role.SAFEGUARDING_LEAD,
  Role.EXAMINER,
] as const;

const ADMINS = [Role.ADMIN, Role.SUPER_ADMIN];
const SUPER = [Role.SUPER_ADMIN];

export const PERMISSIONS: readonly PermissionDef[] = [
  {
    key: 'billing.classCredit.issue',
    group: 'Billing',
    label: 'Give a family class credits',
    defaultRoles: ADMINS,
  },
  {
    key: 'billing.classCredit.revoke',
    group: 'Billing',
    label: 'Remove a class credit',
    defaultRoles: SUPER,
  },
  {
    key: 'payroll.rates.manage',
    group: 'Payroll',
    label: 'Create, edit and assign pay rates',
    defaultRoles: SUPER,
  },
  {
    key: 'payroll.adjust',
    group: 'Payroll',
    label: 'Add manual bonuses and deductions',
    defaultRoles: SUPER,
  },
  {
    key: 'payroll.export',
    group: 'Payroll',
    label: 'Export a payroll period as CSV',
    defaultRoles: SUPER,
  },
  {
    key: 'scheduling.schedule.manage',
    group: 'Scheduling',
    label: 'Edit, pause, resume and end recurring schedules',
    defaultRoles: ADMINS,
  },
  {
    key: 'scheduling.holidays.manage',
    group: 'Scheduling',
    label: 'Manage academy holidays and the Ramadan timetable',
    defaultRoles: ADMINS,
  },
  {
    key: 'scheduling.substitute.manage',
    group: 'Scheduling',
    label: 'Offer and assign substitute teachers',
    defaultRoles: ADMINS,
  },
  {
    key: 'families.edit',
    group: 'Operations',
    label: 'Edit family and student details',
    defaultRoles: ADMINS,
  },
  {
    key: 'families.view',
    group: 'Operations',
    label: 'View family and student details',
    defaultRoles: ADMINS,
  },
  {
    key: 'analytics.view',
    group: 'Operations',
    label: 'View the analytics dashboard',
    defaultRoles: ADMINS,
  },
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export function isPermissionKey(key: string): boolean {
  return PERMISSION_KEYS.includes(key);
}
