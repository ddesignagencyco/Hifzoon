import { Injectable } from '@nestjs/common';
import { type Currency, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { BILLING_CURRENCY, MAX_DISCOUNT_PERCENT, type PromoTerms } from './pricing';

export interface PromoCodeInput {
  code: string;
  percentOff?: number | null;
  /** In US cents: an amount off is always in `BILLING_CURRENCY`. */
  amountOffMinor?: number | null;
  maxRedemptions?: number | null;
  expiresAt?: Date | null;
  active?: boolean;
  appliesToPlanIds?: string[];
}

/** Codes are matched case-insensitively by storing and looking them up upper-case. */
export const normaliseCode = (code: string) => code.trim().toUpperCase();

/**
 * Promo codes (Nov 2026): admin CRUD, the checks a code must pass before a family sees its
 * price, and the redemption that is counted only once the subscription is paid for.
 */
@Injectable()
export class PromoCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.promoCode.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { redemptions: true } } },
    });
  }

  async create(input: PromoCodeInput, actorId: string) {
    const data = this.checked(input);
    const code = normaliseCode(input.code);
    if (await this.prisma.promoCode.findUnique({ where: { code }, select: { id: true } })) {
      throw AppError.conflict('CONFLICT', `A promo code ${code} already exists`);
    }
    await this.assertPlansExist(data.appliesToPlanIds);
    const created = await this.prisma.promoCode.create({
      data: { ...data, code, createdById: actorId },
    });
    await this.audit.record({
      actorId,
      action: 'bil.promo.create',
      targetType: 'promo_code',
      targetId: created.id,
      after: { ...data, code },
    });
    return created;
  }

  /**
   * Edits a code. The discount itself (percent or amount) cannot change once anyone has
   * redeemed it: their subscriptions were priced with it and the history would stop
   * explaining their invoices. Limits, expiry, plans and on/off can always change.
   */
  async update(id: string, input: Partial<Omit<PromoCodeInput, 'code'>>, actorId: string) {
    const current = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Promo code');
    // `currency` is internal: a code made before prices moved to USD keeps its own currency
    // until its amount is changed, so turning it off or on does not relabel £10 as $10.
    const merged: PromoCodeInput & { currency?: Currency | null } = {
      code: current.code,
      percentOff: current.percentOff,
      amountOffMinor: current.amountOffMinor,
      currency: current.currency,
      maxRedemptions: current.maxRedemptions,
      expiresAt: current.expiresAt,
      active: current.active,
      appliesToPlanIds: current.appliesToPlanIds,
      ...input,
    };
    // Switching kinds clears the other kind, so a form that sends only the new one works.
    if (input.percentOff != null) {
      merged.amountOffMinor = null;
      merged.currency = null;
    } else if (input.amountOffMinor != null) {
      merged.percentOff = null;
      merged.currency = BILLING_CURRENCY;
    }
    const data = this.checked(merged);
    const discountChanged =
      data.percentOff !== current.percentOff ||
      data.amountOffMinor !== current.amountOffMinor ||
      data.currency !== current.currency;
    if (discountChanged && current.redeemedCount > 0) {
      throw AppError.conflict(
        'CONFLICT',
        'Families have used this code, so its discount cannot change. Create a new code.',
      );
    }
    if (input.appliesToPlanIds) await this.assertPlansExist(data.appliesToPlanIds);
    const updated = await this.prisma.promoCode.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'bil.promo.update',
      targetType: 'promo_code',
      targetId: id,
      before: {
        percentOff: current.percentOff,
        amountOffMinor: current.amountOffMinor,
        maxRedemptions: current.maxRedemptions,
        expiresAt: current.expiresAt,
        active: current.active,
      },
      after: input,
    });
    return updated;
  }

  /** Removes a code nobody used; a used one can only be switched off (history stays). */
  async remove(id: string, actorId: string) {
    const current = await this.prisma.promoCode.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!current) throw AppError.notFound('Promo code');
    if (current._count.redemptions > 0) {
      throw AppError.conflict(
        'CONFLICT',
        'Families have used this code; switch it off instead of deleting it.',
      );
    }
    await this.prisma.promoCode.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'bil.promo.delete',
      targetType: 'promo_code',
      targetId: id,
      before: { code: current.code },
    });
    return { id, deleted: true };
  }

  /**
   * The checks a code must pass for this family and plan. Throws a 400 whose
   * message is safe to show the family; returns the terms to price with.
   *
   * The limit is checked against redemptions already counted. Two families paying at the
   * same moment for the last place can both get it; the money is already taken by then,
   * so honouring both beats refusing one after payment.
   */
  async validate(input: {
    code: string;
    familyId: string;
    planId: string;
    /** The subscription's currency; always `BILLING_CURRENCY` for a new one. */
    currency?: string;
    now?: Date;
  }): Promise<PromoTerms> {
    const code = normaliseCode(input.code);
    const promo = code ? await this.prisma.promoCode.findUnique({ where: { code } }) : null;
    const refuse = (message: string, reason: string) =>
      AppError.badRequest(message, { promoCode: code, reason });
    if (!promo || !promo.active) throw refuse('This promo code is not valid.', 'NOT_FOUND');
    if (promo.expiresAt && promo.expiresAt <= (input.now ?? new Date())) {
      throw refuse('This promo code has expired.', 'EXPIRED');
    }
    if (promo.maxRedemptions !== null && promo.redeemedCount >= promo.maxRedemptions) {
      throw refuse('This promo code has been used up.', 'MAX_REDEEMED');
    }
    if (promo.appliesToPlanIds.length > 0 && !promo.appliesToPlanIds.includes(input.planId)) {
      throw refuse('This promo code does not apply to this plan.', 'WRONG_PLAN');
    }
    if (promo.amountOffMinor !== null && promo.currency !== (input.currency ?? BILLING_CURRENCY)) {
      throw refuse(`This promo code is for prices in ${promo.currency}.`, 'WRONG_CURRENCY');
    }
    const used = await this.prisma.promoRedemption.findUnique({
      where: { promoCodeId_familyId: { promoCodeId: promo.id, familyId: input.familyId } },
      select: { id: true },
    });
    if (used) throw refuse('Your family has already used this promo code.', 'ALREADY_USED');
    return {
      promoCodeId: promo.id,
      code: promo.code,
      percentOff: promo.percentOff,
      amountOffMinor: promo.amountOffMinor,
    };
  }

  /**
   * Counts the code against its limit, once the subscription it discounts is paid for.
   * Safe to call twice: the redemption is unique per subscription, and a second one for the
   * same family is refused by the database rather than counted.
   */
  async redeem(input: {
    promoCodeId: string;
    subscriptionId: string;
    familyId: string;
    discountMinor: number;
  }): Promise<'redeemed' | 'already'> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.promoRedemption.create({ data: input });
        await tx.promoCode.update({
          where: { id: input.promoCodeId },
          data: { redeemedCount: { increment: 1 } },
        });
      });
      return 'redeemed';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'already';
      }
      throw error;
    }
  }

  private checked(input: PromoCodeInput & { currency?: Currency | null }) {
    const code = normaliseCode(input.code);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      throw AppError.badRequest('A code is 3–40 letters, digits, dashes or underscores');
    }
    const percentOff = input.percentOff ?? null;
    const amountOffMinor = input.amountOffMinor ?? null;
    if ((percentOff === null) === (amountOffMinor === null)) {
      throw AppError.badRequest('Give either a percentage off or an amount off, not both');
    }
    if (
      percentOff !== null &&
      (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > MAX_DISCOUNT_PERCENT)
    ) {
      throw AppError.badRequest(
        `A percentage off is a whole number from 1 to ${MAX_DISCOUNT_PERCENT}`,
      );
    }
    let currency: Currency | null = null;
    if (amountOffMinor !== null) {
      if (!Number.isInteger(amountOffMinor) || amountOffMinor <= 0) {
        throw AppError.badRequest('An amount off is a whole number of minor units above zero');
      }
      currency = input.currency ?? BILLING_CURRENCY;
    }
    const maxRedemptions = input.maxRedemptions ?? null;
    if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
      throw AppError.badRequest('A redemption limit is a whole number of at least 1');
    }
    return {
      percentOff,
      amountOffMinor,
      currency,
      maxRedemptions,
      expiresAt: input.expiresAt ?? null,
      active: input.active ?? true,
      appliesToPlanIds: [...new Set(input.appliesToPlanIds ?? [])],
    };
  }

  private async assertPlansExist(planIds: string[]) {
    if (planIds.length === 0) return;
    const found = await this.prisma.plan.count({ where: { id: { in: planIds } } });
    if (found !== planIds.length) throw AppError.notFound('Plan');
  }
}
