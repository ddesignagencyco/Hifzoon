import { Inject, Injectable, Logger } from '@nestjs/common';
import { leadWon } from '../crm/trial-lead';
import { Currency, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

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

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** Months per billing interval, matching the plan model. */
const INTERVAL_MONTHS = { month: 1, quarter: 3, half_year: 6 } as const;

/** Provider webhooks act with no signed-in person behind them. */
const SYSTEM_ACTOR = null;

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
  ) {}

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
  async listPlans(currency?: string) {
    return this.prisma.plan.findMany({
      where: { active: true },
      include: { prices: currency ? { where: { currency: currency as never } } : true },
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
        tier: { select: { code: true, name: true, badgeIcon: true, description: true } },
      },
      orderBy: { name: 'asc' },
    });
    return plans;
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
   * What a plan costs in a currency. With a teacher tier, that tier's price when one is
   * set (tier pricing); otherwise, or without a tier, the plan's standard price.
   */
  async priceFor(planId: string, currency: string, tierId?: string | null) {
    if (tierId) {
      const tierPrice = await this.prisma.planTierPrice.findUnique({
        where: { planId_tierId_currency: { planId, tierId, currency: currency as never } },
      });
      if (tierPrice) return { ...tierPrice, tierId };
    }
    const price = await this.prisma.planPrice.findUnique({
      where: { planId_currency: { planId, currency: currency as never } },
    });
    if (!price) {
      throw AppError.notFound(`Plan price in ${currency}`);
    }
    return { ...price, tierId: null as string | null };
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

  /** The teacher a subscription is for: the chosen weekly teacher, else the trial teacher. */
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
    currency: string;
    actorId: string;
    actorRoles: string[];
    trialOutcomeId?: string;
    schedule?: ScheduleChoice;
    /** The web app's origin, for the hosted checkout's return links. */
    returnBaseUrl?: string;
  }) {
    // Tier pricing: the family pays the price for their teacher's tier.
    const tierId = await this.tierOfTeacher(await this.teacherForSubscription(input));
    const [family, plan, price] = await Promise.all([
      this.prisma.family.findUnique({ where: { id: input.familyId } }),
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
      this.priceFor(input.planId, input.currency, tierId),
    ]);

    if (!family) throw AppError.notFound('Family');
    if (!plan || !plan.active) throw AppError.notFound('Plan');

    // CR-10 — a guardian may only subscribe a family they belong to; taking `familyId`
    // from the body would otherwise let anyone bill any family.
    await this.assertMayManageFamily(input.actorId, input.familyId, input.actorRoles, 'subscribe');

    const setup = await this.buildSetup(input, plan);

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
    const subscription = pending
      ? await this.prisma.subscription.update({
          where: { id: pending.id },
          data: { currency: input.currency as never, setup: asJson(setup), tierId },
        })
      : await this.prisma.subscription.create({
          data: {
            familyId: input.familyId,
            planId: input.planId,
            currency: input.currency as never,
            status: 'INCOMPLETE',
            setup: asJson(setup),
            tierId,
          },
        });

    const webBase = (input.returnBaseUrl ?? '').replace(/\/$/, '');
    const checkout = await this.payments.createSubscriptionCheckout({
      reference: subscription.id,
      customerId,
      planCode: plan.code,
      amountMinor: price.amountMinor,
      currency: input.currency,
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
        hostedCheckout: Boolean(checkout),
      },
    });

    if (checkout) return { ...subscription, checkoutUrl: checkout.url, firstInvoice: null };

    // No hosted page (the development fake): the subscription starts now and the first
    // period is invoiced here, to be paid through the one-off checkout.
    const providerSubscription = await this.payments.createSubscription({
      customerId,
      planCode: plan.code,
      amountMinor: price.amountMinor,
      currency: input.currency,
      interval: intervalOf(plan.billingPeriod),
      idempotencyKey: `sub:${subscription.id}`,
    });
    const active = await this.activate(subscription.id, input.actorId, {
      providerSubscriptionId: providerSubscription.subscriptionId,
      currentPeriodStart: providerSubscription.currentPeriodStart,
      currentPeriodEnd: providerSubscription.currentPeriodEnd,
    });
    const firstInvoice = await this.invoiceSubscription(subscription.id, input.actorId);
    return { ...active, checkoutUrl: null, firstInvoice };
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
          class: { select: { students: { select: { student: { select: { familyId: true } } } } } },
        },
      });
      const families = new Set(outcome?.class.students.map((s) => s.student.familyId) ?? []);
      if (!outcome || !families.has(input.familyId)) throw AppError.notFound('Trial outcome');
      setup.trialOutcomeId = outcome.id;
    }
    const choice = input.schedule;
    if (choice) {
      if (choice.slots.length !== plan.classesPerWeek) {
        throw AppError.badRequest(
          `This plan has ${plan.classesPerWeek} classes a week; choose exactly that many times`,
          { chosen: choice.slots.length, classesPerWeek: plan.classesPerWeek },
        );
      }
      if (new Set(choice.slots.map((s) => s.weekday)).size !== choice.slots.length) {
        throw AppError.badRequest('Choose one class per day');
      }
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
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: current.status === 'INCOMPLETE' ? 'ACTIVE' : current.status,
        providerSubscriptionId: provider.providerSubscriptionId ?? current.providerSubscriptionId,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });

    // The family is paying now: their CRM lead is won.
    await leadWon(this.prisma, current.familyId).catch((err) =>
      this.logger.warn(
        `CRM lead not updated for family ${current.familyId}: ${(err as Error).message}`,
      ),
    );

    // Converting from a trial flips the trial enrolments to active in the same breath,
    // because a paid subscription with TRIAL enrolments means the family is paying for
    // lessons that are not scheduled.
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
    if (enrolmentIds.size > 0) {
      await this.prisma.enrolment.updateMany({
        where: { id: { in: [...enrolmentIds] }, status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] } },
        data: { status: 'ACTIVE', startedAt: new Date(), subscriptionId },
      });
    }

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

  /** One recurring schedule per distinct start time, covering every day chosen at it. */
  private async createWeeklyClasses(
    choice: NonNullable<SubscriptionSetup['schedule']>,
  ): Promise<string[]> {
    const byTime = new Map<string, WeekdayCode[]>();
    for (const slot of choice.slots) {
      byTime.set(slot.localTime, [...(byTime.get(slot.localTime) ?? []), slot.weekday]);
    }
    const ids: string[] = [];
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
    return ids;
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
      select: { familyId: true, family: { select: { currency: true } } },
    });
    if (memberships.length === 0) return [];
    const currencyOf = new Map(memberships.map((m) => [m.familyId, m.family.currency]));
    const outcomes = await this.prisma.trialOutcome.findMany({
      where: {
        enrolment: {
          status: 'ACTIVE',
          subscriptionId: null,
          student: { familyId: { in: [...currencyOf.keys()] } },
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
    return Promise.all(
      outcomes.map(async (o) => {
        const familyId = o.enrolment?.student.familyId ?? '';
        const currency = currencyOf.get(familyId);
        const price =
          o.recommendedPlan && currency
            ? await this.priceFor(o.recommendedPlan.id, currency, o.class.teacher?.tierId).catch(
                () => null,
              )
            : null;
        return {
          trialOutcomeId: o.id,
          completedAt: o.completedAt,
          notes: o.notes,
          familyId,
          currency: currency ?? null,
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
      }),
    );
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
    options: { discountMinor?: number } = {},
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, family: true },
    });
    if (!subscription) throw AppError.notFound('Subscription');

    const price = await this.priceFor(
      subscription.planId,
      subscription.currency,
      subscription.tierId,
    );
    const subtotal = price.amountMinor;

    // A discount is rejected rather than clamped. Clamping would silently turn an operator
    // typo (9,999 instead of 999) into a free month for the family, which is exactly the
    // kind of revenue error nobody notices until month end. A genuinely free invoice is
    // still expressible by passing a discount exactly equal to the subtotal.
    const discount = options.discountMinor ?? 0;
    if (discount < 0)
      throw AppError.badRequest('Discount cannot be negative', { discountMinor: discount });
    if (discount > subtotal) {
      throw AppError.badRequest('Discount cannot exceed the subtotal', {
        discountMinor: discount,
        subtotalMinor: subtotal,
      });
    }

    const total = subtotal - discount;

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
    } & Partial<Pick<PaymentWebhookEvent, 'reference' | 'invoice' | 'subscription'>>,
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
          attempt,
        },
        update: { status: 'SUCCEEDED', failureReason: null },
      });

      // Only mark paid when the payment actually covers the invoice. A partial payment
      // leaving the invoice OPEN is correct; marking it PAID would lose revenue.
      const totalPaid = await this.prisma.payment.aggregate({
        where: { invoiceId: invoice.id, status: 'SUCCEEDED' },
        _sum: { amountMinor: true },
      });

      const covered = (totalPaid._sum.amountMinor ?? 0) >= invoice.totalMinor;

      if (covered && invoice.status !== 'PAID') {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidAt: event.occurredAt },
        });
        await this.prisma.subscription.updateMany({
          where: { id: invoice.subscriptionId ?? undefined, status: 'PAST_DUE' },
          data: { status: 'ACTIVE' },
        });
      }

      return { applied: true, reason: covered ? 'invoice settled' : 'partial payment recorded' };
    }

    if (event.type === 'payment_failed' && event.providerPaymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: event.providerPaymentId },
        include: { invoice: { select: { id: true, subscriptionId: true, totalMinor: true } } },
      });
      if (!payment) return { applied: false, reason: 'unknown payment' };

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      await this.prisma.invoice.update({
        where: { id: payment.invoice.id },
        data: { status: 'FAILED' },
      });

      // A failed payment past the grace period puts the subscription PAST_DUE, which is
      // what triggers the dunning sequence. Access is not cut here — that is the
      // dunning worker's decision after the retries are exhausted.
      if (payment.invoice.subscriptionId) {
        await this.prisma.subscription.updateMany({
          where: { id: payment.invoice.subscriptionId, status: 'ACTIVE' },
          data: { status: 'PAST_DUE' },
        });
      }

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

    if (event.type === 'refund_created' && event.providerPaymentId && event.amountMinor) {
      const payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: event.providerPaymentId },
      });
      if (!payment) return { applied: false, reason: 'unknown payment' };

      // Replay-safe: providers redeliver webhooks, and `Refund` has no unique key to
      // absorb a duplicate. Once the payment is REFUNDED the event has already been
      // applied, so a second delivery is a no-op rather than a second refund row.
      if (payment.status === 'REFUNDED') {
        return { applied: false, reason: 'refund already recorded' };
      }

      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountMinor: event.amountMinor,
          reason: 'Provider refund',
          issuedById: payment.invoiceId,
        },
      });
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'REFUNDED' },
      });
      return { applied: true };
    }

    return { applied: false, reason: `unhandled event ${event.type}` };
  }

  /**
   * The newest subscriptions, invoices and payments with the family's name, so the admin
   * tools pick a record from a list instead of pasting its id (FR-OPS-03).
   */
  async adminLookups() {
    const [subscriptions, invoices, payments] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { status: { not: 'INCOMPLETE' } },
        orderBy: { createdAt: 'desc' },
        take: 200,
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
        orderBy: { createdAt: 'desc' },
        take: 200,
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
        where: { status: { in: ['SUCCEEDED', 'REFUNDED'] } },
        orderBy: { createdAt: 'desc' },
        take: 200,
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

  // ── Price list and plans (FR-OPS-05, tier pricing) ─────────────────────────

  /**
   * Every plan with its standard price and its tier prices in every currency, and the
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
          active: true,
          tierId: true,
          prices: { select: { currency: true, amountMinor: true } },
          tierPrices: { select: { tierId: true, currency: true, amountMinor: true } },
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
      currencies: Object.values(Currency),
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
    currency: string;
    amountMinor: number | null;
    actorId: string;
  }) {
    const currency = input.currency as Currency;
    if (!Object.values(Currency).includes(currency)) {
      throw AppError.badRequest(`Unknown currency ${input.currency}`);
    }
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
      before: { name: plan.name, active: plan.active },
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

    const price = await this.priceFor(subscription.planId, subscription.currency, tierId);
    if (subscription.providerSubscriptionId) {
      await this.payments.changeSubscriptionPlan({
        providerSubscriptionId: subscription.providerSubscriptionId,
        planCode: subscription.plan.code,
        amountMinor: price.amountMinor,
        currency: subscription.currency,
        interval: intervalOf(subscription.plan.billingPeriod),
        when: 'period_end',
      });
    }
    await this.prisma.subscription.update({ where: { id: subscription.id }, data: { tierId } });
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
    subscription: { id: string; status: string; planId: string; providerSyncedAt: Date | null },
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
      },
    });
    if (planId) await this.flagTimesIfNeeded(subscription.id, subscription.planId, planId);
    return { applied: true, reason: `subscription ${status.toLowerCase()}` };
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

    const [from, to] = await Promise.all([
      this.priceFor(subscription.planId, subscription.currency, subscription.tierId),
      this.priceFor(planId, subscription.currency, subscription.tierId),
    ]);
    const upgrade = to.amountMinor > from.amountMinor;
    const result = subscription.providerSubscriptionId
      ? await this.payments.changeSubscriptionPlan({
          providerSubscriptionId: subscription.providerSubscriptionId,
          planCode: plan.code,
          amountMinor: to.amountMinor,
          currency: subscription.currency,
          interval: intervalOf(plan.billingPeriod),
          when: upgrade ? 'now' : 'period_end',
        })
      : { appliedNow: true };

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: result.appliedNow
        ? { planId, pendingPlanId: null, pendingPlanFrom: null }
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
    if (source.paymentId) {
      const existing = await this.prisma.payment.findUnique({
        where: { providerPaymentId: source.paymentId },
      });
      if (!existing) {
        await this.prisma.payment.create({
          data: {
            invoiceId: invoice.id,
            provider: this.providerCode,
            providerPaymentId: source.paymentId,
            method: 'CARD',
            amountMinor: source.amountMinor,
            currency: invoice.currency,
            status: paid ? 'SUCCEEDED' : 'FAILED',
            attempt: 1,
          },
        });
      } else if (paid && existing.status !== 'SUCCEEDED') {
        await this.prisma.payment.update({
          where: { id: existing.id },
          data: { status: 'SUCCEEDED', failureReason: null },
        });
      }
    }
    return invoice;
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
  async refund(input: { paymentId: string; amountMinor: number; reason: string; actorId: string }) {
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

    const providerRefund = await this.payments.refund({
      providerPaymentId: payment.providerPaymentId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      idempotencyKey: `refund:${payment.id}:${alreadyRefunded + input.amountMinor}`,
    });

    const refundRow = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        issuedById: input.actorId,
      },
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

    return refundRow;
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
function money(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
