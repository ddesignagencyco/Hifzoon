import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import {
  Audit,
  CurrentUser,
  Idempotent,
  IdempotencyKey,
  Public,
  type AuthenticatedUser,
  Roles,
} from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { pageQueryShape } from '../../common/dto/page-query.schema';
import { paginated, toPagination } from '../../common/utils/pagination.util';
import { AppConfigService } from '../../config/app-config.service';
import { BillingService } from './billing.service';
import { ClassCreditsService, MAX_CLASS_CREDIT } from './class-credits.service';
import { PayrollService } from './payroll.service';
import { MAX_DISCOUNT_PERCENT } from './pricing';
import { PromoCodesService } from './promo-codes.service';

const checkoutBody = z.object({
  invoiceId: z.string().uuid(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const scheduleChoice = z.object({
  enrolmentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  timeZone: z.string().min(1).max(64),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z
    .array(
      z.object({
        weekday: z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']),
        localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .min(1)
    .max(7),
});

const subscribeBody = z.object({
  familyId: z.string().uuid(),
  planId: z.string().uuid(),
  trialOutcomeId: z.string().uuid().optional(),
  /** The weekly times with the trial teacher; created once the first payment lands. */
  schedule: scheduleChoice.optional(),
  /** Checked now; counted against its limit only once the first payment lands. */
  promoCode: z.string().trim().max(40).optional(),
});

/**
 * "Start with this teacher" without a trial. `schedule` is the shape the continue-after-trial
 * page sends, minus the enrolment (there is none yet) and the teacher (given once, above);
 * those two keys are accepted and dropped if a client sends the full shape.
 */
const startWithTeacherBody = z.object({
  familyId: z.string().uuid(),
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  planId: z.string().uuid(),
  schedule: scheduleChoice.omit({ enrolmentId: true, teacherId: true }),
  promoCode: z.string().trim().max(40).optional(),
});

// Every price is in USD (BILLING_CURRENCY); a `currency` sent by an older client is ignored.
const teacherPricesQuery = z.object({
  teacherId: z.string().uuid(),
});

const quoteBody = subscribeBody.extend({
  /** The teacher the family is choosing, for tier pricing before times are picked. */
  teacherId: z.string().uuid().optional(),
  /** The child, before an enrolment exists ("start with this teacher"), for the sibling rule. */
  studentId: z.string().uuid().optional(),
  /** Times may still be half-picked while the family looks at the price. */
  schedule: scheduleChoice.extend({ slots: scheduleChoice.shape.slots.min(0) }).optional(),
});

const promoShape = {
  percentOff: z.number().int().min(1).max(MAX_DISCOUNT_PERCENT).nullable(),
  amountOffMinor: z.number().int().positive().max(1_000_000_000).nullable(),
  maxRedemptions: z.number().int().min(1).nullable(),
  expiresAt: z.coerce.date().nullable(),
  active: z.boolean(),
  appliesToPlanIds: z.array(z.string().uuid()).max(100),
};
const createPromoBody = z
  .object({ code: z.string().trim().min(3).max(40), ...promoShape })
  .partial({
    percentOff: true,
    amountOffMinor: true,
    maxRedemptions: true,
    expiresAt: true,
    active: true,
    appliesToPlanIds: true,
  });
const updatePromoBody = z
  .object(promoShape)
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

const portalBody = z.object({ familyId: z.string().uuid() });
const changePlanBody = z.object({ planId: z.string().uuid() });
const weeklyTimesBody = scheduleChoice.omit({ teacherId: true });

const cancelBody = z.object({ atPeriodEnd: z.boolean().default(true) });
const pauseBody = z.object({ days: z.number().int().min(1).max(30) });

const invoiceBody = z.object({
  subscriptionId: z.string().uuid(),
  discountMinor: z.number().int().min(0).optional(),
});

const refundBody = z.object({
  paymentId: z.string().uuid(),
  amountMinor: z.number().int().min(1),
  reason: z.string().min(3).max(2000),
});

const writeOffBody = z.object({
  reason: z.string().min(3).max(2000),
});

const setPlanTierBody = z.object({
  tierId: z.string().uuid().nullable(),
});

const periodBody = z.object({
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
});

const markPaidBody = z.object({ payoutReference: z.string().min(1).max(120) });

const classTypeEnum = z.enum(['TRIAL', 'REGULAR', 'CIRCLE', 'EXAM', 'MAKEUP']);
const createRateBody = z.object({
  name: z.string().trim().min(2).max(120),
  currency: z.enum(['USD', 'GBP', 'CAD', 'AUD', 'AED', 'PKR']),
  ratePerClassMinor: z.number().int().min(1).max(10_000_000),
  classType: classTypeEnum.nullable().optional(),
  effectiveFrom: z.coerce.date(),
});
const updateRateBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  ratePerClassMinor: z.number().int().min(1).max(10_000_000).optional(),
  classType: classTypeEnum.nullable().optional(),
  effectiveFrom: z.coerce.date().optional(),
});
const rateActiveBody = z.object({ active: z.boolean() });
const assignRateBody = z.object({ rateId: z.string().uuid().nullable() });
const adjustmentBody = z.object({
  kind: z.enum(['BONUS', 'DEDUCTION']),
  amountMinor: z.number().int().min(1).max(10_000_000),
  reason: z.string().trim().min(3).max(500),
});
const classCreditBody = z.object({
  familyId: z.string().uuid(),
  amountClasses: z.number().int().min(1).max(MAX_CLASS_CREDIT),
  reason: z.string().trim().min(3).max(500),
});
const revokeCreditBody = z.object({ reason: z.string().trim().min(3).max(500) });

const setPriceBody = z.object({
  planId: z.string().uuid(),
  /** Null = the plan's standard price (used for teachers without a tier). */
  tierId: z.string().uuid().nullable(),
  /** Minor units (US cents); null removes a tier price so the standard price applies. */
  amountMinor: z.number().int().positive().max(1_000_000_000).nullable(),
});

const planShape = {
  classesPerWeek: z.number().int().min(1).max(7),
  classMinutes: z.number().int().min(15).max(180),
  roomType: z.enum(['ONE_TO_ONE', 'CIRCLE']),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY']),
  /** Off monthly × months on a prepaid plan; ignored on a monthly one. */
  periodDiscountPercent: z.number().int().min(0).max(MAX_DISCOUNT_PERCENT).optional(),
};
const createPlanBody = z.object({
  code: z.string().regex(/^[A-Za-z0-9_]{2,40}$/),
  name: z.string().min(2).max(120),
  ...planShape,
});
const updatePlanBody = z
  .object({ name: z.string().min(2).max(120), active: z.boolean(), ...planShape })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

/**
 * Family-facing billing (FR-BIL-01, FR-BIL-03, FR-BIL-06, FR-BIL-07).
 *
 * The public plan listing sells the teacher tier a plan guarantees, not a price
 * (point 5 of the Oct 2026 feature set) — a signed-in family sees the real price via
 * `priceFor` once they are proceeding to subscribe. The one public price is a teacher's
 * (`teacher-prices`, Nov 2026): a family choosing a teacher sees what that teacher costs
 * before the trial, without any family discount. Everything that reads or mutates
 * *their* billing requires the subscription, family or invoice to belong to them, which
 * `BillingService.familyBilling` enforces by joining through `family_member` rather
 * than trusting an id from the URL.
 */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: AppConfigService,
  ) {}

  private get webUrl(): string {
    return this.config.value.APP_WEB_URL.replace(/\/$/, '');
  }

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Public plan catalogue — teacher tier, no price (point 5)' })
  plans() {
    return this.billing.listPublicPlans();
  }

  @Get('plans/:id/price')
  @ApiOperation({
    summary: "A plan's real price, in USD",
    description:
      'Not on the public route — revealed once a signed-in family is proceeding to subscribe.',
  })
  async planPrice(
    @Param('id') id: string,
    @Query('teacherId') teacherId?: string,
    @Query('tierId') tierId?: string,
  ) {
    // Tier pricing: the price with this teacher (or tier); the standard price otherwise.
    // `amountMinor` is one billing period after the plan's period discount; `listMinor` is
    // the same months at the monthly price, so the saving can be shown.
    const tier = tierId || (await this.billing.tierOfTeacher(teacherId));
    const { breakdown: _breakdown, ...price } = await this.billing.periodPriceFor(id, tier);
    return price;
  }

  @Public()
  @ZodQuery(teacherPricesQuery)
  @Get('teacher-prices')
  @ApiOperation({
    summary: "One teacher's price for every active plan, before family discounts",
    description:
      'Public, so a family sees the price before booking a trial. Per plan: the monthly ' +
      "price (the teacher's tier price, else the standard price) and one billing period " +
      'after the plan’s period discount. Sibling and promo discounts are not applied here; ' +
      'they are confirmed by `POST /billing/quote` at checkout.',
  })
  teacherPrices(
    @Query(new ZodValidationPipe(teacherPricesQuery)) query: z.infer<typeof teacherPricesQuery>,
  ) {
    return this.billing.teacherPrices(query.teacherId);
  }

  @ZodBody(quoteBody)
  @Post('quote')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'What this family will pay for a plan, with every discount',
    description:
      'Period discount, then the larger of the sibling or promo discount (never both). ' +
      'A promo code is validated (400 with `details.reason`) but not used up.',
  })
  quote(
    @Body(new ZodValidationPipe(quoteBody)) body: z.infer<typeof quoteBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.quote({ ...body, actorId: user.id, actorRoles: user.roles });
  }

  @ZodBody(setPlanTierBody)
  @Patch('plans/:id/tier')
  @Audit({ action: 'bil.plan.tier', targetType: 'plan' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Assign or clear a plan's teacher tier (point 5)" })
  setPlanTier(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setPlanTierBody)) body: z.infer<typeof setPlanTierBody>,
  ) {
    return this.billing.setPlanTier(id, body.tierId);
  }

  @Get('family/payments')
  @ApiOperation({ summary: 'Your payments, newest first, with refunds (M29)' })
  familyPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.familyPayments(user.id);
  }

  @Get('family')
  @ApiOperation({ summary: 'Your subscriptions and invoices' })
  family(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.familyBilling(user.id);
  }

  @ZodBody(checkoutBody)
  @Post('checkout')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a hosted checkout for an invoice' })
  checkout(
    @Body(new ZodValidationPipe(checkoutBody)) body: z.infer<typeof checkoutBody>,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Charging twice because a client retried is worse than refusing a charge, so the
    // key is mandatory here rather than defaulted to something derived.
    if (!idempotencyKey) {
      throw AppError.badRequest('An Idempotency-Key header is required for payment operations');
    }
    return this.billing.startCheckout(
      body.invoiceId,
      body.successUrl,
      body.cancelUrl,
      idempotencyKey,
      user.id,
      user.roles,
    );
  }

  @ZodBody(subscribeBody)
  @Post('subscribe')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'bil.subscribe', targetType: 'subscription' })
  @ApiOperation({ summary: 'Subscribe a family to a plan' })
  subscribe(
    @Body(new ZodValidationPipe(subscribeBody)) body: z.infer<typeof subscribeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.subscribe({
      ...body,
      actorId: user.id,
      actorRoles: user.roles,
      returnBaseUrl: this.webUrl,
    });
  }

  @ZodBody(startWithTeacherBody)
  @Post('start-with-teacher')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'bil.start_with_teacher', targetType: 'subscription' })
  @ApiOperation({
    summary: 'Start regular classes with a teacher without a trial',
    description:
      'One child, course, teacher, plan and weekly times; returns the hosted checkout. The ' +
      'enrolment goes ACTIVE and the weekly classes are created once the first payment lands.',
  })
  startWithTeacher(
    @Body(new ZodValidationPipe(startWithTeacherBody)) body: z.infer<typeof startWithTeacherBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.startWithTeacher({
      ...body,
      actorId: user.id,
      actorRoles: user.roles,
      returnBaseUrl: this.webUrl,
    });
  }

  @Get('offers')
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Trial results waiting for the family to continue (FR-ADM-05)',
    description:
      'Level, teacher and the recommended plan with its price, for each child whose trial ' +
      'was won and who is not on a paid plan yet.',
  })
  offers(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.trialOffers(user.id);
  }

  @Post('subscriptions/:id/sync')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-read a subscription and its invoices from the payment provider',
    description:
      'Recovers from a lost or delayed webhook. Called by the checkout success page, the ' +
      'hourly reconcile job and the admin console.',
  })
  sync(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.syncSubscription(id, user.id, user.roles);
  }

  @ZodBody(changePlanBody)
  @Post('subscriptions/:id/change-plan')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move to another plan',
    description:
      'A dearer plan applies now and the difference is charged straight away; a cheaper ' +
      'one starts when the paid period ends (`pendingPlanId`, `pendingPlanFrom`).',
  })
  changePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changePlanBody)) body: z.infer<typeof changePlanBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.changePlan(id, body.planId, user.id, user.roles);
  }

  @ZodBody(weeklyTimesBody)
  @Post('subscriptions/:id/weekly-times')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move the regular classes to new weekly times with the same teacher (R18)',
    description:
      'Exactly the plan’s classes a week, one per day. The old weekly classes from `startsOn` ' +
      'are cancelled; if the new ones cannot be created the old ones are restored.',
  })
  weeklyTimes(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(weeklyTimesBody)) body: z.infer<typeof weeklyTimesBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.changeWeeklyTimes(id, body, user.id, user.roles);
  }

  @Post('subscriptions/:id/keep')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw a cancellation before the paid period ends' })
  keep(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.undoCancel(id, user.id, user.roles);
  }

  @ZodBody(portalBody)
  @Post('portal')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hosted page to update the card and download receipts (FR-PAR-06)' })
  portal(
    @Body(new ZodValidationPipe(portalBody)) body: z.infer<typeof portalBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.billingPortal(
      body.familyId,
      `${this.webUrl}/parent/billing`,
      user.id,
      user.roles,
    );
  }

  @ZodBody(cancelBody)
  @Post('subscriptions/:id/cancel')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'bil.subscription.cancel', targetType: 'subscription' })
  @ApiOperation({ summary: 'Cancel a subscription (defaults to period end)' })
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelBody)) body: z.infer<typeof cancelBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.cancel(id, body.atPeriodEnd, user.id, user.roles);
  }

  @ZodBody(pauseBody)
  @Post('subscriptions/:id/pause')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'bil.subscription.pause', targetType: 'subscription' })
  @ApiOperation({ summary: 'Pause a subscription for up to 30 days' })
  pause(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(pauseBody)) body: z.infer<typeof pauseBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.pause(id, body.days, user.id, user.roles);
  }

  @Post('subscriptions/:id/resume')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'bil.subscription.resume', targetType: 'subscription' })
  @ApiOperation({ summary: 'Resume a paused subscription' })
  resume(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.resume(id, user.id, user.roles);
  }
}

