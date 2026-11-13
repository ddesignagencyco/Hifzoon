import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { leadWon } from '../crm/trial-lead';
import { type Currency, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { PolicyService, STAFF_SCOPE_ROLES, hasAnyRole } from '../../common/services/policy.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PaymentWebhookEvent,
  type ProviderInvoice,
} from '../../integrations/providers';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  NotificationsService,
  TEMPLATE,
  type TemplateData,
  type TemplateKey,
} from '../notifications/notifications.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { SettingsService } from '../settings/settings.service';
import { dunningLadder, paymentProviderCode } from './billing.policy';
import {
  BILLING_CURRENCY,
  MAX_DISCOUNT_PERCENT,
  type PriceBreakdown,
  type PromoTerms,
  computePrice,
  readBreakdown,
  repriceKeepingDiscount,
} from './pricing';
import { PromoCodesService } from './promo-codes.service';

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** How far ahead a teacher's free hours are read to judge weekly times (the web's picker). */
const WEEKLY_LOOKAHEAD_DAYS = 14;
const DAY_MS = 86_400_000;

/** Months per billing interval, matching the plan model. */
const INTERVAL_MONTHS = { month: 1, quarter: 3, half_year: 6 } as const;

/** Provider webhooks act with no signed-in person behind them. */
const SYSTEM_ACTOR = null;

/**
 * `refund.issued_by` is a required uuid, but a refund made in the provider's dashboard has
 * no person of ours behind it. The nil uuid says "the provider" without borrowing the id of
 * some unrelated row, and no user can ever have it.
 */
const PROVIDER_REFUND_ACTOR = '00000000-0000-0000-0000-000000000000';

/** The weekly times a family picks with the teacher they want to keep. */
export interface ScheduleChoice {
  enrolmentId: string;
  teacherId: string;
  timeZone: string;
  /** First day (YYYY-MM-DD, family zone) the regular classes may start. */
  startsOn: string;
  slots: Array<{ weekday: WeekdayCode; localTime: string }>;
}

/**
 * Stored on the subscription while it is INCOMPLETE and applied once the first payment
 * lands, so nothing is enrolled or scheduled for a family that walked away from checkout.
 */
export interface SubscriptionSetup {
  trialOutcomeId?: string;
  schedule?: ScheduleChoice & { durationMinutes: number; roomType: 'ONE_TO_ONE' | 'CIRCLE' };
  /** The hosted checkout that will start it; read back when reconciling a lost webhook. */
  checkoutSessionId?: string;
  /** Set once activation ran, so a redelivered webhook does not schedule twice. */
  appliedAt?: string;
  scheduleIds?: string[];
  scheduleError?: string;
  /** The plan's classes a week changed; the family must pick new weekly times (R18). */
  timesNeeded?: boolean;
}

/**
 * Billing (FR-BIL-01..07).
 *
 * Money rules that this module enforces without exception:
 *
 *   - **All amounts are integer minor units.** No floats, ever. `0.1 + 0.2 !== 0.3` is
 *     not a curiosity when it decides whether a family's invoice is 30.00 or 30.0000001.
 *     Display formatting happens at the edge and nowhere else.
 *
 *   - **The invoice is the source of truth, not the payment provider.** Provider
 *     webhooks are *accepted* (FR-BIL-04) but every state change is applied to the
 *     local invoice first and recorded. A webhook that arrives twice, or arrives for an
 *     invoice that was voided, changes nothing.
 *
 *   - **Invoice due dates are measured from issue, not from a calendar boundary.** The
 *     due window comes from `billing.invoice_due_days`, so an invoice raised late in a
 *     cycle is never immediately overdue.
 *
 * The payment provider is still a fake on this deployment (`PAYMENT_PROVIDER`), so
 * `createCheckout` returns a synthetic URL. Everything above that line — invoicing,
 * dunning, refunds, the state machine — is real and is what a real provider plugs into.
 */

/**
 * `SubscriptionSetup` is a typed interface, so it has no index signature and Prisma's JSON
 * input type rejects it directly. Widening to `object` is enough: `object` IS assignable to
 * `Prisma.InputJsonValue`, so this needs no cast and keeps both tsc and eslint happy.
 */
