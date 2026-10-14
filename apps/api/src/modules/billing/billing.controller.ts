import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { BillingService } from './billing.service';
import { PayrollService } from './payroll.service';

const checkoutBody = z.object({
  invoiceId: z.string().uuid(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const subscribeBody = z.object({
  familyId: z.string().uuid(),
  planId: z.string().uuid(),
  currency: z.string().length(3),
  trialOutcomeId: z.string().uuid().optional(),
});

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

const periodBody = z.object({
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
});

const markPaidBody = z.object({ payoutReference: z.string().min(1).max(120) });

/**
 * Family-facing billing (FR-BIL-01, FR-BIL-03, FR-BIL-06, FR-BIL-07).
 *
 * `planId` prices are public so a parent can compare before registering; everything
 * that reads or mutates *their* billing requires the subscription, family or invoice to
 * belong to them, which `BillingService.familyBilling` enforces by joining through
 * `family_member` rather than trusting an id from the URL.
 */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Public plan catalogue with prices' })
  plans(@Query('currency') currency?: string) {
    return this.billing.listPlans(currency);
  }

  @Get('family')
  @ApiOperation({ summary: 'Your subscriptions and invoices' })
  family(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.familyBilling(user.id);
  }

  @ZodBody(checkoutBody)
  @Post('checkout')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a hosted checkout for an invoice' })
  checkout(
    @Body(new ZodValidationPipe(checkoutBody)) body: z.infer<typeof checkoutBody>,
    @IdempotencyKey() idempotencyKey: string,
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
    );
  }

  @ZodBody(subscribeBody)
  @Post('subscribe')
  @Audit({ action: 'bil.subscribe', targetType: 'subscription' })
  @ApiOperation({ summary: 'Subscribe a family to a plan' })
  subscribe(
    @Body(new ZodValidationPipe(subscribeBody)) body: z.infer<typeof subscribeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.subscribe({ ...body, actorId: user.id });
  }

  @ZodBody(cancelBody)
  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'bil.subscription.cancel', targetType: 'subscription' })
  @ApiOperation({ summary: 'Cancel a subscription (defaults to period end)' })
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelBody)) body: z.infer<typeof cancelBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.cancel(id, body.atPeriodEnd, user.id);
  }

  @ZodBody(pauseBody)
  @Post('subscriptions/:id/pause')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'bil.subscription.pause', targetType: 'subscription' })
  @ApiOperation({ summary: 'Pause a subscription for up to 30 days' })
  pause(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(pauseBody)) body: z.infer<typeof pauseBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.pause(id, body.days, user.id);
  }

  @Post('subscriptions/:id/resume')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'bil.subscription.resume', targetType: 'subscription' })
  @ApiOperation({ summary: 'Resume a paused subscription' })
  resume(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.resume(id, user.id);
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
