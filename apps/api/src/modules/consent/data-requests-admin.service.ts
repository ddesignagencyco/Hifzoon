import { Injectable, Logger } from '@nestjs/common';
import { DataRequestStatus, ErrorCode } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

/** Requests still waiting on the academy; the rest are finished one way or the other. */
export const OPEN_DATA_REQUEST_STATUSES: DataRequestStatus[] = [
  DataRequestStatus.REQUESTED,
  DataRequestStatus.IN_PROGRESS,
];

/** A short, human-quotable reference; the same one the family's notices carry. */
export function dataRequestReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * The admin side of CR-05 data requests: a queue to see every family's export and deletion
 * requests against their 30-day deadline, and a way to refuse one with a reason.
 *
 * Exports and deletions themselves stay automatic (DataRequestProcessor). Refusing is the
 * only manual decision, for the cases the law allows it: a request that is not from the
 * account holder, a duplicate, or a deletion the academy must hold back (an open
 * safeguarding case, unpaid invoices kept for tax). A refusal is audited and the family
 * is told why, because a silent "no" to a statutory request is not an answer.
 */
@Injectable()
export class DataRequestsAdminService {
  private readonly logger = new Logger(DataRequestsAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    filter: {
      openOnly?: boolean;
      status?: DataRequestStatus;
      /** Family or child name. */
      q?: string;
      page?: number;
      limit?: number;
    } = {},
    now = new Date(),
  ) {
    const q = filter.q?.trim();
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), 500);
    const page = Math.max(filter.page ?? 1, 1);
    const rows = await this.prisma.dataRequest.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.openOnly ? { status: { in: OPEN_DATA_REQUEST_STATUSES } } : {}),
        ...(q
          ? {
              OR: [
                { family: { name: { contains: q, mode: 'insensitive' as const } } },
                { student: { displayName: { contains: q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        type: true,
        status: true,
        requestedAt: true,
        dueAt: true,
        completedAt: true,
        rejectionReason: true,
        family: { select: { id: true, name: true } },
        student: { select: { id: true, displayName: true } },
      },
      // Most urgent first: the queue is worked from the nearest deadline down.
      orderBy: [{ dueAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map((row) => ({
      ...row,
      reference: dataRequestReference(row.id),
      overdue:
        OPEN_DATA_REQUEST_STATUSES.includes(row.status as DataRequestStatus) && row.dueAt < now,
    }));
  }

  async reject(input: { dataRequestId: string; reason: string; actorUserId: string }) {
    const reason = input.reason.trim();
    if (!reason) throw AppError.badRequest('Give the family a reason', { field: 'reason' });

    const request = await this.prisma.dataRequest.findUnique({
      where: { id: input.dataRequestId },
      select: { id: true, type: true, status: true, familyId: true },
    });
    if (!request) throw AppError.notFound('Data request');

    // Conditional on the request still being open, so a refusal cannot race the worker
    // that is completing it and leave a finished export marked as refused.
    const updated = await this.prisma.dataRequest.updateMany({
      where: { id: request.id, status: { in: OPEN_DATA_REQUEST_STATUSES } },
      data: { status: DataRequestStatus.REJECTED, rejectionReason: reason },
    });
    if (updated.count === 0) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        `This request is already ${request.status.toLowerCase().replace('_', ' ')}`,
        { status: request.status },
      );
    }

    await this.audit.record({
      actorId: input.actorUserId,
      action: 'data-request.reject',
      targetType: 'data_request',
      targetId: request.id,
      before: { status: request.status },
      after: { status: DataRequestStatus.REJECTED, reason },
    });

    const guardians = await this.prisma.familyMember.findMany({
      where: { familyId: request.familyId },
      select: { userId: true },
    });
    if (guardians.length > 0) {
      await this.notifications
        .enqueue({
          userIds: guardians.map((g) => g.userId),
          template: TEMPLATE.DATA_REQUEST_REJECTED,
          data: {
            type: request.type === 'DELETE' ? 'deletion' : 'export',
            reference: dataRequestReference(request.id),
            reason,
          },
        })
        // The refusal stands even if the notice fails; the family also sees it in Privacy.
        .catch((error: Error) => this.logger.warn(`Refusal notice failed: ${error.message}`));
    }

    return {
      id: request.id,
      status: DataRequestStatus.REJECTED,
      rejectionReason: reason,
    };
  }
}
