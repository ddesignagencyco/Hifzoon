import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { PromoCodesService } from './promo-codes.service';

const NOW = new Date('2026-11-06T12:00:00Z');

function harness(code: Record<string, unknown> | null = {}) {
  const row =
    code === null
      ? null
      : {
          id: 'promo-1',
          code: 'WELCOME10',
          percentOff: 10,
          amountOffMinor: null,
          currency: null,
          maxRedemptions: null,
          redeemedCount: 0,
          expiresAt: null,
          active: true,
          appliesToPlanIds: [] as string[],
          ...code,
        };
  const redemptions: Array<Record<string, unknown>> = [];
  const prisma = {
    promoCode: {
      findUnique: jest.fn(async ({ where }: { where: { code?: string; id?: string } }) =>
        row && (where.code === row.code || where.id === row.id) ? row : null,
      ),
      update: jest.fn(async ({ data }: { data: { redeemedCount: { increment: number } } }) => {
        if (row) row.redeemedCount += data.redeemedCount.increment;
        return row;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new',
        ...data,
      })),
    },
    promoRedemption: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { promoCodeId_familyId: { promoCodeId: string; familyId: string } };
        }) =>
          redemptions.find(
            (r) =>
              r.promoCodeId === where.promoCodeId_familyId.promoCodeId &&
              r.familyId === where.promoCodeId_familyId.familyId,
          ) ?? null,
      ),
      // Mirrors the unique constraints on subscription and on (code, family).
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (
          redemptions.some(
            (r) =>
              r.subscriptionId === data.subscriptionId ||
              (r.promoCodeId === data.promoCodeId && r.familyId === data.familyId),
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        redemptions.push(data);
        return data;
      }),
    },
    plan: { count: jest.fn(async () => 1) },
  };
  const db = Object.assign(prisma, {
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  });
  const service = new PromoCodesService(
    db as unknown as PrismaService,
    { record: jest.fn() } as unknown as AuditService,
  );
  const validate = (extra: Record<string, unknown> = {}) =>
    service.validate({
      code: 'welcome10',
      familyId: 'fam-1',
      planId: 'plan-1',
      now: NOW,
      ...extra,
    });
  return { service, prisma, row, redemptions, validate };
}

async function reasonOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return ((error as AppError).details as { reason?: string }).reason;
  }
}

describe('PromoCodesService', () => {
  describe('validate', () => {
    it('accepts a live code case-insensitively and returns its terms', async () => {
      const h = harness();
      await expect(h.validate({ code: '  Welcome10 ' })).resolves.toEqual({
        promoCodeId: 'promo-1',
        code: 'WELCOME10',
        percentOff: 10,
        amountOffMinor: null,
      });
    });

    it('refuses an unknown or switched-off code', async () => {
      expect(await reasonOf(harness(null).validate())).toBe('NOT_FOUND');
      expect(await reasonOf(harness({ active: false }).validate())).toBe('NOT_FOUND');
    });

    it('refuses an expired code, including one expiring this very moment', async () => {
      expect(await reasonOf(harness({ expiresAt: new Date('2026-11-01') }).validate())).toBe(
        'EXPIRED',
      );
      expect(await reasonOf(harness({ expiresAt: NOW }).validate())).toBe('EXPIRED');
      await expect(harness({ expiresAt: new Date('2026-12-01') }).validate()).resolves.toBeTruthy();
    });

    it('refuses a code whose redemptions have reached the limit', async () => {
      expect(await reasonOf(harness({ maxRedemptions: 5, redeemedCount: 5 }).validate())).toBe(
        'MAX_REDEEMED',
      );
      await expect(
        harness({ maxRedemptions: 5, redeemedCount: 4 }).validate(),
      ).resolves.toBeTruthy();
    });

    it('refuses a plan the code is not for', async () => {
      const h = harness({ appliesToPlanIds: ['plan-other'] });
      expect(await reasonOf(h.validate())).toBe('WRONG_PLAN');
      await expect(h.validate({ planId: 'plan-other' })).resolves.toBeTruthy();
    });

    it('takes a USD amount-off code and refuses one made in another currency', async () => {
      const usd = harness({ percentOff: null, amountOffMinor: 500, currency: 'USD' });
      await expect(usd.validate()).resolves.toMatchObject({ amountOffMinor: 500 });
      // Made before prices moved to USD: 5 GBP off is not 5 USD off.
      const gbp = harness({ percentOff: null, amountOffMinor: 500, currency: 'GBP' });
      expect(await reasonOf(gbp.validate())).toBe('WRONG_CURRENCY');
    });

    it('allows each family to use a code once', async () => {
      const h = harness();
      await h.service.redeem({
        promoCodeId: 'promo-1',
        subscriptionId: 'sub-1',
        familyId: 'fam-1',
        discountMinor: 490,
      });

      expect(await reasonOf(h.validate())).toBe('ALREADY_USED');
      await expect(h.validate({ familyId: 'fam-2' })).resolves.toBeTruthy();
    });
  });

  describe('redeem', () => {
    it('counts once per subscription however often activation runs', async () => {
      const h = harness();
      const input = {
        promoCodeId: 'promo-1',
        subscriptionId: 'sub-1',
        familyId: 'fam-1',
        discountMinor: 490,
      };

      expect(await h.service.redeem(input)).toBe('redeemed');
      expect(await h.service.redeem(input)).toBe('already');
      expect(h.row?.redeemedCount).toBe(1);
      expect(h.redemptions).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('stores the code upper-case and refuses both kinds of discount at once', async () => {
      const h = harness(null);
      await h.service.create({ code: 'spring-25', percentOff: 25 }, 'admin-1');
      expect(h.prisma.promoCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'SPRING-25',
          percentOff: 25,
          createdById: 'admin-1',
        }),
      });

      await expect(
        h.service.create({ code: 'BOTH', percentOff: 10, amountOffMinor: 500 }, 'admin-1'),
      ).rejects.toThrow(/either a percentage off or an amount off/);
      await expect(h.service.create({ code: 'BIG', percentOff: 60 }, 'admin-1')).rejects.toThrow(
        /1 to 50/,
      );
      await h.service.create({ code: 'FIVE', amountOffMinor: 500 }, 'admin-1');
      expect(h.prisma.promoCode.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ code: 'FIVE', amountOffMinor: 500, currency: 'USD' }),
      });
    });
  });
});
