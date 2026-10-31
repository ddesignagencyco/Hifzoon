import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { redact } from '../../common/filters/all-exceptions.filter';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  requestId?: string;
}

/**
 * Append-only audit trail (FR-OPS-06, ERD section 2.12).
 *
 * Three properties make this useful rather than decorative:
 *
 *   1. **It cannot be edited.** A trigger in the migration rejects UPDATE and DELETE on
 *      `audit_log`, so an administrator with database access still cannot quietly
 *      remove a record of what they did.
 *   2. **It records before *and* after.** A log that only records the new value cannot
 *      answer "what did this person change?", which is the only question anyone ever
 *      asks of an audit trail.
 *   3. **It never records a secret.** Every payload goes through `redact()`, which
 *      strips the fields in `SENSITIVE_FIELDS` (CR-07). An audit row containing a
 *      password hash or a phone number would itself become the breach.
 *
 * Writes never throw: losing an audit row is bad, but failing the user's actual
 * request because the audit insert hit a constraint is worse. Failures are logged at
 * error level and surfaced by the health check.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private failures = 0;

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          before: entry.before === undefined ? undefined : (redact(entry.before) as never),
          after: entry.after === undefined ? undefined : (redact(entry.after) as never),
          ip: entry.ip ?? null,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (error) {
      this.failures += 1;
      this.logger.error(
        `Failed to write audit entry ${entry.action} on ${entry.targetType ?? '-'}/${entry.targetId ?? '-'}: ${
          (error as Error).message
        }`,
      );
    }
  }

  /**
   * Diffs two versions of a record into a compact before/after pair.
   *
   * Only the keys that actually changed are kept: an audit row holding two full
   * 40-column objects is unreadable, and the unchanged columns are noise.
   */
  static diff(
    before: unknown,
    after: unknown,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const b = (before ?? {}) as Record<string, unknown>;
    const a = (after ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);

    const beforeOut: Record<string, unknown> = {};
    const afterOut: Record<string, unknown> = {};

    for (const key of keys) {
      if (JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
      if (key in b) beforeOut[key] = b[key];
      if (key in a) afterOut[key] = a[key];
    }

    return { before: beforeOut, after: afterOut };
  }

  /** Read side for the audit viewer (OPS-FE-06). */
  async list(filter: {
    actorId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  }) {
    const where = {
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action
        ? { action: { contains: filter.action, mode: 'insensitive' as const } }
        : {}),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.from || filter.to
        ? {
            at: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          actorId: true,
          action: true,
          targetType: true,
          targetId: true,
          before: true,
          after: true,
          ip: true,
          requestId: true,
          at: true,
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { at: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, failedWrites: this.failures };
  }

  /** People who appear as actors, and the kinds of record acted on, for the filter dropdowns. */
  async facets() {
    const [actors, targetTypes] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['actorId'],
        where: { actorId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { actorId: 'desc' } },
        take: 200,
      }),
      this.prisma.auditLog.groupBy({
        by: ['targetType'],
        where: { targetType: { not: null } },
        orderBy: { targetType: 'asc' },
      }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: actors.map((a) => a.actorId as string) } },
      select: { id: true, name: true, email: true },
    });
    return {
      actors: users.sort((a, b) => a.name.localeCompare(b.name)),
      targetTypes: targetTypes.map((t) => t.targetType as string),
    };
  }
}