const asJson = (value: object): Prisma.InputJsonValue => value;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly queues: QueueService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly policies: PolicyService,
    private readonly scheduling: SchedulingService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfigService,
    @Optional() promos?: PromoCodesService,
  ) {
    this.promos = promos ?? new PromoCodesService(prisma, audit);
  }

  private readonly promos: PromoCodesService;

  /**
   * Who may change this family's money.
   *
   * S19 — the routes advertise `@Roles(GUARDIAN, ADMIN, SUPER_ADMIN)` but the service
   * behind them only ever accepted a family member, so an administrator passed the role
   * guard and was then refused. The contract was a lie in one direction or the other; it
   * is now: **staff may act, and every time a non-member does, it is written to the audit
   * log.** Support genuinely needs to pause a subscription or refund a family that cannot
   * sign in, and an unlogged override on someone's billing is exactly the kind of thing
   * nobody can reconstruct later.
   */
  private async assertMayManageFamily(
    actorId: string,
    familyId: string,
    roles: string[],
    action: string,
  ): Promise<void> {
    if (hasAnyRole({ userId: actorId, roles }, STAFF_SCOPE_ROLES)) {
      await this.audit.record({
        actorId,
        action: `bil.staff.${action}`,
        targetType: 'family',
        targetId: familyId,
        after: { via: 'staff-override' },
      });
      return;
    }
    await this.policies.assertGuardianInFamily(actorId, familyId);
  }

  /**
   * The `PaymentProviderCode` a payment row should carry, derived from the *selected*
   * adapter rather than hardcoded. Local dev runs the fake adapter (→ `OTHER`); a real
   * Stripe or PayPal deployment records the matching code, so the stored value is never
   * a lie about who processed the charge.
   *
   * Shared with `BillingProcessor` via `billing.policy.ts` — see the note there.
   */
  private get providerCode(): 'STRIPE' | 'PAYPAL' | 'OTHER' {
    return paymentProviderCode(this.payments.name);
  }

  // ── Catalogue ─────────────────────────────────────────────────────────────

  /**
   * Full plan catalogue with real prices. No longer served on the public marketing
   * route (see `listPublicPlans`) — kept for any authenticated/internal caller that
   * still needs the real amount, e.g. a future admin plan-management screen. Checkout
   * itself never calls this: `subscribe()` reads `PlanPrice` directly.
   */
  async listPlans() {
    return this.prisma.plan.findMany({
      where: { active: true },
      include: { prices: { where: { currency: BILLING_CURRENCY } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Point 5 of the Oct 2026 feature set — the public plan listing. Per the confirmed
   * product decision, it sells the teacher tier a plan guarantees and never shows a
   * price; the real price is only revealed later in the funnel (via `priceFor`, once a
   * family is proceeding to subscribe).
   */
  async listPublicPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      select: {
        id: true,
        code: true,
        name: true,
        classesPerWeek: true,
        classMinutes: true,
        roomType: true,
        billingPeriod: true,
        periodDiscountPercent: true,
        tier: { select: { code: true, name: true, badgeIcon: true, description: true } },
      },
      orderBy: { name: 'asc' },
    });
    // A monthly plan's stored percentage is never applied, so it is not advertised either.
    return plans.map((p) => ({
      ...p,
      periodDiscountPercent: p.billingPeriod === 'MONTHLY' ? 0 : p.periodDiscountPercent,
    }));
  }

  /** Admin-only: assigns or clears (`tierId: null`) a plan's teacher tier (point 5). */
  async setPlanTier(planId: string, tierId: string | null) {
    if (tierId) {
      const tier = await this.prisma.teacherTier.findUnique({ where: { id: tierId } });
      if (!tier) throw AppError.notFound('Teacher tier');
    }
    return this.prisma.plan.update({
      where: { id: planId },
      data: { tierId },
      select: { id: true, tierId: true, tier: { select: { code: true, name: true } } },
    });
  }

  /**
   * What a plan costs a month, in USD (`BILLING_CURRENCY`). With a teacher tier, that tier's
   * price when one is set (tier pricing); otherwise, or without a tier, the standard price.
   */
  async priceFor(planId: string, tierId?: string | null) {
    const currency = BILLING_CURRENCY;
    if (tierId) {
      const tierPrice = await this.prisma.planTierPrice.findUnique({
        where: { planId_tierId_currency: { planId, tierId, currency } },
      });
      if (tierPrice) return { ...tierPrice, tierId };
    }
    const price = await this.prisma.planPrice.findUnique({
      where: { planId_currency: { planId, currency } },
    });
    if (!price) {
      throw AppError.notFound(`Plan price in ${currency}`);
    }
    return { ...price, tierId: null as string | null };
  }

  /**
   * What one billing period of a plan costs before any family-specific discount:
   * `PlanPrice` (the monthly price) × months, less the plan's period discount. This is what
   * a family sees on the plan picker and what the provider bills as the recurring price.
   */
  async periodPriceFor(planId: string, tierId?: string | null) {
    const [monthly, plan] = await Promise.all([
      this.priceFor(planId, tierId),
      this.prisma.plan.findUnique({
        where: { id: planId },
        select: { billingPeriod: true, periodDiscountPercent: true },
      }),
    ]);
    if (!plan) throw AppError.notFound('Plan');
    const breakdown = computePrice({
      monthlyMinor: monthly.amountMinor,
      billingPeriod: plan.billingPeriod,
      periodDiscountPercent: plan.periodDiscountPercent ?? 0,
    });
    return {
      ...monthly,
      billingPeriod: plan.billingPeriod,
      amountMinor: breakdown.periodPriceMinor,
      monthlyMinor: breakdown.monthlyMinor,
      months: breakdown.months,
      listMinor: breakdown.listMinor,
      periodDiscountPercent: breakdown.periodDiscountPercent,
      periodDiscountMinor: breakdown.periodDiscountMinor,
      breakdown,
    };
  }

  /** Stable key for a (plan, tier) price lookup. */
  private static priceKey(planId: string, tierId?: string | null): string {
    return `${planId}:${tierId ?? ''}`;
  }

  /**
   * `periodPriceFor` for many (plan, tier) pairs at once (PROD-06): the plans, the standard
   * prices and the tier prices are each read with a single query, then each period price is
   * computed in memory. This keeps a list endpoint to a fixed number of queries instead of
   * two per row. A pair whose plan or price is missing is simply absent from the map, so a
   * caller reads it as "no price" — the same outcome as `periodPriceFor().catch(() => null)`.
   */
  private async periodPricesFor(
    pairs: Array<{ planId: string; tierId?: string | null }>,
  ): Promise<Map<string, { currency: Currency; amountMinor: number }>> {
    const currency = BILLING_CURRENCY;
    const result = new Map<string, { currency: Currency; amountMinor: number }>();
    const planIds = [...new Set(pairs.map((p) => p.planId))];
    if (planIds.length === 0) return result;
    const tierIds = [...new Set(pairs.map((p) => p.tierId).filter((t): t is string => !!t))];

    const [plans, planPrices, tierPrices] = await Promise.all([
      this.prisma.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, billingPeriod: true, periodDiscountPercent: true },
      }),
      this.prisma.planPrice.findMany({ where: { planId: { in: planIds }, currency } }),
      tierIds.length
        ? this.prisma.planTierPrice.findMany({
            where: { planId: { in: planIds }, tierId: { in: tierIds }, currency },
          })
        : Promise.resolve([] as Array<{ planId: string; tierId: string; amountMinor: number }>),
    ]);

    const planById = new Map(plans.map((p) => [p.id, p]));
    const standardByPlan = new Map(planPrices.map((p) => [p.planId, p]));
    const tierByPair = new Map(
      tierPrices.map((p) => [BillingService.priceKey(p.planId, p.tierId), p]),
    );

    for (const { planId, tierId } of pairs) {
      const key = BillingService.priceKey(planId, tierId);
      if (result.has(key)) continue;
      const plan = planById.get(planId);
      // Tier pricing: the tier's price where one is set, else the plan's standard price.
      const monthly = (tierId ? tierByPair.get(key) : undefined) ?? standardByPlan.get(planId);
      if (!plan || !monthly) continue;
      const breakdown = computePrice({
        monthlyMinor: monthly.amountMinor,
        billingPeriod: plan.billingPeriod,
        periodDiscountPercent: plan.periodDiscountPercent ?? 0,
      });
      result.set(key, { currency, amountMinor: breakdown.periodPriceMinor });
    }
    return result;
  }

  /**
   * `GET /billing/teacher-prices` — what every active plan costs with one teacher, before
   * any family discount: the teacher's tier price where one is set, else the plan's
   * standard price (monthly), then the plan's period discount for one billing period.
   *
   * Public on purpose: a family should see what a teacher costs before booking the trial,
   * and most visitors are not signed in yet. Sibling and promo discounts depend on the
   * family, so they are left to `quote` at checkout, where the price is confirmed.
   */
  async teacherPrices(teacherProfileId: string) {
    const currency = BILLING_CURRENCY;
    // Only a teacher the public directory lists has public prices, so this cannot be used
    // to probe an unapproved or delisted profile.
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherProfileId, hiringStatus: 'APPROVED', readyToMatch: true },
      select: { id: true, tierId: true, tier: { select: { code: true, name: true } } },
    });
    if (!teacher) throw AppError.notFound('Teacher');

    const [plans, tierPrices] = await Promise.all([
      this.prisma.plan.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          name: true,
          classesPerWeek: true,
          classMinutes: true,
          roomType: true,
          billingPeriod: true,
          periodDiscountPercent: true,
          prices: { where: { currency }, select: { amountMinor: true } },
        },
        orderBy: { name: 'asc' },
      }),
      teacher.tierId
        ? this.prisma.planTierPrice.findMany({
            where: { tierId: teacher.tierId, currency },
            select: { planId: true, amountMinor: true },
          })
        : Promise.resolve([] as Array<{ planId: string; amountMinor: number }>),
    ]);
    const tierPriceOf = new Map(tierPrices.map((p) => [p.planId, p.amountMinor]));

    const rows = plans.flatMap((plan) => {
      const tierMinor = tierPriceOf.get(plan.id);
      const monthlyMinor = tierMinor ?? plan.prices[0]?.amountMinor;
      // No price set: left out rather than shown as free.
      if (monthlyMinor === undefined) return [];
      const b = computePrice({
        monthlyMinor,
        billingPeriod: plan.billingPeriod,
        periodDiscountPercent: plan.periodDiscountPercent ?? 0,
      });
      return [
        {
          planId: plan.id,
          code: plan.code,
          name: plan.name,
          classesPerWeek: plan.classesPerWeek,
          classMinutes: plan.classMinutes,
          roomType: plan.roomType,
          billingPeriod: plan.billingPeriod,
          /** True when the teacher's tier has its own price for this plan. */
          tierPriced: tierMinor !== undefined,
          monthlyMinor: b.monthlyMinor,
          months: b.months,
          listMinor: b.listMinor,
          periodDiscountPercent: b.periodDiscountPercent,
          periodPriceMinor: b.periodPriceMinor,
        },
      ];
    });
    rows.sort((a, b) => a.monthlyMinor - b.monthlyMinor || a.name.localeCompare(b.name));

    return {
      teacherId: teacher.id,
      currency,
      tier: teacher.tier,
      /** The cheapest monthly price, for "From … / month"; null when nothing is sold here. */
      fromMonthlyMinor: rows[0]?.monthlyMinor ?? null,
      plans: rows,
    };
  }

  /**
   * The sibling rule, per subscription and decided once, when the family subscribes: the
   * new subscription gets `billing.sibling_discount_percent` when the family already has an
   * ACTIVE subscription covering a child other than the one(s) this subscription is for.
   *
   * - Only ACTIVE counts: a paused, past-due or unfinished plan is not "already paying".
   * - A subscription whose child is unknown (no trial or weekly times chosen) gets none,
   *   because a second course for the same child must not pass as a sibling.
   * - It is locked with the price: a sibling cancelling later does not re-price this one.
   */
  async siblingPercentFor(familyId: string, childStudentIds: string[]): Promise<number> {
    if (childStudentIds.length === 0) return 0;
    const percent = Math.floor(await this.settings.getNumber('billing.sibling_discount_percent'));
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    const siblings = await this.prisma.subscription.count({
      where: {
        familyId,
        status: 'ACTIVE',
        enrolments: { some: { studentId: { notIn: childStudentIds } } },
      },
    });
    return siblings > 0 ? Math.min(percent, MAX_DISCOUNT_PERCENT) : 0;
  }

  /** The children a subscription is for, from the weekly times or the trial it converts. */
  private async childrenOf(
    familyId: string,
    setup: { trialOutcomeId?: string; schedule?: { enrolmentId: string } },
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (setup.schedule?.enrolmentId) {
      const enrolment = await this.prisma.enrolment.findFirst({
        where: { id: setup.schedule.enrolmentId, student: { familyId } },
        select: { studentId: true },
      });
      if (enrolment) ids.add(enrolment.studentId);
    }
    if (setup.trialOutcomeId) {
      const outcome = await this.prisma.trialOutcome.findUnique({
        where: { id: setup.trialOutcomeId },
        select: {
          class: {
            select: { students: { select: { student: { select: { id: true, familyId: true } } } } },
          },
        },
      });
      outcome?.class.students
        .filter((s) => s.student.familyId === familyId)
        .forEach((s) => ids.add(s.student.id));
    }
    return [...ids];
  }

  /**
   * The full price for one family's subscription: period discount, then the larger of
   * the sibling or promo discount (see pricing.ts). A promo code that fails its checks
   * throws, so the family is told before they pay rather than charged the full price.
   */
  private async priceSubscription(input: {
    familyId: string;
    planId: string;
    tierId: string | null;
    childStudentIds: string[];
    promoCode?: string;
  }): Promise<PriceBreakdown> {
    const [period, siblingPercent, promo] = await Promise.all([
      this.periodPriceFor(input.planId, input.tierId),
      this.siblingPercentFor(input.familyId, input.childStudentIds),
      input.promoCode?.trim()
        ? this.promos.validate({
            code: input.promoCode,
            familyId: input.familyId,
            planId: input.planId,
            currency: BILLING_CURRENCY,
          })
        : Promise.resolve<PromoTerms | null>(null),
    ]);
    return computePrice({
      monthlyMinor: period.monthlyMinor,
      billingPeriod: period.billingPeriod,
      periodDiscountPercent: period.periodDiscountPercent,
      siblingPercent,
      promo,
    });
  }

  /**
   * `POST /billing/quote` — what the family will pay before they go to the card page, with
   * every discount spelled out. Validates a promo code without using it up.
   */
  async quote(input: {
    familyId: string;
    planId: string;
    actorId: string;
    actorRoles: string[];
    trialOutcomeId?: string;
    schedule?: ScheduleChoice;
    teacherId?: string;
    /** The child, when starting with a teacher before any enrolment exists (sibling rule). */
    studentId?: string;
    promoCode?: string;
  }): Promise<PriceBreakdown & { currency: typeof BILLING_CURRENCY }> {
    await this.assertMayManageFamily(input.actorId, input.familyId, input.actorRoles, 'quote');
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.active) throw AppError.notFound('Plan');
    // The weekly-times check is skipped: a quote is shown while the family is still
    // picking times, and `subscribe` runs it in full.
    const setup = await this.buildSetup({ ...input, schedule: undefined }, plan);
    if (input.schedule)
      setup.schedule = { ...input.schedule, durationMinutes: 0, roomType: 'ONE_TO_ONE' };
    const teacherId = input.teacherId ?? (await this.teacherForSubscription(setup));
    const tierId = await this.tierOfTeacher(teacherId);
    const children = await this.childrenOf(input.familyId, setup);
    if (input.studentId) {
      // Only this family's child counts, so a stranger's id cannot unlock a sibling price.
      const child = await this.prisma.student.findFirst({
        where: { id: input.studentId, familyId: input.familyId },
        select: { id: true },
      });
      if (!child) throw AppError.notFound('Student');
      if (!children.includes(child.id)) children.push(child.id);
    }
    const breakdown = await this.priceSubscription({
      familyId: input.familyId,
      planId: input.planId,
      tierId,
      childStudentIds: children,
      promoCode: input.promoCode,
    });
    return { ...breakdown, currency: BILLING_CURRENCY };
  }

  /** The tier of a teacher profile (null when unassigned or unknown). */
  async tierOfTeacher(teacherProfileId: string | null | undefined): Promise<string | null> {
    if (!teacherProfileId) return null;
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { tierId: true },
    });
    return teacher?.tierId ?? null;
  }

  /**
   * The teacher a subscription is for: the chosen weekly teacher, else the trial teacher.
   * Takes the setup `buildSetup` validated, so an outcome id from the request body cannot
   * choose the price tier before it is known to be this family's won trial.
   */
  private async teacherForSubscription(input: {
    trialOutcomeId?: string;
    schedule?: { teacherId: string };
  }) {
    if (input.schedule?.teacherId) return input.schedule.teacherId;
    if (!input.trialOutcomeId) return null;
    const outcome = await this.prisma.trialOutcome.findUnique({
      where: { id: input.trialOutcomeId },
      select: { class: { select: { teacherId: true } } },
    });
    return outcome?.class.teacherId ?? null;
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Starts a subscription after the family's trial (FR-BIL-02).
   *
   * The provider subscription is created *before* the local row is written, so a
   * provider call that succeeds but a database failure leaves an orphan at the
   * provider rather than a local subscription that silently never bills anyone.
   */
  async subscribe(input: {
    familyId: string;
    planId: string;
    actorId: string;
    actorRoles: string[];
    trialOutcomeId?: string;
    schedule?: ScheduleChoice;
    /** The web app's origin, for the hosted checkout's return links. */
    returnBaseUrl?: string;
    /** Checked here; counted only once the subscription is paid for (`activate`). */
    promoCode?: string;
  }) {
    // CR-10 — a guardian may only subscribe a family they belong to; taking `familyId`
    // from the body would otherwise let anyone bill any family. Checked before anything is
    // read, so a stranger learns no prices or plan state from the replies.
    await this.assertMayManageFamily(input.actorId, input.familyId, input.actorRoles, 'subscribe');

    const [family, plan] = await Promise.all([
      this.prisma.family.findUnique({ where: { id: input.familyId } }),
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
    ]);

    if (!family) throw AppError.notFound('Family');
    if (!plan || !plan.active) throw AppError.notFound('Plan');

    const setup = await this.buildSetup(input, plan);

    // Tier pricing: the family pays the price for their teacher's tier, then the period,
    // sibling and promo discounts (pricing.ts). The final figure is what gets locked.
    const tierId = await this.tierOfTeacher(await this.teacherForSubscription(setup));
    const breakdown = await this.priceSubscription({
      familyId: input.familyId,
      planId: input.planId,
      tierId,
      childStudentIds: await this.childrenOf(input.familyId, setup),
      promoCode: input.promoCode,
    });
    const price = { amountMinor: breakdown.finalMinor };
    const discount = providerDiscount(breakdown);

    // M29 — one paying plan per child and course. A second checkout for an enrolment that
    // already has a live subscription would bill the family twice for the same lessons.
    const enrolmentId = setup.schedule?.enrolmentId;
    if (enrolmentId) {
      const live = await this.prisma.subscription.findFirst({
        where: {
          familyId: input.familyId,
          status: { in: ['ACTIVE', 'PAST_DUE', 'PAUSED'] },
          enrolments: { some: { id: enrolmentId } },
        },
        select: { id: true, plan: { select: { name: true } } },
      });
      if (live) {
        throw AppError.conflict(
          'CONFLICT',
          `This child already has ${live.plan.name} for this course. Change that plan instead of starting a second one.`,
          { subscriptionId: live.id },
        );
      }
    }

    const customerId = await this.ensureCustomer(
      family.id,
      family.billingName ?? 'Family',
      input.actorId,
    );

    // A family that left checkout and comes back reuses its unfinished subscription
    // instead of piling up INCOMPLETE rows for the same plan.
    const pending = await this.prisma.subscription.findFirst({
      where: { familyId: input.familyId, planId: input.planId, status: 'INCOMPLETE' },
      orderBy: { createdAt: 'desc' },
    });
    // The earlier checkout link must stop working before a new one is made, or a family who
    // pays both is billed twice; if it was already paid, there is nothing more to start.
    const earlierSession = (pending?.setup as { checkoutSessionId?: string } | null)
      ?.checkoutSessionId;
    if (earlierSession && this.payments.closeCheckout) {
      const state = await this.payments.closeCheckout(earlierSession);
      if (state === 'complete') {
        throw AppError.conflict(
          'CONFLICT',
          'This plan has already been paid for; it will show as active in a moment.',
          { subscriptionId: pending!.id },
        );
      }
    }
    const subscription = pending
      ? await this.prisma.subscription.update({
          where: { id: pending.id },
          data: {
            currency: BILLING_CURRENCY,
            setup: asJson(setup),
            tierId,
            amountMinor: price.amountMinor,
            discountBreakdown: asJson(breakdown),
          },
        })
      : await this.prisma.subscription.create({
          data: {
            familyId: input.familyId,
            planId: input.planId,
            currency: BILLING_CURRENCY,
            status: 'INCOMPLETE',
            setup: asJson(setup),
            tierId,
            // Locked here: the family is billed what they were shown, whatever the price
            // list says by the time an invoice is raised.
            amountMinor: price.amountMinor,
            discountBreakdown: asJson(breakdown),
          },
        });

    const webBase = (input.returnBaseUrl ?? '').replace(/\/$/, '');
    const checkout = await this.payments.createSubscriptionCheckout({
      reference: subscription.id,
      customerId,
      planCode: plan.code,
      planName: plan.name,
      // The recurring price before the sibling/promo discount, which travels as a coupon so
      // the provider's invoice shows it; the two net to `price.amountMinor`.
      amountMinor: breakdown.periodPriceMinor,
      discount,
      currency: BILLING_CURRENCY,
      interval: intervalOf(plan.billingPeriod),
      successUrl: `${webBase}/parent/billing/checkout/success?subscription=${subscription.id}`,
      cancelUrl: `${webBase}/parent/billing/checkout/cancelled?subscription=${subscription.id}`,
      idempotencyKey: `subcheckout:${subscription.id}:${randomUUID()}`,
    });

    if (checkout) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { setup: asJson({ ...setup, checkoutSessionId: checkout.sessionId }) },
      });
    }

    await this.audit.record({
      actorId: input.actorId,
      action: 'bil.subscribe',
      targetType: 'subscription',
      targetId: subscription.id,
      after: {
        familyId: input.familyId,
        planId: input.planId,
        amountMinor: price.amountMinor,
        discount: breakdown.applied,
        promoCode: breakdown.applied === 'PROMO' ? breakdown.promo?.code : undefined,
        hostedCheckout: Boolean(checkout),
      },
    });

    if (checkout) return { ...subscription, checkoutUrl: checkout.url, firstInvoice: null };

    // No hosted page (the development fake): the subscription starts now and the first
    // period is invoiced here, to be paid through the one-off checkout.
    const providerSubscription = await this.payments.createSubscription({
      customerId,
      planCode: plan.code,
      planName: plan.name,
      amountMinor: breakdown.periodPriceMinor,
      discount,
      currency: BILLING_CURRENCY,
      interval: intervalOf(plan.billingPeriod),
      idempotencyKey: `sub:${subscription.id}`,
    });
    const active = await this.activate(subscription.id, input.actorId, {
      providerSubscriptionId: providerSubscription.subscriptionId,
      currentPeriodStart: providerSubscription.currentPeriodStart,
      currentPeriodEnd: providerSubscription.currentPeriodEnd,
    });
    const firstInvoice = await this.invoiceSubscription(subscription.id, input.actorId, {
      allowProviderManaged: true,
    });
    return { ...active, checkoutUrl: null, firstInvoice };
  }

  /**
   * "Start with this teacher" — a guardian skips the free trial: one child, one course, a
   * teacher, a plan and weekly times, then the card page. The classes start as regular
   * ones from the first chosen time once the payment lands.
   *
   * Everything is checked before anything is written, then the child's TRIAL enrolment for
   * the course is created (or reused) with this teacher, the same row a won trial would
   * convert, and the rest is `subscribe` with those weekly times. So pricing (tier, period,
   * sibling, promo) and activation — enrolment ACTIVE and linked, weekly classes, the
   * notification, the CRM lead won — are the trial path's own code, not a copy of it.
   */
  async startWithTeacher(input: {
    familyId: string;
    studentId: string;
    courseId: string;
    /** Teacher profile id. */
    teacherId: string;
    planId: string;
    schedule: Omit<ScheduleChoice, 'enrolmentId' | 'teacherId'>;
    promoCode?: string;
    actorId: string;
    actorRoles: string[];
    returnBaseUrl?: string;
  }) {
    await this.assertMayManageFamily(
      input.actorId,
      input.familyId,
      input.actorRoles,
      'start_with_teacher',
    );

    const [student, course, plan] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: input.studentId, familyId: input.familyId },
        select: { id: true, displayName: true },
      }),
      this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, code: true, name: true, active: true },
      }),
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
    ]);
    // Not this family's child reads the same as no such child, so ids cannot be probed.
    if (!student) throw AppError.notFound('Student');
    if (!course || !course.active) throw AppError.notFound('Course');
    if (!plan || !plan.active) throw AppError.notFound('Plan');

    // FR-TCH-02: only a fully cleared teacher is offered to a family.
    await this.policies.assertTeacherMatchable(input.teacherId);
    await this.assertTeachesCourse(input.teacherId, course);

    // A child already learning this course changes plan or teacher instead; a second
    // enrolment would duplicate the course on their page and bill twice.
    const enrolled = await this.prisma.enrolment.findFirst({
      where: {
        studentId: student.id,
        courseId: course.id,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      select: { id: true },
    });
    if (enrolled) {
      throw AppError.conflict(
        'CONFLICT',
        `${student.displayName} is already enrolled in ${course.name}. Change that plan or teacher instead.`,
        { enrolmentId: enrolled.id },
      );
    }

    assertSlotsFitPlan(input.schedule.slots, plan);
    await this.assertWeeklyTimesOpen(input.teacherId, plan.classMinutes, input.schedule);

    // The row a trial would have made: an existing TRIAL enrolment for the course is
    // reused (a teacherless "ask the academy" request, or a trial not yet taught), so the
    // child never has the same course twice. Its teacher is only set here when it has
    // none; `activate` moves it to this teacher once the payment lands, so a trial still
    // booked with someone else keeps working if the family walks away from checkout.
    // Reusing the TRIAL row and, failing that, creating one is a check-then-create: two
    // concurrent starts for the same child+course would both miss and both insert. The
    // partial-unique `enrolment_student_course_live_key` (TRIAL/ACTIVE/PAUSED) now rejects
    // the second insert with P2002, so the pair runs in a transaction and the lost race
    // falls back to the live row the winner wrote rather than erroring out.
    let enrolmentId: string;
    try {
      enrolmentId = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.enrolment.findFirst({
          where: { studentId: student.id, courseId: course.id, status: 'TRIAL' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, teacherId: true },
        });
        if (existing) {
          if (!existing.teacherId) {
            await tx.enrolment.update({
              where: { id: existing.id },
              data: { teacherId: input.teacherId },
            });
          }
          return existing.id;
        }
        const created = await tx.enrolment.create({
          data: {
            studentId: student.id,
            courseId: course.id,
            teacherId: input.teacherId,
            status: 'TRIAL',
          },
          select: { id: true },
        });
        return created.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A concurrent start won the race. Reuse the live row it wrote: a TRIAL is the row
        // we would have made; an ACTIVE/PAUSED means the child is already enrolled, the
        // same conflict the ACTIVE/PAUSED check above raises.
        const live = await this.prisma.enrolment.findFirst({
          where: {
            studentId: student.id,
            courseId: course.id,
            status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
          },
          select: { id: true, status: true },
        });
        if (!live) throw error;
        if (live.status !== 'TRIAL') {
          throw AppError.conflict(
            'CONFLICT',
            `${student.displayName} is already enrolled in ${course.name}. Change that plan or teacher instead.`,
            { enrolmentId: live.id },
          );
        }
        enrolmentId = live.id;
      } else {
        throw error;
      }
    }

    return this.subscribe({
      familyId: input.familyId,
      planId: input.planId,
      actorId: input.actorId,
      actorRoles: input.actorRoles,
      returnBaseUrl: input.returnBaseUrl,
      promoCode: input.promoCode,
      schedule: { ...input.schedule, enrolmentId, teacherId: input.teacherId },
    });
  }

  /**
   * The subject rule `findOpenSlots` and booking use: the course code in the teacher's
   * subjects, or already teaching the course on an active schedule.
   */
  private async assertTeachesCourse(teacherId: string, course: { id: string; code: string }) {
    const teaches = await this.prisma.teacherProfile.count({
      where: {
        id: teacherId,
        OR: [
          { subjects: { has: course.code } },
          { schedules: { some: { status: 'ACTIVE', enrolment: { courseId: course.id } } } },
        ],
      },
    });
    if (teaches === 0) {
      throw AppError.badRequest('This teacher does not teach that course', {
        field: 'courseId',
        teacherId,
        courseCode: course.code,
      });
    }
  }

  /**
   * Each chosen weekly time must be one the teacher is free at, read exactly as the web's
   * weekly picker reads it (`useWeeklyOptions`): the teacher's open slots over the next
   * two weeks, in the family's zone, offered when free at least once. Without this a client
   * could pick 03:00 and the clash would only surface after the family had paid.
   */
  private async assertWeeklyTimesOpen(
    teacherId: string,
    classMinutes: number,
    schedule: Pick<ScheduleChoice, 'timeZone' | 'slots'>,
  ) {
    const now = Date.now();
    const open = await this.scheduling.findOpenSlots({
      teacherIds: [teacherId],
      from: new Date(now + DAY_MS),
      to: new Date(now + (WEEKLY_LOOKAHEAD_DAYS + 1) * DAY_MS),
      visitorZone: schedule.timeZone,
      durationMinutes: classMinutes,
      limit: 5_000,
    });
    const free = new Set(
      open
        .filter((s) => s.teacherId === teacherId)
        .map((s) => {
          const local = DateTime.fromJSDate(s.startsAt, { zone: schedule.timeZone });
          return `${WEEKDAY_CODES[local.weekday - 1]}|${local.toFormat('HH:mm')}`;
        }),
    );
    const taken = schedule.slots.filter((s) => !free.has(`${s.weekday}|${s.localTime}`));
    if (taken.length > 0) {
      throw AppError.badRequest('The teacher is not free at some of these times; choose others', {
        field: 'schedule',
        unavailable: taken,
      });
    }
  }

  /** Validates what the family chose (trial, weekly times) before anything is charged. */
  private async buildSetup(
    input: { familyId: string; trialOutcomeId?: string; schedule?: ScheduleChoice },
    plan: { classesPerWeek: number; classMinutes: number; roomType: string },
  ): Promise<SubscriptionSetup> {
    const setup: SubscriptionSetup = {};
    if (input.trialOutcomeId) {
      const outcome = await this.prisma.trialOutcome.findUnique({
        where: { id: input.trialOutcomeId },
        select: {
          id: true,
          won: true,
          class: { select: { students: { select: { student: { select: { familyId: true } } } } } },
        },
      });
      const families = new Set(outcome?.class.students.map((s) => s.student.familyId) ?? []);
      if (!outcome || !families.has(input.familyId)) throw AppError.notFound('Trial outcome');
      // A lost trial cancelled its enrolment; converting it would bill for a child the
      // teacher said not to continue with.
      if (!outcome.won) {
        throw AppError.conflict('CONFLICT', 'This trial did not end in a place to continue');
      }
      setup.trialOutcomeId = outcome.id;
    }
    const choice = input.schedule;
    if (choice) {
      assertSlotsFitPlan(choice.slots, plan);
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: choice.enrolmentId },
        select: { student: { select: { familyId: true } } },
      });
      if (!enrolment || enrolment.student.familyId !== input.familyId) {
        throw AppError.notFound('Enrolment');
      }
      setup.schedule = {
        ...choice,
        durationMinutes: plan.classMinutes,
        roomType: plan.roomType === 'CIRCLE' ? 'CIRCLE' : 'ONE_TO_ONE',
      };
    }
    return setup;
  }

  /**
   * Turns an INCOMPLETE subscription on: enrolments go ACTIVE and are linked to it, and the
   * weekly classes the family chose are created. Safe to call twice (webhooks redeliver).
   */
  private async activate(
    subscriptionId: string,
    actorId: string | null,
    provider: {
      providerSubscriptionId?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
    },
  ) {
    const current = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!current) throw AppError.notFound('Subscription');
    const setup = (current.setup ?? {}) as SubscriptionSetup;
    if (current.status !== 'INCOMPLETE' && setup.appliedAt) return current;

    const start = provider.currentPeriodStart ?? current.currentPeriodStart ?? new Date();
    const end =
      provider.currentPeriodEnd ??
      current.currentPeriodEnd ??
      addMonths(start, INTERVAL_MONTHS[intervalOf(current.plan.billingPeriod)]);
    // Converting from a trial flips the trial enrolments to active in the same breath,
    // because a paid subscription with TRIAL enrolments means the family is paying for
    // lessons that are not scheduled. The ids are read first so the activation below is a
    // single atomic write.
    const enrolmentIds = new Set<string>();
    if (setup.schedule) enrolmentIds.add(setup.schedule.enrolmentId);
    if (setup.trialOutcomeId) {
      const outcome = await this.prisma.trialOutcome.findUnique({
        where: { id: setup.trialOutcomeId },
        select: {
          enrolmentId: true,
          class: { select: { courseId: true, students: { select: { studentId: true } } } },
        },
      });
      if (outcome?.enrolmentId) {
        enrolmentIds.add(outcome.enrolmentId);
      } else if (outcome) {
        const rows = await this.prisma.enrolment.findMany({
          where: {
            studentId: { in: outcome.class.students.map((s) => s.studentId) },
            courseId: outcome.class.courseId,
            status: { in: ['TRIAL', 'ACTIVE'] },
          },
          select: { id: true },
        });
        rows.forEach((r) => enrolmentIds.add(r.id));
      }
    }

    // INT-F5: the subscription going ACTIVE and its enrolments going ACTIVE are one unit.
    // A crash between them would leave a paid subscription whose lessons are still TRIAL
    // (or the reverse), so both writes commit together or not at all. Scheduling stays
    // outside this transaction on purpose: a clash there must not roll back a payment that
    // has already been taken — that is the `scheduleError` escape handled below.
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: current.status === 'INCOMPLETE' ? 'ACTIVE' : current.status,
          providerSubscriptionId:
            provider.providerSubscriptionId ?? current.providerSubscriptionId,
          currentPeriodStart: start,
          currentPeriodEnd: end,
        },
      });
      if (enrolmentIds.size > 0) {
        await tx.enrolment.updateMany({
          where: { id: { in: [...enrolmentIds] }, status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] } },
          data: { status: 'ACTIVE', startedAt: new Date(), subscriptionId },
        });
      }
    });

    // The payment is confirmed, so the promo code is counted now and not at checkout: a
    // family that walks away from the card page has not used it up.
    await this.redeemPromo(current);

    // The family is paying now: their CRM lead is won.
    await leadWon(this.prisma, current.familyId).catch((err) =>
      this.logger.warn(
        `CRM lead not updated for family ${current.familyId}: ${(err as Error).message}`,
      ),
    );

    const applied: SubscriptionSetup = { ...setup, appliedAt: new Date().toISOString() };
    if (setup.schedule && !setup.scheduleIds?.length) {
      try {
        applied.scheduleIds = await this.createWeeklyClasses(setup.schedule);
        await this.prisma.enrolment.update({
          where: { id: setup.schedule.enrolmentId },
          data: { teacherId: setup.schedule.teacherId },
        });
      } catch (error) {
        // The family has paid; a clash must not lose the payment. Staff see the error on
        // the subscription and set the times by hand.
        applied.scheduleError = (error as Error).message;
        this.logger.error(
          `Could not create weekly classes for subscription ${subscriptionId}: ${applied.scheduleError}`,
        );
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { setup: asJson(applied) },
    });
    await this.audit.record({
      actorId,
      action: 'bil.subscription.activate',
      targetType: 'subscription',
      targetId: subscriptionId,
      after: {
        enrolments: [...enrolmentIds],
        scheduleIds: applied.scheduleIds ?? [],
        scheduleError: applied.scheduleError ?? null,
      },
    });
    await this.notifyFamily(current.familyId, TEMPLATE.BILLING_SUBSCRIBED, {
      planName: current.plan.name,
      schedule:
        setup.schedule && applied.scheduleIds?.length
          ? `${describeSlots(setup.schedule.slots)} (${setup.schedule.timeZone})`
          : 'the academy will agree the times with you',
      renewsOn: formatDay(end),
    });
    return updated;
  }

  private async redeemPromo(subscription: {
    id: string;
    familyId: string;
    discountBreakdown?: unknown;
  }) {
    const breakdown = readBreakdown(subscription.discountBreakdown);
    if (breakdown?.applied !== 'PROMO' || !breakdown.promo) return;
    try {
      const outcome = await this.promos.redeem({
        promoCodeId: breakdown.promo.promoCodeId,
        subscriptionId: subscription.id,
        familyId: subscription.familyId,
        discountMinor: breakdown.extraDiscountMinor,
      });
      await this.audit.record({
        actorId: SYSTEM_ACTOR,
        action: outcome === 'redeemed' ? 'bil.promo.redeem' : 'bil.promo.redeem_skipped',
        targetType: 'subscription',
        targetId: subscription.id,
        after: { code: breakdown.promo.code, discountMinor: breakdown.extraDiscountMinor },
      });
    } catch (error) {
      // The family has paid; a counting failure must not undo their plan. It is logged so
      // the limit can be corrected by hand.
      this.logger.error(
        `Promo ${breakdown.promo.code} not counted for subscription ${subscription.id}: ${(error as Error).message}`,
      );
    }
  }

  /** One recurring schedule per distinct start time, covering every day chosen at it. */
  private async createWeeklyClasses(
    choice: NonNullable<SubscriptionSetup['schedule']>,
  ): Promise<string[]> {
    const byTime = new Map<string, WeekdayCode[]>();
    for (const slot of choice.slots) {
      byTime.set(slot.localTime, [...(byTime.get(slot.localTime) ?? []), slot.weekday]);
    }
    const ids: string[] = [];
    try {
      for (const [localTime, days] of byTime) {
        const ordered = WEEKDAY_CODES.filter((d) => days.includes(d));
        const created = await this.scheduling.createRecurringSchedule({
          enrolmentId: choice.enrolmentId,
          teacherId: choice.teacherId,
          rrule: `FREQ=WEEKLY;BYDAY=${ordered.join(',')}`,
          localStartTime: localTime,
          familyTimeZone: choice.timeZone,
          durationMinutes: choice.durationMinutes,
          roomType: choice.roomType,
          startsOn: choice.startsOn,
        });
        ids.push(created.scheduleId);
      }
    } catch (error) {
      // All the chosen times or none: a half-made week would keep teaching the days that
      // did fit while the subscription reports a scheduling error, and nobody would know
      // those classes were never asked for on their own.
      await this.removeSchedules(ids);
      throw error;
    }
    return ids;
  }

  /** Removes schedules made moments ago, with the classes they materialised. */
  private async removeSchedules(ids: string[]) {
    if (ids.length === 0) return;
    try {
      await this.prisma.classSession.deleteMany({ where: { scheduleId: { in: ids } } });
      await this.prisma.recurringSchedule.deleteMany({ where: { id: { in: ids } } });
    } catch (error) {
      this.logger.error(
        `Could not remove partly created schedules ${ids.join(', ')}: ${(error as Error).message}`,
      );
    }
  }

  /** Stripe's hosted page for the card on file and receipts (FR-PAR-06). */
  async billingPortal(familyId: string, returnUrl: string, actorId: string, actorRoles: string[]) {
    await this.assertMayManageFamily(actorId, familyId, actorRoles, 'portal');
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { paymentCustomerId: true },
    });
    if (!family?.paymentCustomerId) {
      throw AppError.conflict('CONFLICT', 'There is no card on file for this family yet');
    }
    const portal = await this.payments.createBillingPortal(family.paymentCustomerId, returnUrl);
    if (!portal) {
      throw AppError.conflict('CONFLICT', 'Card management is not available on this deployment');
    }
    return portal;
  }

  /**
   * Trial results waiting for the family to continue (FR-ADM-05): the level, the teacher
   * and the recommended plan with its price, for each child whose trial was won and who is
   * not on a paid plan yet.
   */
  async trialOffers(userId: string) {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });
    if (memberships.length === 0) return [];
    const familyIds = memberships.map((m) => m.familyId);
    // Keyed on the result, not the enrolment: a won trial stays TRIAL until it is paid for.
    // ACTIVE covers trials won before that, which were made ACTIVE on the spot.
    const outcomes = await this.prisma.trialOutcome.findMany({
      where: {
        won: true,
        enrolment: {
          status: { in: ['TRIAL', 'ACTIVE'] },
          subscriptionId: null,
          student: { familyId: { in: familyIds } },
        },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        notes: true,
        completedAt: true,
        placementLevel: { select: { id: true, name: true, position: true } },
        recommendedPlan: {
          select: {
            id: true,
            code: true,
            name: true,
            classesPerWeek: true,
            classMinutes: true,
            roomType: true,
            billingPeriod: true,
          },
        },
        class: {
          select: {
            id: true,
            startsAt: true,
            teacher: {
              select: {
                id: true,
                tierId: true,
                tier: { select: { code: true, name: true, badgeIcon: true, description: true } },
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
        enrolment: {
          select: {
            id: true,
            student: { select: { id: true, displayName: true, familyId: true } },
            course: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    // PROD-06: pre-batch the plan+tier price lookups into one pass, keyed by (planId,
    // tierId), instead of a query per outcome inside the map (N+1).
    const priceByKey = await this.periodPricesFor(
      outcomes
        .filter((o) => o.recommendedPlan)
        .map((o) => ({ planId: o.recommendedPlan!.id, tierId: o.class.teacher?.tierId ?? null })),
    );
    return outcomes.map((o) => {
      const familyId = o.enrolment?.student.familyId ?? '';
      const price = o.recommendedPlan
        ? (priceByKey.get(BillingService.priceKey(o.recommendedPlan.id, o.class.teacher?.tierId)) ??
          null)
        : null;
      return {
        trialOutcomeId: o.id,
        completedAt: o.completedAt,
        notes: o.notes,
        familyId,
        currency: BILLING_CURRENCY,
        enrolmentId: o.enrolment?.id ?? null,
        student: o.enrolment
          ? { id: o.enrolment.student.id, displayName: o.enrolment.student.displayName }
          : null,
        course: o.enrolment?.course ?? null,
        placementLevel: o.placementLevel,
        teacher: o.class.teacher
          ? {
              id: o.class.teacher.id,
              userId: o.class.teacher.user.id,
              name: o.class.teacher.user.name,
              tierId: o.class.teacher.tierId,
              tier: o.class.teacher.tier,
            }
          : null,
        recommendedPlan: o.recommendedPlan
          ? {
              ...o.recommendedPlan,
              price: price ? { currency: price.currency, amountMinor: price.amountMinor } : null,
            }
          : null,
      };
    });
  }

  private async ensureCustomer(familyId: string, name: string, actorId: string): Promise<string> {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: {
        paymentCustomerId: true,
        members: { select: { user: { select: { email: true } }, isPrimary: true } },
      },
    });
    // A customer id minted by another adapter (the development fake before Stripe was
    // switched on) is unknown to this one, so a new customer is created in its place.
    const stale =
      family?.paymentCustomerId &&
      this.payments.name === 'stripe' &&
      !family.paymentCustomerId.startsWith('cus_');
    if (family?.paymentCustomerId && !stale) return family.paymentCustomerId;

    const email = family?.members.find((m) => m.isPrimary)?.user.email ?? 'billing@example.invalid';
    const { customerId } = await this.payments.createCustomer({ familyId, email, name });

    await this.prisma.family.update({
      where: { id: familyId },
      data: { paymentCustomerId: customerId },
    });
    await this.audit.record({
      actorId,
      action: 'bil.customer.create',
      targetType: 'family',
      targetId: familyId,
      after: { customerId },
    });

    return customerId;
  }

  /** Cancels at period end by default (FR-BIL-06) — never immediately, by surprise. */
  async cancel(
    subscriptionId: string,
    atPeriodEnd: boolean,
    actorId: string,
    actorRoles: string[] = [],
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    // CR-10 — ownership is checked before the status branch so a non-member cannot
    // learn a subscription's state from the error message.
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'cancel');
    if (subscription.status === 'CANCELLED') {
      throw AppError.conflict('CONFLICT', 'Subscription is already cancelled');
    }
    if (subscription.status === 'INCOMPLETE') {
      throw AppError.conflict(
        'CONFLICT',
        'This plan has not started yet: its payment was never completed',
      );
    }

    if (subscription.providerSubscriptionId) {
      await this.payments.cancelSubscription(subscription.providerSubscriptionId, atPeriodEnd);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: atPeriodEnd
        ? { cancelAtPeriodEnd: true }
        : { status: 'CANCELLED', cancelAtPeriodEnd: false },
    });
    if (!atPeriodEnd) await this.endAccess(subscriptionId, actorId, new Date());
    else {
      const plan = await this.prisma.plan.findUnique({
        where: { id: subscription.planId },
        select: { name: true },
      });
      await this.notifyFamily(subscription.familyId, TEMPLATE.BILLING_PLAN_ENDING, {
        planName: plan?.name ?? 'Your plan',
        endsOn: formatDay(subscription.currentPeriodEnd ?? new Date()),
      });
    }

    await this.audit.record({
      actorId,
      action: 'bil.subscription.cancel',
      targetType: 'subscription',
      targetId: subscriptionId,
      before: { status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd },
      after: { status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd },
    });

    return updated;
  }

  /** Pauses a subscription (FR-BIL-07). */
  async pause(subscriptionId: string, days: number, actorId: string, actorRoles: string[] = []) {
    const maxDays = 30; // MAX_SUBSCRIPTION_PAUSE_DAYS
    if (!Number.isFinite(days) || days < 1 || days > maxDays) {
      throw AppError.badRequest(`A pause must be between 1 and ${maxDays} days`, { days });
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'pause');
    if (subscription.status === 'CANCELLED' || subscription.status === 'INCOMPLETE') {
      throw AppError.conflict(
        'CONFLICT',
        `A ${subscription.status.toLowerCase()} subscription cannot be paused`,
      );
    }

    const until = new Date(Date.now() + days * 864e5);
    if (subscription.providerSubscriptionId) {
      await this.payments.pauseSubscription(subscription.providerSubscriptionId, until);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'PAUSED', pausedUntil: until },
    });

    await this.audit.record({
      actorId,
      action: 'bil.subscription.pause',
      targetType: 'subscription',
      targetId: subscriptionId,
      after: { pausedUntil: until },
    });

    return updated;
  }

  async resume(subscriptionId: string, actorId: string, actorRoles: string[] = []) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'resume');
    if (subscription.status !== 'PAUSED') {
      throw AppError.conflict('CONFLICT', `Subscription is ${subscription.status}, not paused`);
    }

    if (subscription.providerSubscriptionId) {
      await this.payments.resumeSubscription(subscription.providerSubscriptionId);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE', pausedUntil: null },
    });

    await this.audit.record({
      actorId,
      action: 'bil.subscription.resume',
      targetType: 'subscription',
      targetId: subscriptionId,
      after: { status: 'ACTIVE' },
    });

    return updated;
  }

  // ── Invoicing ────────────────────────────────────────────────────────────

  /**
   * Issues an invoice for a subscription period (FR-BIL-03).
   *
   * The invoice number is `INV-<year>-<8 hex>`, not a sequential integer. A gap in a
   * visible invoice sequence invites fraud; a random suffix with a year prefix is
   * unique, ordered well enough to file by, and cannot be guessed.
   */
  async invoiceSubscription(
    subscriptionId: string,
    actorId: string,
    options: {
      discountMinor?: number;
      idempotencyKey?: string;
      /** Internal: the subscribe flow invoices its own just-activated development subscription. */
      allowProviderManaged?: boolean;
    } = {},
  ) {
    if (options.idempotencyKey) {
      const replay = await this.prisma.invoice.findUnique({
        where: { idempotencyKey: options.idempotencyKey },
      });
      if (replay) {
        if (replay.subscriptionId !== subscriptionId) {
          throw AppError.conflict(
            'CONFLICT',
            'Idempotency-Key was already used for another invoice',
          );
        }
        return replay;
      }
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, family: true },
    });
    if (!subscription) throw AppError.notFound('Subscription');

    // A card subscriber is billed by the provider on its own schedule; a manual invoice on
    // top would charge the family twice for the same period.
    if (subscription.providerSubscriptionId && !options.allowProviderManaged) {
      throw AppError.conflict(
        'CONFLICT',
        'This subscription is billed by the payment provider; manual invoices are not issued for it',
        { subscriptionId },
      );
    }

    // The price the family signed up at. Rows from before it was locked have none and are
    // billed at the current price, as they always were.
    if (subscription.amountMinor === null) assertPricedInUsd(subscription, 'invoice it');
    const locked =
      subscription.amountMinor ??
      (await this.periodPriceFor(subscription.planId, subscription.tierId)).amountMinor;
    // A sibling or promo discount is shown on the invoice as a discount line, the way the
    // provider's invoice shows its coupon; the total is still the locked price.
    const breakdown = readBreakdown(subscription.discountBreakdown);
    const lockedDiscount =
      breakdown && breakdown.finalMinor === locked ? breakdown.extraDiscountMinor : 0;

    // A discount is rejected rather than clamped. Clamping would silently turn an operator
    // typo (9,999 instead of 999) into a free month for the family, which is exactly the
    // kind of revenue error nobody notices until month end. A genuinely free invoice is
    // still expressible by passing a discount exactly equal to the subtotal.
    const extra = options.discountMinor ?? 0;
    if (extra < 0)
      throw AppError.badRequest('Discount cannot be negative', { discountMinor: extra });
    if (extra > locked) {
      throw AppError.badRequest('Discount cannot exceed the subtotal', {
        discountMinor: extra,
        subtotalMinor: locked,
      });
    }

    const subtotal = locked + lockedDiscount;
    const discount = lockedDiscount + extra;
    const total = locked - extra;

    const dueDays = await this.settings.getNumber('billing.invoice_due_days');
    const dueDaysSafe = Number.isFinite(dueDays) && dueDays > 0 ? Math.floor(dueDays) : 7;

    const invoice = await this.prisma.invoice.create({
      data: {
        familyId: subscription.familyId,
        subscriptionId: subscription.id,
        number: invoiceNumber(),
        currency: subscription.currency,
        subtotalMinor: subtotal,
        discountMinor: discount,
        totalMinor: total,
        status: 'OPEN',
        dueAt: new Date(Date.now() + dueDaysSafe * 864e5),
        idempotencyKey: options.idempotencyKey,
      },
    });

    await this.audit.record({
      actorId,
      action: 'bil.invoice.issue',
      targetType: 'invoice',
      targetId: invoice.id,
      after: {
        number: invoice.number,
        subtotalMinor: subtotal,
        discountMinor: discount,
        totalMinor: total,
      },
    });

    return invoice;
  }

  /** Starts a hosted checkout for an open invoice (FR-BIL-03). */
  async startCheckout(
    invoiceId: string,
    successUrl: string,
    cancelUrl: string,
    idempotencyKey: string,
    actorId: string,
    actorRoles: string[] = [],
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { family: { select: { id: true, paymentCustomerId: true } } },
    });
    if (!invoice) throw AppError.notFound('Invoice');
    // CR-10 — a guardian may only pay an invoice for their own family.
    await this.assertMayManageFamily(actorId, invoice.family.id, actorRoles, 'checkout');
    if (invoice.status === 'PAID') throw AppError.conflict('CONFLICT', 'Invoice is already paid');
    if (invoice.status === 'VOID') throw AppError.conflict('CONFLICT', 'Invoice has been voided');

    const session = await this.payments.createCheckout({
      familyId: invoice.family.id,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      customerId: invoice.family.paymentCustomerId,
      successUrl,
      cancelUrl,
      idempotencyKey,
      metadata: { invoiceNumber: invoice.number, invoiceId: invoice.id },
    });

    return session;
  }

  /**
   * Applies a payment webhook (FR-BIL-04).
   *
   * Idempotent by `providerPaymentId`, which carries a unique constraint: the same
   * webhook delivered twice updates one row instead of double-marking the invoice paid.
   * Webhooks are the only place a payment's truth enters the system, so this is also
   * where an invoice that was voided is refused — money arriving for an invoice the
   * school has written off must not silently mark it settled.
   */
  async handlePaymentEvent(
    event: {
      type: string;
      providerPaymentId?: string;
      providerSubscriptionId?: string;
      invoiceNumber?: string;
      amountMinor?: number;
      occurredAt: Date;
    } & Partial<
      Pick<
        PaymentWebhookEvent,
        'reference' | 'invoice' | 'subscription' | 'paymentStatus' | 'refunds'
      >
    >,
  ): Promise<{
    applied: boolean;
    reason?: string;
  }> {
    if (
      event.type === 'subscription_checkout_completed' ||
      event.type === 'invoice_paid' ||
      event.type === 'invoice_failed' ||
      (event.type === 'subscription_updated' && event.subscription) ||
      event.type === 'subscription_cancelled'
    ) {
      return this.applyRecurringEvent(event as PaymentWebhookEvent);
    }

    if (event.type === 'payment_succeeded' && event.providerPaymentId && event.invoiceNumber) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { number: event.invoiceNumber },
        include: { payments: true },
      });
      if (!invoice) return { applied: false, reason: 'unknown invoice' };

      if (invoice.status === 'VOID') {
        // Refund-or-record: the money genuinely arrived, so it is recorded as a payment
        // and the invoice stays voided. Reconciliation then shows an unmatched credit
        // for a human to refund properly.
        await this.prisma.payment.upsert({
          where: { providerPaymentId: event.providerPaymentId },
          create: {
            invoiceId: invoice.id,
            provider: this.providerCode,
            providerPaymentId: event.providerPaymentId,
            method: 'CARD',
            amountMinor: event.amountMinor ?? invoice.totalMinor,
            currency: invoice.currency,
            status: 'SUCCEEDED',
          },
          update: {},
        });
        return { applied: false, reason: 'invoice is void; payment recorded for reconciliation' };
      }

      const attempt = invoice.payments.length + 1;

      // INT-F3: recording the payment, settling the invoice and reactivating the
      // subscription are one settlement — a crash between them would leave a covered
      // invoice OPEN, or an invoice PAID whose subscription is still PAST_DUE. Idempotency
      // is unchanged: the upsert keys on the unique `providerPaymentId`, so a redelivered
      // webhook still folds into the one row rather than double-counting the payment.
      const covered = await this.prisma.$transaction(async (tx) => {
        await tx.payment.upsert({
          where: { providerPaymentId: event.providerPaymentId },
          create: {
            invoiceId: invoice.id,
            provider: this.providerCode,
            providerPaymentId: event.providerPaymentId!,
            method: 'CARD',
            amountMinor: event.amountMinor ?? invoice.totalMinor,
            currency: invoice.currency,
            status: 'SUCCEEDED',
            attempt,
          },
          update: { status: 'SUCCEEDED', failureReason: null },
        });

        // Only mark paid when the payment actually covers the invoice. A partial payment
        // leaving the invoice OPEN is correct; marking it PAID would lose revenue.
        const totalPaid = await tx.payment.aggregate({
          where: { invoiceId: invoice.id, status: 'SUCCEEDED' },
          _sum: { amountMinor: true },
        });
        const isCovered = (totalPaid._sum.amountMinor ?? 0) >= invoice.totalMinor;

        if (isCovered && invoice.status !== 'PAID') {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'PAID', paidAt: event.occurredAt },
          });
          // Only this invoice's subscription. `id: undefined` would drop the filter in
          // Prisma and reactivate every PAST_DUE subscription for one unlinked invoice.
          if (invoice.subscriptionId) {
            await tx.subscription.updateMany({
              where: { id: invoice.subscriptionId, status: 'PAST_DUE' },
              data: { status: 'ACTIVE' },
            });
          }
        }
        return isCovered;
      });

      return { applied: true, reason: covered ? 'invoice settled' : 'partial payment recorded' };
    }

    if (event.type === 'payment_failed' && event.providerPaymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: event.providerPaymentId },
        include: { invoice: { select: { id: true, subscriptionId: true, totalMinor: true } } },
      });
      if (!payment) return { applied: false, reason: 'unknown payment' };

      // INT-F3 (mirror): the payment, its invoice and the subscription move to the failed
      // state together, so a redelivered webhook never leaves an invoice FAILED while its
      // subscription is still ACTIVE (or the reverse).
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });

        await tx.invoice.update({
          where: { id: payment.invoice.id },
          data: { status: 'FAILED' },
        });

        // A failed payment past the grace period puts the subscription PAST_DUE, which is
        // what triggers the dunning sequence. Access is not cut here — that is the
        // dunning worker's decision after the retries are exhausted.
        if (payment.invoice.subscriptionId) {
          await tx.subscription.updateMany({
            where: { id: payment.invoice.subscriptionId, status: 'ACTIVE' },
            data: { status: 'PAST_DUE' },
          });
        }
      });

      // Start the retry ladder here rather than waiting for the nightly sweep, so a
      // family whose card expired gets a second chance within the day instead of the
      // next morning (FR-BIL-05, DUNNING_RETRY_DAYS).
      await this.queues
        .addDelayed(QUEUE.BILLING, 'schedule-retries', { invoiceId: payment.invoice.id }, 0, {
          // A stable id collapses the duplicate jobs a redelivered webhook would
          // enqueue, so one failed payment cannot advance the retry ladder twice.
          jobId: `dunning-schedule:${payment.invoice.id}`,
        })
        .catch((error: Error) => {
          this.logger.error(
            `Could not schedule dunning for invoice ${payment.invoice.id}: ${error.message}`,
          );
        });

      return { applied: true };
    }

    if (
      event.type === 'refund_created' &&
      event.providerPaymentId &&
      (event.amountMinor || event.refunds?.length)
    ) {
      return this.applyProviderRefunds({
        providerPaymentId: event.providerPaymentId,
        refunds: event.refunds ?? [],
        cumulativeMinor: event.amountMinor,
      });
    }

    return { applied: false, reason: `unhandled event ${event.type}` };
  }

  /**
   * Records provider refunds once each.
   *
   * 1. **By refund id** when the event carries ids: an id already on record is skipped. An
   *    unknown id first claims an unlinked row of the same amount (the row `refund()` wrote
   *    before the provider answered, or one recorded by the old total-only rule), so the
   *    same money is not recorded twice under two rows.
   * 2. **By the charge's refunded total** as the fallback, for events without ids: only the
   *    part not yet on record is new.
   *
   * Either way the total on record never passes what the provider says was refunded (or,
   * without that figure, what was paid).
   */
  private async applyProviderRefunds(input: {
    providerPaymentId: string;
    refunds: Array<{ id: string; amountMinor: number }>;
    cumulativeMinor?: number;
  }): Promise<{ applied: boolean; reason?: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerPaymentId: input.providerPaymentId },
      include: {
        // Newest first, so an unknown id claims the row `refund()` has just written before
        // any older row of the same amount.
        refunds: {
          select: { id: true, amountMinor: true, providerRefundId: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!payment) return { applied: false, reason: 'unknown payment' };

    const ceiling = input.cumulativeMinor ?? payment.amountMinor;
    let recorded = payment.refunds.reduce((sum, r) => sum + r.amountMinor, 0);
    const known = new Set(payment.refunds.map((r) => r.providerRefundId).filter(Boolean));
    // A row the total-only fallback wrote carries a derived `reconciled:` id for idempotency
    // (INT-F4), not a real provider id, so it is still claimable by amount: an id-bearing
    // event links the real id onto it rather than recording the same money a second time.
    const unlinked = payment.refunds.filter(
      (r) => !r.providerRefundId || r.providerRefundId.startsWith('reconciled:'),
    );
    let added = 0;
    let linked = 0;

    for (const refund of input.refunds) {
      if (known.has(refund.id)) continue;
      known.add(refund.id);
      const match = unlinked.findIndex((r) => r.amountMinor === refund.amountMinor);
      if (match >= 0) {
        const [row] = unlinked.splice(match, 1);
        await this.prisma.refund.update({
          where: { id: row.id },
          data: { providerRefundId: refund.id },
        });
        linked += 1;
        continue;
      }
      // Already covered by older rows without ids that do not match one for one.
      if (recorded + refund.amountMinor > ceiling) continue;
      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountMinor: refund.amountMinor,
          reason: 'Provider refund',
          issuedById: PROVIDER_REFUND_ACTOR,
          providerRefundId: refund.id,
        },
      });
      recorded += refund.amountMinor;
      added += refund.amountMinor;
    }

    if (input.cumulativeMinor !== undefined && input.cumulativeMinor > recorded) {
      const delta = input.cumulativeMinor - recorded;
      // INT-F4: the total-only fallback has no provider refund id to key on, so two
      // redelivered (or concurrent) webhooks carrying the same refunded total would each
      // record the delta — double-counting the refund. A derived key makes it idempotent:
      // the `reconciled:` namespace never collides with a real provider refund id
      // (`re_…`), and the unique constraint rejects the second write. The transaction plus
      // P2002 catch turns that race into a no-op rather than an error.
      const reconciledKey = `reconciled:${payment.invoiceId}:${input.cumulativeMinor}`;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.refund.create({
            data: {
              paymentId: payment.id,
              amountMinor: delta,
              reason: 'Provider refund',
              issuedById: PROVIDER_REFUND_ACTOR,
              providerRefundId: reconciledKey,
            },
          });
        });
        recorded += delta;
        added += delta;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        // A redelivered or concurrent webhook already recorded this reconciled total;
        // nothing more to add.
      }
    }

    if (added === 0) {
      return {
        applied: linked > 0,
        reason: linked > 0 ? 'refund ids recorded' : 'refund already recorded',
      };
    }
    // Same rule as `refund()`: only money fully given back undoes the payment. A partial
    // refund leaves it SUCCEEDED and the invoice as it was.
    if (recorded >= payment.amountMinor) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'REFUNDED' },
      });
    }
    return { applied: true, reason: `refund of ${added} recorded` };
  }

  /**
   * The newest subscriptions, invoices and payments with the family's name, so the admin
   * tools pick a record from a list instead of pasting its id (FR-OPS-03).
   */
  async adminLookups(filter: { q?: string; limit?: number } = {}) {
    // Searching on the server means a family older than the newest 200 records can still be
    // found; without `q` the picker shows the newest, as before.
    const q = filter.q?.trim();
    const take = Math.min(Math.max(filter.limit ?? 200, 1), 200);
    const familyMatch = q
      ? { family: { name: { contains: q, mode: 'insensitive' as const } } }
      : {};
    const [subscriptions, invoices, payments] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { status: { not: 'INCOMPLETE' }, ...familyMatch },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          status: true,
          currency: true,
          createdAt: true,
          plan: { select: { name: true } },
          family: { select: { name: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: q
          ? {
              OR: [
                { number: { contains: q, mode: 'insensitive' as const } },
                { family: { name: { contains: q, mode: 'insensitive' as const } } },
              ],
            }
          : {},
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          number: true,
          status: true,
          totalMinor: true,
          currency: true,
          createdAt: true,
          dueAt: true,
          paidAt: true,
          hostedUrl: true,
          providerInvoiceId: true,
          family: { select: { name: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: { in: ['SUCCEEDED', 'REFUNDED'] },
          ...(q
            ? {
                invoice: {
                  OR: [
                    { number: { contains: q, mode: 'insensitive' as const } },
                    { family: { name: { contains: q, mode: 'insensitive' as const } } },
                  ],
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          status: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
          invoice: { select: { number: true, family: { select: { name: true } } } },
          refunds: { select: { amountMinor: true } },
        },
      }),
    ]);
    return {
      subscriptions,
      // `source` says who bills it: Stripe (card subscription) or the academy by hand.
      invoices: invoices.map(({ providerInvoiceId, ...inv }) => ({
        ...inv,
        source: providerInvoiceId ? 'CARD' : 'MANUAL',
      })),
      // What is left to refund on each payment, so the refund form can cap the amount.
      payments: payments.map(({ refunds, ...p }) => {
        const refundedMinor = refunds.reduce((sum, r) => sum + r.amountMinor, 0);
        return { ...p, refundedMinor, refundableMinor: Math.max(0, p.amountMinor - refundedMinor) };
      }),
    };
  }

  /**
   * All invoices, newest first, paginated and filterable — the admin invoices table.
   * `source` is derived from `providerInvoiceId` (Stripe card bill vs academy-issued),
   * so it is translated to a `providerInvoiceId` predicate rather than a stored column.
   */
  async listInvoices(opts: {
    status?: 'DRAFT' | 'OPEN' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOID';
    source?: 'CARD' | 'MANUAL';
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.InvoiceWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.source === 'CARD' ? { providerInvoiceId: { not: null } } : {}),
      ...(opts.source === 'MANUAL' ? { providerInvoiceId: null } : {}),
    };
    const [invoices, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: opts.skip ?? 0,
        take: opts.take ?? 20,
        select: {
          id: true,
          number: true,
          status: true,
          totalMinor: true,
          currency: true,
          createdAt: true,
          dueAt: true,
          paidAt: true,
          hostedUrl: true,
          providerInvoiceId: true,
          family: { select: { name: true } },
          subscription: { select: { discountBreakdown: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    const items = invoices.map(({ providerInvoiceId, subscription, ...inv }) => ({
      ...inv,
      source: providerInvoiceId ? 'CARD' : 'MANUAL',
      // Which discounts priced the subscription this invoice bills (period, sibling, promo).
      discount: readBreakdown(subscription?.discountBreakdown),
    }));
    return { items, total };
  }

  // ── Price list and plans (FR-OPS-05, tier pricing) ─────────────────────────

  /**
   * Every plan with its standard price and its tier prices (USD), and the
   * tier catalogue — one read for the admin price editor (replaces one call per price).
   */
  async adminPriceList() {
    const [plans, tiers] = await Promise.all([
      this.prisma.plan.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          classesPerWeek: true,
          classMinutes: true,
          roomType: true,
          billingPeriod: true,
          periodDiscountPercent: true,
          active: true,
          tierId: true,
          prices: { where: { currency: BILLING_CURRENCY }, select: { amountMinor: true } },
          tierPrices: {
            where: { currency: BILLING_CURRENCY },
            select: { tierId: true, amountMinor: true },
          },
          _count: {
            select: {
              subscriptions: { where: { status: { in: ['ACTIVE', 'PAST_DUE', 'PAUSED'] } } },
            },
          },
        },
      }),
      this.prisma.teacherTier.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          badgeIcon: true,
          active: true,
          _count: { select: { teachers: true } },
        },
      }),
    ]);
    return {
      currency: BILLING_CURRENCY,
      tiers: tiers.map(({ _count, ...t }) => ({ ...t, teacherCount: _count.teachers })),
      plans: plans.map(({ _count, ...p }) => ({ ...p, liveSubscriptions: _count.subscriptions })),
    };
  }

  /**
   * Sets one price: the plan's standard price (`tierId` null) or its price with a tier's
   * teachers. `amountMinor` null removes a tier price so the standard price applies again.
   * Families already subscribed keep the price they signed up at; new subscriptions and
   * plan changes use the new one.
   */
  async setPrice(input: {
    planId: string;
    tierId: string | null;
    amountMinor: number | null;
    actorId: string;
  }) {
    const currency = BILLING_CURRENCY;
    if (
      input.amountMinor !== null &&
      (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)
    ) {
      throw AppError.badRequest('A price must be a whole number of minor units above zero');
    }
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
      select: { id: true },
    });
    if (!plan) throw AppError.notFound('Plan');

    let before: number | null = null;
    if (input.tierId) {
      const tier = await this.prisma.teacherTier.findUnique({
        where: { id: input.tierId },
        select: { id: true },
      });
      if (!tier) throw AppError.notFound('Teacher tier');
      const key = { planId_tierId_currency: { planId: plan.id, tierId: tier.id, currency } };
      before = (await this.prisma.planTierPrice.findUnique({ where: key }))?.amountMinor ?? null;
      if (input.amountMinor === null) {
        await this.prisma.planTierPrice.deleteMany({
          where: { planId: plan.id, tierId: tier.id, currency },
        });
      } else {
        await this.prisma.planTierPrice.upsert({
          where: key,
          create: { planId: plan.id, tierId: tier.id, currency, amountMinor: input.amountMinor },
          update: { amountMinor: input.amountMinor },
        });
      }
    } else {
      if (input.amountMinor === null) {
        throw AppError.badRequest(
          'A plan needs a standard price; set a new one instead of removing it',
        );
      }
      const key = { planId_currency: { planId: plan.id, currency } };
      before = (await this.prisma.planPrice.findUnique({ where: key }))?.amountMinor ?? null;
      await this.prisma.planPrice.upsert({
        where: key,
        create: { planId: plan.id, currency, amountMinor: input.amountMinor },
        update: { amountMinor: input.amountMinor },
      });
    }

    await this.audit.record({
      actorId: input.actorId,
      action: 'bil.price.set',
      targetType: 'plan',
      targetId: plan.id,
      before: { tierId: input.tierId, currency, amountMinor: before },
      after: { tierId: input.tierId, currency, amountMinor: input.amountMinor },
    });
    return { planId: plan.id, tierId: input.tierId, currency, amountMinor: input.amountMinor };
  }

  /** Creates a plan (FR-OPS-05); it needs at least one standard price before families see a price. */
  async createPlan(
    input: {
      code: string;
      name: string;
      classesPerWeek: number;
      classMinutes: number;
      roomType: 'ONE_TO_ONE' | 'CIRCLE';
      billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY';
      periodDiscountPercent?: number;
    },
    actorId: string,
  ) {
    const code = input.code.trim().toUpperCase();
    if (await this.prisma.plan.findUnique({ where: { code }, select: { id: true } })) {
      throw AppError.conflict('CONFLICT', `A plan with code ${code} already exists`);
    }
    const plan = await this.prisma.plan.create({
      data: { ...input, code, name: input.name.trim() },
    });
    await this.audit.record({
      actorId,
      action: 'bil.plan.create',
      targetType: 'plan',
      targetId: plan.id,
      after: input,
    });
    return plan;
  }

  /**
   * Edits a plan's name or availability. The shape (classes, length, room, period) is
   * fixed once anyone has subscribed, because live subscriptions and their schedules were
   * built on it; make a new plan instead.
   */
  async updatePlan(
    planId: string,
    input: Partial<{
      name: string;
      active: boolean;
      classesPerWeek: number;
      classMinutes: number;
      roomType: 'ONE_TO_ONE' | 'CIRCLE';
      billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY';
      /** Not part of the plan's shape: it only prices new subscriptions, so it may change. */
      periodDiscountPercent: number;
    }>,
    actorId: string,
  ) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!plan) throw AppError.notFound('Plan');
    const shapeChange = (
      ['classesPerWeek', 'classMinutes', 'roomType', 'billingPeriod'] as const
    ).some((k) => input[k] !== undefined && input[k] !== plan[k]);
    if (shapeChange && plan._count.subscriptions > 0) {
      throw AppError.conflict(
        'CONFLICT',
        'Families have subscribed to this plan, so its classes and billing period cannot change. Create a new plan.',
      );
    }
    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: { ...input, ...(input.name ? { name: input.name.trim() } : {}) },
    });
    await this.audit.record({
      actorId,
      action: 'bil.plan.update',
      targetType: 'plan',
      targetId: planId,
      before: {
        name: plan.name,
        active: plan.active,
        periodDiscountPercent: plan.periodDiscountPercent,
      },
      after: input,
    });
    return updated;
  }

  /**
   * After a teacher change, the family pays the price for the new teacher's tier from the
   * next billing period (never mid-period). No change when the tier is the same.
   */
  async repriceForTeacher(enrolmentId: string, teacherProfileId: string, actorId: string) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      select: { subscription: { include: { plan: true } } },
    });
    const subscription = enrolment?.subscription;
    if (!subscription || !['ACTIVE', 'PAST_DUE', 'PAUSED'].includes(subscription.status))
      return null;
    const tierId = await this.tierOfTeacher(teacherProfileId);
    if (tierId === subscription.tierId) return null;
    // Sold in another currency before prices moved to USD: there is no price list to move it
    // to, so it keeps the price it has rather than being switched to a USD amount.
    if (subscription.currency !== BILLING_CURRENCY) {
      this.logger.warn(
        `Subscription ${subscription.id} is billed in ${subscription.currency}; not repriced for the new teacher's tier`,
      );
      return null;
    }

    const period = await this.periodPriceFor(subscription.planId, tierId);
    // The sibling or promo discount it was sold with stays, as the same amount the provider
    // coupon keeps taking off.
    const repriced = repriceKeepingDiscount(
      readBreakdown(subscription.discountBreakdown),
      period.breakdown,
    );
    const price = { amountMinor: repriced.finalMinor };
    let amountMinor: number;
    let breakdown: PriceBreakdown | null = repriced;
    if (subscription.providerSubscriptionId) {
      await this.payments.changeSubscriptionPlan({
        providerSubscriptionId: subscription.providerSubscriptionId,
        planCode: subscription.plan.code,
        planName: subscription.plan.name,
        amountMinor: period.amountMinor,
        currency: subscription.currency,
        interval: intervalOf(subscription.plan.billingPeriod),
        when: 'period_end',
      });
      // The provider switches the price at renewal and its subscription update brings the
      // new amount then. Until that, the period already paid for keeps its price; a row
      // that never had one locked gets the old price locked now, or the tier change below
      // would reprice it mid-period.
      amountMinor =
        subscription.amountMinor ??
        (await this.periodPriceFor(subscription.planId, subscription.tierId)).amountMinor;
      breakdown = readBreakdown(subscription.discountBreakdown);
    } else {
      // Invoiced by us, once per period: the next invoice raised is already the next period.
      amountMinor = price.amountMinor;
    }
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { tierId, amountMinor, ...(breakdown ? { discountBreakdown: asJson(breakdown) } : {}) },
    });
    await this.audit.record({
      actorId,
      action: 'bil.subscription.reprice',
      targetType: 'subscription',
      targetId: subscription.id,
      before: { tierId: subscription.tierId },
      after: { tierId, amountMinor: price.amountMinor, from: subscription.currentPeriodEnd },
    });
    await this.notifyFamily(subscription.familyId, TEMPLATE.BILLING_PLAN_CHANGED, {
      planName: `${subscription.plan.name} at ${money(price.amountMinor, subscription.currency)}`,
      effective: `on ${formatDay(subscription.currentPeriodEnd ?? new Date())}`,
    });
    return { subscriptionId: subscription.id, tierId, amountMinor: price.amountMinor };
  }

  // ── Family notifications and weekly times (FR-NTF-02, R17/R18) ─────────────

  private get billingUrl(): string {
    return `${this.config.value.APP_WEB_URL.replace(/\/$/, '')}/parent/billing`;
  }

  /** Tells the family's guardians; a notification failure never undoes a money change. */
  private async notifyFamily(familyId: string, template: TemplateKey, data: TemplateData) {
    try {
      const members = await this.prisma.familyMember.findMany({
        where: { familyId },
        select: { userId: true },
      });
      if (members.length === 0) return;
      await this.notifications.enqueue({
        userIds: members.map((m) => m.userId),
        template,
        data: { billingUrl: this.billingUrl, ...data },
      });
    } catch (error) {
      this.logger.warn(
        `Billing notification ${template} for family ${familyId} failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * After a plan change with a different number of classes a week, the old weekly times no
   * longer fit: the family is asked to pick new ones (R18). Same count: nothing to do.
   */
  private async flagTimesIfNeeded(subscriptionId: string, fromPlanId: string, toPlanId: string) {
    if (fromPlanId === toPlanId) return;
    const [from, to, subscription] = await Promise.all([
      this.prisma.plan.findUnique({ where: { id: fromPlanId }, select: { classesPerWeek: true } }),
      this.prisma.plan.findUnique({
        where: { id: toPlanId },
        select: { name: true, classesPerWeek: true },
      }),
      this.prisma.subscription.findUnique({
        where: { id: subscriptionId },
        select: { familyId: true, setup: true },
      }),
    ]);
    if (!from || !to || !subscription || from.classesPerWeek === to.classesPerWeek) return;
    const setup = (subscription.setup ?? {}) as SubscriptionSetup;
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { setup: asJson({ ...setup, timesNeeded: true }) },
    });
    await this.notifyFamily(subscription.familyId, TEMPLATE.BILLING_TIMES_NEEDED, {
      planName: to.name,
      classesPerWeek: to.classesPerWeek,
    });
  }

  /**
   * The family moves their regular classes to new weekly times with the same teacher (R18):
   * after a plan change, or simply because their week changed. The old weekly schedule ends
   * the day before `startsOn` and its later classes are cancelled; if the new times cannot
   * be created, the old schedule is put back exactly as it was.
   */
  async changeWeeklyTimes(
    subscriptionId: string,
    choice: Omit<ScheduleChoice, 'teacherId'>,
    actorId: string,
    actorRoles: string[],
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, enrolments: { select: { id: true, teacherId: true, status: true } } },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'weekly-times');
    if (!['ACTIVE', 'PAST_DUE'].includes(subscription.status)) {
      throw AppError.conflict(
        'CONFLICT',
        `A ${subscription.status.toLowerCase()} plan has no weekly classes to move`,
      );
    }
    const enrolment = subscription.enrolments.find(
      (e) => e.id === choice.enrolmentId && e.status === 'ACTIVE',
    );
    if (!enrolment) throw AppError.notFound('Enrolment');
    if (!enrolment.teacherId) {
      throw AppError.conflict(
        'CONFLICT',
        'No teacher is assigned yet; the academy will set the times',
      );
    }
    const setup = await this.buildSetup(
      { familyId: subscription.familyId, schedule: { ...choice, teacherId: enrolment.teacherId } },
      subscription.plan,
    );
    const schedule = setup.schedule as NonNullable<SubscriptionSetup['schedule']>;
    const startsOn = new Date(`${choice.startsOn}T00:00:00Z`);

    const old = await this.prisma.recurringSchedule.findMany({
      where: { enrolmentId: enrolment.id, status: { not: 'ENDED' } },
      select: { id: true, status: true, endsOn: true },
    });
    const oldIds = old.map((o) => o.id);
    const moved = oldIds.length
      ? await this.prisma.classSession.findMany({
          where: { scheduleId: { in: oldIds }, status: 'SCHEDULED', startsAt: { gte: startsOn } },
          select: { id: true },
        })
      : [];
    if (oldIds.length) {
      await this.prisma.recurringSchedule.updateMany({
        where: { id: { in: oldIds } },
        data: { status: 'ENDED', endsOn: startsOn },
      });
      await this.prisma.classSession.updateMany({
        where: { id: { in: moved.map((m) => m.id) } },
        data: { status: 'CANCELLED_FAMILY' },
      });
    }

    let scheduleIds: string[];
    try {
      scheduleIds = await this.createWeeklyClasses(schedule);
    } catch (error) {
      for (const o of old) {
        await this.prisma.recurringSchedule.update({
          where: { id: o.id },
          data: { status: o.status, endsOn: o.endsOn },
        });
      }
      if (moved.length) {
        await this.prisma.classSession.updateMany({
          where: { id: { in: moved.map((m) => m.id) } },
          data: { status: 'SCHEDULED' },
        });
      }
      throw error;
    }

    const current = (subscription.setup ?? {}) as SubscriptionSetup;
    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        setup: asJson({
          ...current,
          schedule,
          scheduleIds,
          timesNeeded: false,
          scheduleError: undefined,
        }),
      },
    });
    await this.audit.record({
      actorId,
      action: 'bil.subscription.weekly_times',
      targetType: 'subscription',
      targetId: subscriptionId,
      before: { scheduleIds: oldIds, cancelledClasses: moved.length },
      after: { scheduleIds, slots: choice.slots, startsOn: choice.startsOn },
    });
    return updated;
  }

  // ── Recurring billing by the provider (FR-BIL-01/02/03) ──────────────────

  /** Finds our subscription from a provider event: by its provider id, else by our reference. */
  private async subscriptionFor(
    event: Pick<PaymentWebhookEvent, 'providerSubscriptionId' | 'reference'>,
  ) {
    if (event.providerSubscriptionId) {
      const found = await this.prisma.subscription.findFirst({
        where: { providerSubscriptionId: event.providerSubscriptionId },
      });
      if (found) return found;
    }
    if (event.reference) {
      return this.prisma.subscription.findUnique({ where: { id: event.reference } });
    }
    return null;
  }

  private async applyRecurringEvent(
    event: PaymentWebhookEvent,
  ): Promise<{ applied: boolean; reason?: string }> {
    const subscription = await this.subscriptionFor(event);
    if (!subscription) return { applied: false, reason: 'unknown subscription' };

    if (event.type === 'subscription_checkout_completed') {
      // A delayed payment method finishes checkout before the money arrives. The plan
      // starts on the invoice payment (`invoice_paid`) instead, never on a promise.
      if (
        event.paymentStatus &&
        event.paymentStatus !== 'paid' &&
        event.paymentStatus !== 'no_payment_required'
      ) {
        return { applied: false, reason: `checkout payment ${event.paymentStatus}` };
      }
      await this.activate(subscription.id, SYSTEM_ACTOR, {
        providerSubscriptionId: event.providerSubscriptionId,
      });
      return { applied: true, reason: 'subscription activated' };
    }

    if (event.type === 'subscription_cancelled') {
      await this.endAccess(subscription.id, SYSTEM_ACTOR, event.occurredAt);
      return { applied: true, reason: 'subscription ended' };
    }

    if (event.type === 'subscription_updated' && event.subscription) {
      return this.applySubscriptionState(
        subscription,
        { ...event.subscription, providerSubscriptionId: event.providerSubscriptionId },
        event.occurredAt,
      );
    }

    if ((event.type === 'invoice_paid' || event.type === 'invoice_failed') && event.invoice) {
      const paid = event.type === 'invoice_paid';
      if (subscription.status === 'INCOMPLETE' && paid) {
        await this.activate(subscription.id, SYSTEM_ACTOR, {
          providerSubscriptionId: event.providerSubscriptionId,
          currentPeriodStart: event.invoice.periodStart,
          currentPeriodEnd: event.invoice.periodEnd,
        });
      }
      const before = await this.prisma.invoice.findUnique({
        where: { providerInvoiceId: event.invoice.id },
        select: { status: true },
      });
      const invoice = await this.mirrorInvoice(subscription, event.invoice, paid, event.occurredAt);
      if (!paid && before?.status !== 'FAILED' && before?.status !== 'PAID') {
        const plan = await this.prisma.plan.findUnique({
          where: { id: subscription.planId },
          select: { name: true },
        });
        await this.notifyFamily(subscription.familyId, TEMPLATE.BILLING_RENEWAL_FAILED, {
          planName: plan?.name ?? 'your plan',
          amount: money(event.invoice.amountMinor, event.invoice.currency),
        });
      }
      await this.applyInvoiceOutcome(subscription.id, paid, event.invoice);
      return { applied: true, reason: `invoice ${invoice.number} ${paid ? 'paid' : 'failed'}` };
    }

    return { applied: false, reason: `unhandled event ${event.type}` };
  }

  private async applyInvoiceOutcome(
    subscriptionId: string,
    paid: boolean,
    invoice: ProviderInvoice,
  ) {
    if (paid) {
      await this.prisma.subscription.updateMany({
        where: { id: subscriptionId, status: { in: ['PAST_DUE', 'ACTIVE'] } },
        data: {
          status: 'ACTIVE',
          ...(invoice.periodStart ? { currentPeriodStart: invoice.periodStart } : {}),
          ...(invoice.periodEnd ? { currentPeriodEnd: invoice.periodEnd } : {}),
        },
      });
      return;
    }
    // Grace period: classes carry on while the provider retries the card on its own
    // schedule; the family sees "past due" with a link to pay or change the card. Only
    // the provider's final cancellation (`subscription_cancelled`) ends access.
    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, status: 'ACTIVE' },
      data: { status: 'PAST_DUE' },
    });
  }

  /**
   * Applies the provider's state for one subscription. An event older than the last state
   * applied is ignored, so a delayed or redelivered webhook never rolls a subscription back.
   */
  private async applySubscriptionState(
    subscription: {
      id: string;
      status: string;
      planId: string;
      providerSyncedAt: Date | null;
      amountMinor?: number | null;
      discountBreakdown?: unknown;
    },
    state: NonNullable<PaymentWebhookEvent['subscription']> & { providerSubscriptionId?: string },
    observedAt: Date,
  ): Promise<{ applied: boolean; reason?: string }> {
    if (subscription.providerSyncedAt && observedAt < subscription.providerSyncedAt) {
      return { applied: false, reason: 'older than the state already applied' };
    }
    const live = ['active', 'trialing', 'past_due'].includes(state.status);
    if (subscription.status === 'INCOMPLETE') {
      // The first invoice can be paid before checkout completion is delivered.
      if (!live) return { applied: false, reason: 'awaiting checkout' };
      await this.activate(subscription.id, SYSTEM_ACTOR, {
        providerSubscriptionId: state.providerSubscriptionId,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
      });
    }
    if (state.status === 'canceled' || state.status === 'incomplete_expired') {
      await this.endAccess(subscription.id, SYSTEM_ACTOR, observedAt);
      return { applied: true, reason: 'subscription ended' };
    }

    const status = state.paused
      ? 'PAUSED'
      : state.status === 'past_due' || state.status === 'unpaid'
        ? 'PAST_DUE'
        : 'ACTIVE';

    // The provider switched the billed price (an upgrade, or a downgrade whose period came).
    let planId: string | undefined;
    if (state.planCode) {
      const plan = await this.prisma.plan.findUnique({
        where: { code: state.planCode },
        select: { id: true },
      });
      if (plan && plan.id !== subscription.planId) planId = plan.id;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        providerSyncedAt: observedAt,
        ...(status === 'ACTIVE' ? { pausedUntil: null } : {}),
        ...(state.currentPeriodStart ? { currentPeriodStart: state.currentPeriodStart } : {}),
        ...(state.currentPeriodEnd ? { currentPeriodEnd: state.currentPeriodEnd } : {}),
        ...(planId ? { planId, pendingPlanId: null, pendingPlanFrom: null } : {}),
        // What the provider bills from now on, so a deferred downgrade or tier change
        // reaches our own invoices when it actually takes effect.
        ...this.lockedFromProvider(subscription, state.amountMinor),
      },
    });
    if (planId) await this.flagTimesIfNeeded(subscription.id, subscription.planId, planId);
    return { applied: true, reason: `subscription ${status.toLowerCase()}` };
  }

  /**
   * The provider reports its recurring price before the coupon that carries the sibling or
   * promo discount, so that discount (a fixed amount, see `providerDiscount`) is taken off
   * again before it is compared with, or replaces, our locked price.
   */
  private lockedFromProvider(
    subscription: { amountMinor?: number | null; discountBreakdown?: unknown },
    providerAmountMinor: number | undefined,
  ): { amountMinor?: number; discountBreakdown?: Prisma.InputJsonValue } {
    if (providerAmountMinor === undefined) return {};
    const breakdown = readBreakdown(subscription.discountBreakdown);
    const net = Math.max(0, providerAmountMinor - (breakdown?.extraDiscountMinor ?? 0));
    if (net === subscription.amountMinor) return {};
    return {
      amountMinor: net,
      ...(breakdown
        ? {
            discountBreakdown: asJson({
              ...breakdown,
              periodPriceMinor: providerAmountMinor,
              finalMinor: net,
            }),
          }
        : {}),
    };
  }

  /**
   * The end of a subscription (period over, or the provider gave up on the card): it is
   * cancelled, its enrolments end, and future classes from its weekly schedules are
   * cancelled. Classes already held stay on record.
   */
  private async endAccess(subscriptionId: string, actorId: string | null, at: Date) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        status: true,
        familyId: true,
        plan: { select: { name: true } },
        enrolments: { select: { id: true } },
      },
    });
    if (!subscription) return;
    const enrolmentIds = subscription.enrolments.map((e) => e.id);
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELLED',
        cancelAtPeriodEnd: false,
        pendingPlanId: null,
        pendingPlanFrom: null,
        providerSyncedAt: at,
      },
    });
    if (enrolmentIds.length > 0) {
      await this.prisma.enrolment.updateMany({
        where: { id: { in: enrolmentIds }, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'CANCELLED' },
      });
      const schedules = await this.prisma.recurringSchedule.findMany({
        where: { enrolmentId: { in: enrolmentIds }, status: { not: 'ENDED' } },
        select: { id: true },
      });
      const scheduleIds = schedules.map((s) => s.id);
      if (scheduleIds.length > 0) {
        await this.prisma.recurringSchedule.updateMany({
          where: { id: { in: scheduleIds } },
          data: { status: 'ENDED', endsOn: at },
        });
        await this.prisma.classSession.updateMany({
          where: { scheduleId: { in: scheduleIds }, status: 'SCHEDULED', startsAt: { gt: at } },
          data: { status: 'CANCELLED_FAMILY' },
        });
      }
    }
    if (subscription.status !== 'CANCELLED') {
      await this.audit.record({
        actorId,
        action: 'bil.subscription.end',
        targetType: 'subscription',
        targetId: subscriptionId,
        before: { status: subscription.status },
        after: { status: 'CANCELLED', enrolments: enrolmentIds },
      });
      await this.notifyFamily(subscription.familyId, TEMPLATE.BILLING_PLAN_ENDED, {
        planName: subscription.plan.name,
      });
    }
  }

  /**
   * Pulls the subscription's state and recent invoices straight from the provider. This
   * is what keeps us right when a webhook is lost: the checkout success page calls it,
   * the hourly reconcile job calls it, and staff can call it from the admin console.
   */
  async syncSubscription(subscriptionId: string, actorId: string, actorRoles: string[]) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'sync');
    await this.reconcile(subscription.id);
    return this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { plan: { select: { code: true, name: true, classesPerWeek: true } } },
    });
  }

  /** Reconciles one subscription with the provider; a no-op on the fake. */
  async reconcile(subscriptionId: string): Promise<{ synced: boolean; reason?: string }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) return { synced: false, reason: 'unknown subscription' };
    const setup = (subscription.setup ?? {}) as SubscriptionSetup;
    const state = await this.payments.fetchSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId ?? undefined,
      checkoutSessionId: setup.checkoutSessionId,
    });
    if (!state) return { synced: false, reason: 'no provider state' };

    const observedAt = new Date();
    await this.applySubscriptionState(subscription, state, observedAt);
    if (subscription.status === 'INCOMPLETE' && !subscription.providerSubscriptionId) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { providerSubscriptionId: state.providerSubscriptionId },
      });
    }
    // Oldest first, so the latest invoice decides the final status.
    for (const invoice of [...state.invoices].reverse()) {
      await this.mirrorInvoice(subscription, invoice, invoice.paid, observedAt);
    }
    return { synced: true };
  }

  /** Subscriptions the hourly job checks: live ones, and checkouts started in the last day. */
  async reconcileAll(): Promise<{ checked: number; failed: number }> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        OR: [
          {
            status: { in: ['ACTIVE', 'PAST_DUE', 'PAUSED'] },
            providerSubscriptionId: { startsWith: 'sub_' },
          },
          { status: 'INCOMPLETE', createdAt: { gt: new Date(Date.now() - 864e5) } },
        ],
      },
      select: { id: true },
      take: 500,
    });
    let failed = 0;
    for (const row of rows) {
      await this.reconcile(row.id).catch((error: Error) => {
        failed += 1;
        this.logger.warn(`Reconcile of subscription ${row.id} failed: ${error.message}`);
      });
    }
    return { checked: rows.length, failed };
  }

  /**
   * Moves a family to another plan. A dearer plan applies now and the difference is charged
   * straight away; a cheaper one waits for the paid period to end, so nothing already paid
   * for is lost (the same as Netflix or GitHub).
   */
  async changePlan(subscriptionId: string, planId: string, actorId: string, actorRoles: string[]) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'change-plan');
    if (!['ACTIVE', 'PAST_DUE'].includes(subscription.status)) {
      throw AppError.conflict(
        'CONFLICT',
        `A ${subscription.status.toLowerCase()} subscription cannot change plan`,
      );
    }
    if (subscription.planId === planId) {
      throw AppError.conflict('CONFLICT', 'The family is already on this plan');
    }
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) throw AppError.notFound('Plan');
    assertPricedInUsd(subscription, 'change plan');

    const [from, toPeriod] = await Promise.all([
      this.periodPriceFor(subscription.planId, subscription.tierId),
      this.periodPriceFor(planId, subscription.tierId),
    ]);
    // Compared before the family's own discount, which moves with them unchanged.
    const upgrade = toPeriod.amountMinor > from.amountMinor;
    const toBreakdown = repriceKeepingDiscount(
      readBreakdown(subscription.discountBreakdown),
      toPeriod.breakdown,
    );
    const to = { amountMinor: toBreakdown.finalMinor };
    const result = subscription.providerSubscriptionId
      ? await this.payments.changeSubscriptionPlan({
          providerSubscriptionId: subscription.providerSubscriptionId,
          planCode: plan.code,
          planName: plan.name,
          amountMinor: toPeriod.amountMinor,
          currency: subscription.currency,
          interval: intervalOf(plan.billingPeriod),
          when: upgrade ? 'now' : 'period_end',
        })
      : { appliedNow: true, paymentPending: false };

    // The upgrade's charge did not go through, so the provider kept the old plan. Nothing
    // changes here either; if the family pays that invoice, the provider's subscription
    // update moves the plan then.
    if (result.paymentPending) {
      await this.audit.record({
        actorId,
        action: 'bil.subscription.change_plan_unpaid',
        targetType: 'subscription',
        targetId: subscriptionId,
        before: { planId: subscription.planId },
        after: { planId, amountMinor: to.amountMinor },
      });
      throw AppError.conflict(
        'CONFLICT',
        'The card could not be charged for the upgrade, so the plan has not changed. Update the card and try again.',
        { paymentPending: true },
      );
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: result.appliedNow
        ? {
            planId,
            amountMinor: to.amountMinor,
            discountBreakdown: asJson(toBreakdown),
            pendingPlanId: null,
            pendingPlanFrom: null,
          }
        : { pendingPlanId: planId, pendingPlanFrom: subscription.currentPeriodEnd },
    });
    await this.audit.record({
      actorId,
      action: 'bil.subscription.change_plan',
      targetType: 'subscription',
      targetId: subscriptionId,
      before: { planId: subscription.planId, amountMinor: from.amountMinor },
      after: {
        planId,
        amountMinor: to.amountMinor,
        appliedNow: result.appliedNow,
        from: result.appliedNow ? null : subscription.currentPeriodEnd,
      },
    });
    await this.notifyFamily(subscription.familyId, TEMPLATE.BILLING_PLAN_CHANGED, {
      planName: plan.name,
      effective: result.appliedNow
        ? 'today'
        : `on ${formatDay(subscription.currentPeriodEnd ?? new Date())}`,
    });
    if (result.appliedNow)
      await this.flagTimesIfNeeded(subscriptionId, subscription.planId, planId);
    return { ...updated, appliedNow: result.appliedNow };
  }

  /** "Keep my plan": withdraws a cancellation that has not taken effect yet. */
  async undoCancel(subscriptionId: string, actorId: string, actorRoles: string[]) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.assertMayManageFamily(actorId, subscription.familyId, actorRoles, 'undo-cancel');
    if (!subscription.cancelAtPeriodEnd || subscription.status === 'CANCELLED') {
      throw AppError.conflict('CONFLICT', 'This subscription is not set to end');
    }
    if (subscription.providerSubscriptionId) {
      await this.payments.undoCancel(subscription.providerSubscriptionId);
    }
    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: false },
    });
    await this.audit.record({
      actorId,
      action: 'bil.subscription.undo_cancel',
      targetType: 'subscription',
      targetId: subscriptionId,
      after: { cancelAtPeriodEnd: false },
    });
    return updated;
  }

  /** Upserts the provider's period invoice and its payment as ours (one row per provider id). */
  private async mirrorInvoice(
    subscription: { id: string; familyId: string; currency: string },
    source: ProviderInvoice,
    paid: boolean,
    occurredAt: Date,
  ) {
    const fields = {
      totalMinor: source.amountMinor,
      subtotalMinor: source.amountMinor,
      status: paid ? ('PAID' as const) : ('FAILED' as const),
      paidAt: paid ? occurredAt : null,
      pdfUrl: source.pdfUrl ?? null,
      hostedUrl: source.hostedUrl ?? null,
    };
    const invoice = await this.prisma.invoice.upsert({
      where: { providerInvoiceId: source.id },
      create: {
        familyId: subscription.familyId,
        subscriptionId: subscription.id,
        providerInvoiceId: source.id,
        number: source.number ?? invoiceNumber(),
        currency: (source.currency || subscription.currency) as never,
        dueAt: occurredAt,
        ...fields,
      },
      // A late `failed` must not undo a `paid` that already arrived.
      update: paid ? fields : { pdfUrl: fields.pdfUrl, hostedUrl: fields.hostedUrl },
    });
    const paymentId = await this.invoicePaymentId(source);
    // Rows written before the payment intent was stored are keyed by the invoice id; they
    // are found that way once and re-keyed, so refunds can reach them from then on.
    const existing =
      (await this.prisma.payment.findUnique({ where: { providerPaymentId: paymentId } })) ??
      (paymentId !== source.id
        ? await this.prisma.payment.findUnique({ where: { providerPaymentId: source.id } })
        : null);
    if (!existing) {
      await this.prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          provider: this.providerCode,
          providerPaymentId: paymentId,
          method: 'CARD',
          amountMinor: source.amountMinor,
          currency: invoice.currency,
          status: paid ? 'SUCCEEDED' : 'FAILED',
          attempt: 1,
        },
      });
    } else {
      const data = {
        ...(existing.providerPaymentId !== paymentId ? { providerPaymentId: paymentId } : {}),
        ...(paid && existing.status !== 'SUCCEEDED'
          ? { status: 'SUCCEEDED' as const, failureReason: null }
          : {}),
      };
      if (Object.keys(data).length > 0) {
        await this.prisma.payment.update({ where: { id: existing.id }, data });
      }
    }
    return invoice;
  }

  /**
   * The provider's charge id for a period invoice: what `charge.refunded` and a refund
   * refer to. Falls back to the invoice id when there is no charge (a zero invoice) or the
   * provider cannot be asked right now; the next reconcile re-keys the row.
   */
  private async invoicePaymentId(source: ProviderInvoice): Promise<string> {
    if (source.paymentId) return source.paymentId;
    if (!this.payments.invoicePaymentId) return source.id;
    try {
      return (await this.payments.invoicePaymentId(source.id)) ?? source.id;
    } catch (error) {
      this.logger.warn(
        `Payment for provider invoice ${source.id} not resolved: ${(error as Error).message}`,
      );
      return source.id;
    }
  }

  /**
   * Dunning sweep (FR-BIL-05): schedules retries on failed invoices.
   *
   * Retry days come from `billing.dunning_retry_days` applied to `DUNNING_RETRY_DAYS`
   * (1, 3, 7 by default). After the last attempt the subscription is cancelled, because
   * an unlimited retry schedule on a family who has declined three charges is
   * harassment, not revenue recovery.
   */
  async runDunning(actorId: string): Promise<{ retried: number; cancelled: number }> {
    const now = new Date();
    const retryDays = await dunningLadder(this.settings);
    let retried = 0;
    let cancelled = 0;

    const overdue = await this.prisma.invoice.findMany({
      where: { status: { in: ['FAILED', 'OPEN'] }, dueAt: { lt: now }, providerInvoiceId: null },
      include: {
        payments: { orderBy: { attempt: 'desc' }, take: 1 },
        subscription: { select: { id: true, status: true, providerSubscriptionId: true } },
      },
    });

    for (const invoice of overdue) {
      const lastPayment = invoice.payments[0];
      const attempt = lastPayment?.attempt ?? 0;

      if (attempt >= retryDays.length) {
        if (invoice.subscription && invoice.subscription.status !== 'CANCELLED') {
          if (invoice.subscription.providerSubscriptionId) {
            await this.payments
              .cancelSubscription(invoice.subscription.providerSubscriptionId, false)
              .catch((error: Error) =>
                this.logger.warn(`Provider cancel failed: ${error.message}`),
              );
          }
          await this.prisma.subscription.update({
            where: { id: invoice.subscription.id },
            data: { status: 'CANCELLED' },
          });
          cancelled += 1;
        }
        continue;
      }

      const nextRetryInDays = retryDays[attempt];
      const nextRetryAt = new Date(now.getTime() + nextRetryInDays * 864e5);

      if (lastPayment?.providerPaymentId) {
        await this.payments
          .retryInvoicePayment(
            lastPayment.providerPaymentId,
            `dunning:${invoice.id}:${attempt + 1}`,
          )
          .catch((error: Error) => {
            // A provider failure must not abort the sweep for every other family.
            this.logger.warn(`Retry failed for invoice ${invoice.number}: ${error.message}`);
          });
      }

      await this.prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          provider: this.providerCode,
          providerPaymentId: `retry_${invoice.id}_${attempt + 1}_${randomUUID().slice(0, 8)}`,
          method: 'CARD',
          amountMinor: invoice.totalMinor,
          currency: invoice.currency,
          status: 'PENDING',
          attempt: attempt + 1,
          nextRetryAt,
          failureReason: 'Scheduled dunning retry',
        },
      });

      retried += 1;
    }

    await this.audit.record({
      actorId,
      action: 'bil.dunning.run',
      targetType: 'invoice',
      after: { retried, cancelled, scanned: overdue.length },
    });

    return { retried, cancelled };
  }

  /** Issues a full or partial refund (FR-BIL-06). */
  async refund(input: {
    paymentId: string;
    amountMinor: number;
    reason: string;
    actorId: string;
    idempotencyKey?: string;
  }) {
    if (input.idempotencyKey) {
      const replay = await this.prisma.refund.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay) {
        if (replay.paymentId !== input.paymentId || replay.amountMinor !== input.amountMinor) {
          throw AppError.conflict(
            'CONFLICT',
            'Idempotency-Key was already used for another refund',
          );
        }
        return replay;
      }
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { invoice: true, refunds: true },
    });
    if (!payment) throw AppError.notFound('Payment');
    if (payment.status !== 'SUCCEEDED') {
      throw AppError.conflict('CONFLICT', 'Only a succeeded payment can be refunded');
    }

    const alreadyRefunded = payment.refunds.reduce((s, r) => s + r.amountMinor, 0);
    const refundable = payment.amountMinor - alreadyRefunded;
    if (input.amountMinor <= 0 || input.amountMinor > refundable) {
      throw AppError.badRequest(`Refund must be between 1 and ${refundable} minor units`, {
        refundable,
        alreadyRefunded,
      });
    }

    // Recorded before the provider is asked, so the provider's refund webhook (which can
    // land before this call returns) finds it and adds nothing; removed again if the
    // provider refuses.
    const refundRow = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        issuedById: input.actorId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    let providerRefund: { refundId: string };
    try {
      providerRefund = await this.payments.refund({
        providerPaymentId: payment.providerPaymentId,
        amountMinor: input.amountMinor,
        reason: input.reason,
        idempotencyKey:
          input.idempotencyKey ?? `refund:${payment.id}:${alreadyRefunded + input.amountMinor}`,
      });
    } catch (error) {
      await this.prisma.refund.delete({ where: { id: refundRow.id } });
      throw error;
    }
    // The webhook may already have linked this row to the id (same payment, same amount);
    // otherwise it is linked here, so a later event finds it by id.
    const linkedRow = await this.prisma.refund
      .update({ where: { id: refundRow.id }, data: { providerRefundId: providerRefund.refundId } })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // The webhook recorded this id on another row first; this row is the duplicate.
          return this.prisma.refund.delete({ where: { id: refundRow.id } }).then(() => null);
        }
        throw error;
      });

    // Fully refunded payments flip to REFUNDED; a partial one leaves the payment
    // SUCCEEDED and the invoice untouched, because the family did still get what they
    // paid for.
    const totalRefunded = alreadyRefunded + input.amountMinor;
    if (totalRefunded >= payment.amountMinor) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'REFUNDED' },
      });
    }

    await this.audit.record({
      actorId: input.actorId,
      action: 'bil.refund',
      targetType: 'refund',
      targetId: refundRow.id,
      after: {
        providerRefundId: providerRefund.refundId,
        amountMinor: input.amountMinor,
        reason: input.reason,
      },
    });

    return linkedRow ?? { ...refundRow, providerRefundId: providerRefund.refundId };
  }

  /**
   * Writes off an invoice the family will never pay (FR-BIL-06): moves it straight to
   * `VOID` without a payment or refund existing. `handlePaymentEvent` and `startCheckout`
   * already refuse a voided invoice, so this reuses that guard rather than adding a
   * second "written off" status that every payment path would need to learn about too.
   */
  async writeOffInvoice(input: { invoiceId: string; reason: string; actorId: string }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw AppError.notFound('Invoice');
    if (invoice.status === 'PAID' || invoice.status === 'REFUNDED') {
      throw AppError.conflict(
        'CONFLICT',
        `Invoice is ${invoice.status}; it cannot be written off`,
        {
          status: invoice.status,
        },
      );
    }
    if (invoice.status === 'VOID') {
      throw AppError.conflict('CONFLICT', 'Invoice has already been written off');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VOID' },
    });

    await this.audit.record({
      actorId: input.actorId,
      action: 'bil.invoice.writeOff',
      targetType: 'invoice',
      targetId: invoice.id,
      after: { reason: input.reason },
    });

    return updated;
  }

  /** Family billing view. */
  /** M29 — every payment the family made, newest first, with its invoice and refunds. */
  async familyPayments(userId: string) {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });
    const familyIds = memberships.map((m) => m.familyId);
    if (familyIds.length === 0) return [];
    const payments = await this.prisma.payment.findMany({
      where: { invoice: { familyId: { in: familyIds } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        method: true,
        amountMinor: true,
        currency: true,
        createdAt: true,
        failureReason: true,
        invoice: { select: { id: true, number: true, hostedUrl: true } },
        refunds: { select: { amountMinor: true, createdAt: true } },
      },
    });
    return payments.map(({ refunds, ...p }) => ({
      ...p,
      refundedMinor: refunds.reduce((sum, r) => sum + r.amountMinor, 0),
    }));
  }

  async familyBilling(userId: string) {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });
    const familyIds = memberships.map((m) => m.familyId);
    if (familyIds.length === 0) return { subscriptions: [], invoices: [] };

    const [subscriptions, invoices] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { familyId: { in: familyIds }, status: { not: 'INCOMPLETE' } },
        include: {
          plan: { select: { code: true, name: true, classesPerWeek: true } },
          enrolments: {
            select: {
              id: true,
              status: true,
              student: { select: { id: true, displayName: true } },
              course: { select: { name: true } },
              teacher: { select: { id: true, user: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { familyId: { in: familyIds } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const usage = await Promise.all(subscriptions.map((sub) => this.periodUsage(sub)));
    return {
      subscriptions: subscriptions.map((sub, i) => ({ ...sub, usage: usage[i] })),
      invoices,
    };
  }

  /**
   * Classes in the subscription's current billing period, by what happened to them:
   * how many were taught, how many are still to come, and how many were missed.
   */
  private async periodUsage(sub: {
    id: string;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  }) {
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd) return null;
    const rows = await this.prisma.classStudent.findMany({
      where: {
        enrolment: { subscriptionId: sub.id },
        startsAt: { gte: sub.currentPeriodStart, lt: sub.currentPeriodEnd },
      },
      select: { class: { select: { status: true } } },
    });
    const count = (...statuses: string[]) =>
      rows.filter((r) => statuses.includes(r.class.status)).length;
    const completed = count('COMPLETED');
    const upcoming = count('SCHEDULED', 'LIVE');
    const missedByStudent = count('NO_SHOW_STUDENT', 'CANCELLED_FAMILY');
    const missedByTeacher = count('NO_SHOW_TEACHER', 'CANCELLED_TEACHER');
    return {
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      // Classes the family is paying for this period; a teacher's missed class is not counted.
      included: completed + upcoming + missedByStudent,
      completed,
      upcoming,
      missedByStudent,
      missedByTeacher,
    };
  }
}

/** The sibling or promo discount as the provider coupon that takes it off every period. */
function providerDiscount(
  breakdown: PriceBreakdown,
): { amountOffMinor: number; label: string } | undefined {
  if (!breakdown.applied || breakdown.extraDiscountMinor <= 0) return undefined;
  return {
    amountOffMinor: breakdown.extraDiscountMinor,
    label:
      breakdown.applied === 'PROMO'
        ? `Promo ${breakdown.promo?.code ?? ''}`.trim()
        : `Sibling discount ${breakdown.sibling?.percent ?? 0}%`,
  };
}

function intervalOf(period: string): 'month' | 'quarter' | 'half_year' {
  if (period === 'QUARTERLY') return 'quarter';
  if (period === 'HALF_YEARLY') return 'half_year';
  return 'month';
}

function invoiceNumber(): string {
  return `INV-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

const DAY_SHORT: Record<WeekdayCode, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

/** Exactly the plan's classes a week, one per day. */
function assertSlotsFitPlan(
  slots: ScheduleChoice['slots'],
  plan: { classesPerWeek: number },
): void {
  if (slots.length !== plan.classesPerWeek) {
    throw AppError.badRequest(
      `This plan has ${plan.classesPerWeek} classes a week; choose exactly that many times`,
      { chosen: slots.length, classesPerWeek: plan.classesPerWeek },
    );
  }
  if (new Set(slots.map((s) => s.weekday)).size !== slots.length) {
    throw AppError.badRequest('Choose one class per day');
  }
}

function describeSlots(slots: ScheduleChoice['slots']): string {
  return WEEKDAY_CODES.filter((d) => slots.some((s) => s.weekday === d))
    .map((d) => `${DAY_SHORT[d]} ${slots.find((s) => s.weekday === d)?.localTime}`)
    .join(', ');
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** For messages only; every stored amount stays in integer minor units. */
/**
 * Every price is in USD now; a subscription sold earlier in another currency still bills
 * its locked amount in that currency, but anything that needs the price list (a plan
 * change, an unlocked invoice) is refused rather than quietly mixing currencies.
 */
function assertPricedInUsd(subscription: { currency: string }, action: string): void {
  if (subscription.currency === BILLING_CURRENCY) return;
  throw AppError.conflict(
    'CONFLICT',
    `This plan is billed in ${subscription.currency}, from before prices moved to ${BILLING_CURRENCY}. ` +
      `To ${action}, cancel it and start a new plan in ${BILLING_CURRENCY}.`,
    { currency: subscription.currency },
  );
}

function money(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
