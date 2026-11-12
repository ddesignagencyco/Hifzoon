'use client';

import React from 'react';
import { Card, CardBody, EmptyState, PageHeader, QueryState, Alert, Badge, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePermissionMatrix, useSetPermission } from '@/hooks/useOpsAdmin';
import { StaffRole } from '@/lib/api/modules/permissions-admin';
import { useAdminRoles } from '../system/shared';

const ROLES: StaffRole[] = ['ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD', 'EXAMINER', 'SUPER_ADMIN'];

/** Super-admin grid of permission × role; changed cells are marked against the default. */
export function PermissionsMatrix() {
  const { isSuperAdmin } = useAdminRoles();
  const query = usePermissionMatrix();
  const set = useSetPermission();
  const toast = useToast();

  return (
    <>
      <PageHeader eyebrow="Academy admin" title="Role permissions" description="Choose which staff roles may use each action. Super admin is always on." />
      {!isSuperAdmin ? (
        <Card><EmptyState title="Super admin only" /></Card>
      ) : (
        <>
          <Alert tone="neutral">Only the actions listed here are controlled by this grid; other screens still use fixed roles. Changes apply immediately and are audited.</Alert>
          <div className="mt-4">
            <QueryState query={query} isEmpty={(d) => d.permissions.length === 0}>
              {(m) => (
                <Card><CardBody>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted">
                          <th className="py-2 pr-3">Permission</th>
                          {ROLES.map((r) => <th key={r} className="py-2 px-2 text-center">{humanize(r)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {m.permissions.map((p) => (
                          <tr key={p.key} className="border-t border-line">
                            <td className="py-2 pr-3"><span className="font-medium text-ink">{p.label ?? p.key}</span><span className="block text-[11px] text-muted">{p.key}</span></td>
                            {ROLES.map((role) => {
                              const g = p.grants[role];
                              if (!g) return <td key={role} />;
                              return (
                                <td key={role} className="py-2 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`${p.label ?? p.key} for ${humanize(role)}`}
                                    checked={g.granted}
                                    disabled={g.locked || set.isPending}
                                    onChange={(e) =>
                                      set.mutate({ role, permission: p.key, granted: e.target.checked }, {
                                        onSuccess: () => toast.success('Permission updated'),
                                        onError: (err) => toast.error(err),
                                      })
                                    }
                                  />
                                  {!g.isDefault && <Badge tone="gold">changed</Badge>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody></Card>
              )}
            </QueryState>
          </div>
        </>
      )}
    </>
  );
}
