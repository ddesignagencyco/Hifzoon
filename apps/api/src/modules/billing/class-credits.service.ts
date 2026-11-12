import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** The most classes one grant may add: a typo of 500 for 5 should not be one click. */
export const MAX_CLASS_CREDIT = 50;

/**
 * Class credits (FR-OPS): complimentary classes staff give a family (a goodwill gesture after
 * a missed class, a referral reward). Each grant is a row with who gave it and why, so the
 * family's balance is always explainable. A grant made by mistake is removed with `revoke`,
 * which records who removed it and why.
 */
@Injectable()
export class ClassCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issue(
    input: {
      familyId: string;
      amountClasses: number;
      reason: string;
      idempotencyKey: string;
    },
    actorId: string,
  ) {
    const replay = await this.prisma.classCredit.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      if (replay.familyId !== input.familyId || replay.amountClasses !== input.amountClasses) {
        throw AppError.conflict('CONFLICT', 'Idempotency-Key was already used for another credit');
      }
      return replay;
    }

    const reason = input.reason.trim();
    if (reason.length < 3) throw AppError.badRequest('Give a reason for the credit');
    if (
      !Number.isInteger(input.amountClasses) ||
      input.amountClasses < 1 ||
      input.amountClasses > MAX_CLASS_CREDIT
    ) {
      throw AppError.badRequest(`A credit is between 1 and ${MAX_CLASS_CREDIT} classes`);
    }
    const family = await this.prisma.family.findUnique({
      where: { id: input.familyId },
      select: { id: true, deletedAt: true },
    });
    if (!family || family.deletedAt) throw AppError.notFound('Family');

    const credit = await this.prisma.classCredit.create({
      data: {
        familyId: input.familyId,
        amountClasses: input.amountClasses,
        reason,
        issuedById: actorId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await this.audit.record({
      actorId,
      action: 'bil.classCredit.issue',
      targetType: 'class_credit',
      targetId: credit.id,
      after: { familyId: input.familyId, amountClasses: input.amountClasses, reason },
    });
    return credit;
  }

  /** Every grant for a family, newest first, with the running total and who issued each. */
  async listForFamily(familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true, name: true },
    });
    if (!family) throw AppError.notFound('Family');
    const credits = await this.prisma.classCredit.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, amountClasses: true, reason: true, issuedById: true, createdAt: true },
    });
    const issuers = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(credits.map((c) => c.issuedById))] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(issuers.map((u) => [u.id, u.name]));
    return {
      family,
      totalClasses: credits.reduce((sum, c) => sum + c.amountClasses, 0),
      credits: credits.map((c) => ({ ...c, issuedBy: nameOf.get(c.issuedById) ?? null })),
    };
  }

  /** Removes a grant made by mistake. Audited with the reason; the row is deleted. */
  async revoke(id: string, reason: string, actorId: string) {
    const credit = await this.prisma.classCredit.findUnique({ where: { id } });
    if (!credit) throw AppError.notFound('Class credit');
    if (reason.trim().length < 3) throw AppError.badRequest('Give a reason for revoking');
    await this.prisma.classCredit.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'bil.classCredit.revoke',
      targetType: 'class_credit',
      targetId: id,
      before: { familyId: credit.familyId, amountClasses: credit.amountClasses },
      after: { reason: reason.trim() },
    });
    return { id, revoked: true };
  }
}
