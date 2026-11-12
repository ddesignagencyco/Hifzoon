import { http } from '../http';

export type StaffRole = 'ADMIN' | 'SUPERVISOR' | 'SAFEGUARDING_LEAD' | 'EXAMINER' | 'SUPER_ADMIN';

export interface PermissionGrant {
  granted: boolean;
  isDefault: boolean;
  default: boolean;
  locked?: boolean;
}

/** `GET /admin/permissions` */
export interface PermissionMatrix {
  roles?: StaffRole[];
  permissions: Array<{
    key: string;
    label?: string;
    group?: string;
    grants: Record<StaffRole, PermissionGrant>;
  }>;
}

export const permissionsApi = {
  matrix: () => http.get<PermissionMatrix>('/admin/permissions'),
  set: (body: { role: StaffRole; permission: string; granted: boolean }) =>
    http.put<unknown>('/admin/permissions', body),
  /** The caller's effective permission keys. */
  mine: () => http.get<{ permissions: string[] }>('/admin/permissions/mine'),
};
