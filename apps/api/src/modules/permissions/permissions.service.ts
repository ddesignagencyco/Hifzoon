import { Injectable } from '@nestjs/common';
import { Role } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CONFIGURABLE_ROLES, isPermissionKey, PERMISSIONS } from './permissions.catalog';

const CACHE_MS = 10_000;

@Injectable()
export class PermissionsService {
  private overrides: Map<string, boolean> | null = null;
  private loadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** True when any of the roles holds the permission. SUPER_ADMIN always does. */
  async can(roles: readonly string[], permission: string): Promise<boolean> {
    if (roles.includes(Role.SUPER_ADMIN)) return true;
    const def = PERMISSIONS.find((p) => p.key === permission);
    if (!def) return false; // an unknown key never grants anything
    const overrides = await this.loadOverrides();
    return roles.some((role) => {
      const override = overrides.get(`${role}|${permission}`);
      return override ?? def.defaultRoles.includes(role as Role);
    });
  }

  /** Every permission the caller holds, for the UI to show or hide controls. */
  async effectiveFor(roles: readonly string[]): Promise<string[]> {
    const out: string[] = [];
    for (const p of PERMISSIONS) if (await this.can(roles, p.key)) out.push(p.key);
    return out;
  }

  /** The whole matrix: each permission with, per configurable role, the effective value. */
  async matrix() {
    const overrides = await this.loadOverrides(true);
    return {
      roles: [...CONFIGURABLE_ROLES, Role.SUPER_ADMIN],
      permissions: PERMISSIONS.map((p) => ({
        key: p.key,
        group: p.group,
        label: p.label,
        grants: Object.fromEntries([
          ...CONFIGURABLE_ROLES.map((role) => {
            const override = overrides.get(`${role}|${p.key}`);
            return [
              role,
              {
                granted: override ?? p.defaultRoles.includes(role),
                isDefault: override === undefined,
                default: p.defaultRoles.includes(role),
              },
            ];
          }),
          [Role.SUPER_ADMIN, { granted: true, isDefault: true, default: true, locked: true }],
        ]),
      })),
    };
  }

  async set(input: { role: string; permission: string; granted: boolean }, actorId: string) {
    if (!isPermissionKey(input.permission)) {
      throw AppError.badRequest('Unknown permission', { permission: input.permission });
    }
    if (!(CONFIGURABLE_ROLES as readonly string[]).includes(input.role)) {
      throw AppError.badRequest(
        `Only ${CONFIGURABLE_ROLES.join(', ')} can be configured; super admin always has every permission`,
      );
    }
    const def = PERMISSIONS.find((p) => p.key === input.permission)!;
    const role = input.role as Role;
    const before = await this.can([role], input.permission);

    // Setting it back to the default removes the override, so the table holds only changes.
    if (input.granted === def.defaultRoles.includes(role)) {
      await this.prisma.permissionOverride.deleteMany({
        where: { role: role as never, permission: input.permission },
      });
    } else {
      await this.prisma.permissionOverride.upsert({
        where: { role_permission: { role: role as never, permission: input.permission } },
        create: {
          role: role as never,
          permission: input.permission,
          granted: input.granted,
          updatedBy: actorId,
        },
        update: { granted: input.granted, updatedBy: actorId },
      });
    }
    this.overrides = null;

    await this.audit.record({
      actorId,
      action: 'ops.permission.set',
      targetType: 'role_permission',
      targetId: `${role}:${input.permission}`,
      before: { granted: before },
      after: { granted: input.granted },
    });
    return { role, permission: input.permission, granted: input.granted };
  }

  private async loadOverrides(force = false): Promise<Map<string, boolean>> {
    if (!force && this.overrides && Date.now() - this.loadedAt < CACHE_MS) return this.overrides;
    const rows = await this.prisma.permissionOverride.findMany();
    this.overrides = new Map(rows.map((r) => [`${r.role}|${r.permission}`, r.granted]));
    this.loadedAt = Date.now();
    return this.overrides;
  }
}
