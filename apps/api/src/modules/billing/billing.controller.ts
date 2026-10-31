import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AppConfigService } from '../../config/app-config.service';
import { BillingService } from './billing.service';
import { PayrollService } from './payroll.service';

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
  currency: z.string().length(3),
  trialOutcomeId: z.string().uuid().optional(),
  /** The weekly times with the trial teacher; created once the first payment lands. */
  schedule: scheduleChoice.optional(),
});

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

const setPriceBody = z.object({
  planId: z.string().uuid(),
  /** Null = the plan's standard price (used for teachers without a tier). */
  tierId: z.string().uuid().nullable(),
  currency: z.string().length(3),
  /** Minor units; null removes a tier price so the standard price applies. */
  amountMinor: z.number().int().positive().max(1_000_000_000).nullable(),
});

const planShape = {
  classesPerWeek: z.number().int().min(1).max(7),
  classMinutes: z.number().int().min(15).max(180),
  roomType: z.enum(['ONE_TO_ONE', 'CIRCLE']),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY']),
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
 * `priceFor` once they are proceeding to subscribe. Everything that reads or mutates
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
    summary: "A plan's real price, by currency",
    description:
      'Not on the public route — revealed once a signed-in family is proceeding to subscribe.',
  })
  async planPrice(
    @Param('id') id: string,
    @Query('currency') currency: string,
    @Query('teacherId') teacherId?: string,
    @Query('tierId') tierId?: string,
  ) {
    // Tier pricing: the price with this teacher (or tier); the standard price otherwise.
    const tier = tierId || (await this.billing.tierOfTeacher(teacherId));
    return this.billing.priceFor(id, currency, tier);
  }

  @ZodBody(setPlanTierBody)
  @Patch('plans/:id/tier')
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
  constructor(private readonly billing: BillingService) {}

  @Get('lookups')
  @ApiOperation({
    summary: 'Newest subscriptions, invoices and payments with family names',
    description: 'Lets the admin tools offer a list to choose from instead of a pasted id.',
  })
  lookups() {
    return this.billing.adminLookups();
  }

  @Get('prices')
  @ApiOperation({ summary: 'Every plan with its standard and tier prices in every currency (FR-OPS-05)' })
  prices() {
    return this.billing.adminPriceList();
  }

  @ZodBody(setPriceBody)
  @Put('prices')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Set a standard or tier price (super admin)',
    description: 'Existing subscriptions keep their price; new subscriptions and plan changes use it.',
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.invoiceSubscription(body.subscriptionId, user.id, {
      discountMinor: body.discountMinor,
    });
  }

  @ZodBody(refundBody)
  @Post('refunds')
  @Audit({ action: 'bil.refund', targetType: 'refund' })
  @ApiOperation({ summary: 'Refund a payment (full or partial)' })
  refund(
    @Body(new ZodValidationPipe(refundBody)) body: z.infer<typeof refundBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.refund({ ...body, actorId: user.id });
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
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.payroll.teacherPayslips(user.id);
  }

  @Get('rates')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Pay rates' })
  rates() {
    return this.payroll.listRates();
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