const invoiceListQuery = z.object({
  ...pageQueryShape,
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'FAILED', 'REFUNDED', 'VOID']).optional(),
  source: z.enum(['CARD', 'MANUAL']).optional(),
});

/**
 * Operations billing (FR-BIL-03..05, BIL-FE-01).
 *
 * Admin-only: issuing an invoice, refunding, and running dunning are all financial
 * operations that must not be reachable by a role that also handles marketing. Refunds
 * in particular are `ADMIN`+ but not `SUPERVISOR`.
 */
@ApiTags('admin/billing')
@ApiBearerAuth()
@Controller('admin/billing')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly promos: PromoCodesService,
    private readonly credits: ClassCreditsService,
  ) {}

  @Get('promo-codes')
  @ApiOperation({ summary: 'Every promo code with how often it has been redeemed' })
  promoCodes() {
    return this.promos.list();
  }

  @ZodBody(createPromoBody)
  @Post('promo-codes')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a promo code (super admin)' })
  createPromo(
    @Body(new ZodValidationPipe(createPromoBody)) body: z.infer<typeof createPromoBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promos.create(body, user.id);
  }

  @ZodBody(updatePromoBody)
  @Patch('promo-codes/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Edit a promo code (super admin)',
    description: 'Its discount is fixed once a family has redeemed it; limits and expiry are not.',
  })
  updatePromo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePromoBody)) body: z.infer<typeof updatePromoBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promos.update(id, body, user.id);
  }

  @Delete('promo-codes/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a promo code nobody has used (super admin)' })
  deletePromo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.promos.remove(id, user.id);
  }

  @Get('lookups')
  @ApiOperation({
    summary: 'Newest subscriptions, invoices and payments with family names',
    description: 'Lets the admin tools offer a list to choose from instead of a pasted id.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Family name or invoice number' })
  lookups(@Query('q') q?: string) {
    return this.billing.adminLookups({ q: q?.slice(0, 120) });
  }

  @ZodQuery(invoiceListQuery)
  @Get('invoices')
  @ApiOperation({
    summary: 'All invoices, newest first — paginated, filterable by status and source',
  })
  async invoices(
    @Query(new ZodValidationPipe(invoiceListQuery)) query: z.infer<typeof invoiceListQuery>,
  ) {
    const params = toPagination(query);
    const { items, total } = await this.billing.listInvoices({
      status: query.status,
      source: query.source,
      skip: params.skip,
      take: params.take,
    });
    return paginated(items, params, total);
  }

  @Get('prices')
  @ApiOperation({
    summary: 'Every plan with its standard and tier prices in USD (FR-OPS-05)',
  })
  prices() {
    return this.billing.adminPriceList();
  }

  @ZodBody(setPriceBody)
  @Put('prices')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Set a standard or tier price (super admin)',
    description:
      'Existing subscriptions keep their price; new subscriptions and plan changes use it.',
  })
  setPrice(
    @Body(new ZodValidationPipe(setPriceBody)) body: z.infer<typeof setPriceBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.setPrice({ ...body, actorId: user.id });
  }

  @ZodBody(createPlanBody)
  @Post('plans')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a plan (super admin)' })
  createPlan(
    @Body(new ZodValidationPipe(createPlanBody)) body: z.infer<typeof createPlanBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.createPlan(body, user.id);
  }

  @ZodBody(updatePlanBody)
  @Patch('plans/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Rename, show/hide, or (before anyone subscribes) reshape a plan' })
  updatePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlanBody)) body: z.infer<typeof updatePlanBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.updatePlan(id, body, user.id);
  }

  @ZodBody(invoiceBody)
  @Post('invoices')
  @Audit({ action: 'bil.invoice.issue', targetType: 'invoice' })
  @ApiOperation({ summary: 'Issue an invoice for a subscription' })
  invoice(
    @Body(new ZodValidationPipe(invoiceBody)) body: z.infer<typeof invoiceBody>,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idempotencyKey) {
      throw AppError.badRequest('An Idempotency-Key header is required to issue an invoice');
    }
    return this.billing.invoiceSubscription(body.subscriptionId, user.id, {
      discountMinor: body.discountMinor,
      idempotencyKey,
    });
  }

  @ZodBody(refundBody)
  @Post('refunds')
  @Audit({ action: 'bil.refund', targetType: 'refund' })
  @ApiOperation({ summary: 'Refund a payment (full or partial)' })
  refund(
    @Body(new ZodValidationPipe(refundBody)) body: z.infer<typeof refundBody>,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idempotencyKey) {
      throw AppError.badRequest('An Idempotency-Key header is required to refund a payment');
    }
    return this.billing.refund({ ...body, actorId: user.id, idempotencyKey });
  }

  @Get('class-credits')
  @ApiOperation({ summary: 'Class credits given to a family, newest first, with the total' })
  @ApiQuery({ name: 'familyId', required: true })
  classCredits(@Query('familyId', new ParseUUIDPipe()) familyId: string) {
    return this.credits.listForFamily(familyId);
  }

  @ZodBody(classCreditBody)
  @Post('class-credits')
  @Audit({ action: 'bil.classCredit.issue', targetType: 'class_credit', captureBody: false })
  @ApiOperation({ summary: 'Give a family complimentary classes (Idempotency-Key required)' })
  issueClassCredit(
    @Body(new ZodValidationPipe(classCreditBody)) body: z.infer<typeof classCreditBody>,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!idempotencyKey) {
      throw AppError.badRequest('An Idempotency-Key header is required to issue a class credit');
    }
    return this.credits.issue({ ...body, idempotencyKey }, user.id);
  }

  @ZodBody(revokeCreditBody)
  @Post('class-credits/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'bil.classCredit.revoke', targetType: 'class_credit', captureBody: false })
  @ApiOperation({ summary: 'Remove a class credit given by mistake (super admin)' })
  revokeClassCredit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(revokeCreditBody)) body: z.infer<typeof revokeCreditBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.credits.revoke(id, body.reason, user.id);
  }

  @ZodBody(writeOffBody)
  @Post('invoices/:invoiceId/write-off')
  @Audit({ action: 'bil.invoice.writeOff', targetType: 'invoice' })
  @ApiOperation({ summary: 'Write off an invoice the family will never pay' })
  writeOff(
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodValidationPipe(writeOffBody)) body: z.infer<typeof writeOffBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.writeOffInvoice({ invoiceId, ...body, actorId: user.id });
  }

  @Post('dunning/run')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'bil.dunning.run', targetType: 'invoice' })
  @ApiOperation({ summary: 'Run the dunning sweep' })
  dunning(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.runDunning(user.id);
  }
}

