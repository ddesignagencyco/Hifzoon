import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from '../../common/decorators';
import { WebhooksService } from './webhooks.service';

/**
 * Provider webhook endpoints (TRD section 5.1).
 *
 * `@Public()` because a provider carries no session; `@SkipThrottle()` because the
 * provider retries on a schedule we do not control and a 429 would look like a delivery
 * failure on their side. Authorisation is the HMAC signature the adapter verifies over
 * the raw body — hence `RawBodyRequest`, populated by the raw-body capture in `main.ts`.
 */
@ApiTags('webhooks')
@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Public()
  @Post('payments')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment provider webhook (signature verified, idempotent)' })
  payments(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.webhooks.payments(req.rawBody, signature);
  }

  @Public()
  @Post('video')
  @HttpCode(200)
  @ApiOperation({ summary: 'Video provider webhook for recording lifecycle' })
  video(@Req() req: RawBodyRequest<Request>, @Headers('authorization') signature?: string) {
    return this.webhooks.video(req.rawBody, signature);
  }

  /**
   * WhatsApp delivery receipts (FR-NTF-03).
   *
   * Meta signs this with `X-Hub-Signature-256: sha256=<hmac of the raw body>` using the
   * app secret — not a bearer token, so the header is read here and handed to the
   * adapter for verification over the untouched bytes.
   *
   * This endpoint is the *only* evidence that a parent actually received a message about
   * their child's class: a 200 from the send API means accepted, not delivered.
   */
  @Public()
  @Post('whatsapp')
  @HttpCode(200)
  @ApiOperation({
    summary: 'WhatsApp delivery receipts (signature verified, monotonic)',
    description:
      'Reconciles delivery status against the notification row recorded at send time. ' +
      'Duplicate and out-of-order receipts are ignored rather than applied.',
  })
  whatsapp(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    return this.webhooks.whatsapp(req.rawBody, signature);
  }
}