/**
 * Payroll (FR-PAY-01..04, PAY-FE-01).
 */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('my-payslips')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Your own payslips' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const params = toPagination({ page, limit });
    const { items, total } = await this.payroll.teacherPayslips(user.id, {
      skip: params.skip,
      take: params.take,
    });
    return paginated(items, params, total);
  }

  @Get('rates')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Pay rates, with how many teachers are on each' })
  @ApiQuery({ name: 'includeInactive', required: false })
  rates(@Query('includeInactive') includeInactive?: string) {
    return this.payroll.listRates({ includeInactive: includeInactive === 'true' });
  }

  @ZodBody(createRateBody)
  @Post('rates')
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'pay.rate.create', targetType: 'pay_rate', captureBody: false })
  @ApiOperation({ summary: 'Create a pay rate' })
  createRate(
    @Body(new ZodValidationPipe(createRateBody)) body: z.infer<typeof createRateBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.createRate(body, user.id);
  }

  @ZodBody(updateRateBody)
  @Patch('rates/:id')
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'pay.rate.update', targetType: 'pay_rate', captureBody: false })
  @ApiOperation({ summary: 'Edit a pay rate (applies to periods calculated from now on)' })
  updateRate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateRateBody)) body: z.infer<typeof updateRateBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.updateRate(id, body, user.id);
  }

  @ZodBody(rateActiveBody)
  @Post('rates/:id/active')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Switch a pay rate on or off (off only when no teacher is on it)' })
  setRateActive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(rateActiveBody)) body: z.infer<typeof rateActiveBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.setRateActive(id, body.active, user.id);
  }

  @ZodBody(assignRateBody)
  @Put('teachers/:teacherId/rate')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Put a teacher on a pay rate, or clear it with { rateId: null }' })
  assignRate(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
    @Body(new ZodValidationPipe(assignRateBody)) body: z.infer<typeof assignRateBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.assignRate(teacherId, body.rateId, user.id);
  }

  @Get('periods')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Payroll periods, newest first' })
  periods() {
    return this.payroll.listPeriods();
  }

  @ZodBody(periodBody)
  @Post('periods')
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'pay.period.open', targetType: 'payroll_period' })
  @ApiOperation({ summary: 'Open a payroll period' })
  openPeriod(
    @Body(new ZodValidationPipe(periodBody)) body: z.infer<typeof periodBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.openPeriod(body.startsOn, body.endsOn, user.id);
  }

  @Post('periods/:id/calculate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'pay.period.calculate', targetType: 'payroll_period' })
  @ApiOperation({ summary: 'Calculate a payroll period (OPEN periods only)' })
  calculate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payroll.calculatePeriod(id, user.id);
  }

  @Get('periods/:id/report')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Payroll period report with totals' })
  report(@Param('id') id: string) {
    return this.payroll.periodReport(id);
  }

  @Get('periods/:id/export.csv')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Download a calculated period as CSV for the payout run',
    description: 'Moves a CALCULATED period to EXPORTED (closed to adjustments).',
  })
  async exportCsv(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.payroll.exportPeriodCsv(id, user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @ZodBody(adjustmentBody)
  @Post('entries/:id/adjustments')
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'pay.entry.adjust', targetType: 'payroll_entry', captureBody: false })
  @ApiOperation({ summary: 'Add a manual bonus or deduction, with a reason, to an unpaid entry' })
  addAdjustment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(adjustmentBody)) body: z.infer<typeof adjustmentBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.addAdjustment(id, body, user.id);
  }

  @ZodBody(markPaidBody)
  @Post('entries/:id/paid')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'pay.entry.paid', targetType: 'payroll_entry' })
  @ApiOperation({ summary: 'Mark a payroll entry paid' })
  markPaid(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markPaidBody)) body: z.infer<typeof markPaidBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payroll.markPaid(id, body.payoutReference, user.id);
  }
}
